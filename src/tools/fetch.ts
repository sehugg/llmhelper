import { z } from 'zod';
import { WebTool } from './web.js';
import { WikipediaAPITool } from './wikipedia.js';
import Parser from 'rss-parser';
import { addSecretsToQueryString } from '../config.js';
import { LLMToolImpl, LLMToolSideEffects } from '../types.js';
import { YoutubeTranscript } from 'youtube-transcript';

export const FetchInputSchema = z.object({
    url: z.string().url().describe("The URL to visit.")
});

export const FetchOutputSchema = z.object({
    tool: z.string().describe("The tool that fetched the URL."),
    url: z.string().url().describe("The fetched URL."),
    title: z.string().optional().describe("The title of the page."),
    text: z.any().describe("The textual content."),
    links: z.array(z.object({
        url: z.string().url().describe("The URL of the link."),
        text: z.string().describe("The text of the link.")
    })).optional().describe("Links from this URL.")
});

export interface FetchHandler {
    matches(url: string): boolean;
    fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>>;
}

class YoutubeTranscriptHandler implements FetchHandler {
    matches(url: string): boolean {
        return url.startsWith('https://www.youtube.com/watch?v=');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const response = await YoutubeTranscript.fetchTranscript(url);
        if (!response?.length) {
            throw new Error(`Failed to fetch YouTube video from ${url}`);
        }
        return {
            tool: 'youtube',
            url,
            text: response.reduce((acc, val) => acc + val.text + '\n', '') // TODO: decode xml entities?
        };
    }
}

class JSONHandler implements FetchHandler {
    matches(url: string): boolean {
        return url.endsWith('.json');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch JSON from ${url}`);
        }
        const json = await response.json();
        return {
            tool: 'json',
            url,
            text: json
        };
    }
}

class WikipediaHandler implements FetchHandler {
    private wikipediaTool = new WikipediaAPITool();

    matches(url: string): boolean {
        return url.startsWith('https://en.wikipedia.org/wiki/');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const title = decodeURIComponent((url.split('/').pop() || '').replace(/_/g, ' '));
        const result = await this.wikipediaTool.toolCallback({ title, type: 'all' });
        if (!result.success || !result.content) {
            throw new Error(`Wikipedia API did not return content. Page "${url}" does not exist?`);
        }
        const internal_links = result.content.links.filter(link => link.page && link.type == 'internal').map(link => ({
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(link.page!.replace(/ /g, '_'))}`,
            text: link.text || '',
        }));
        const external_links = result.content.references.filter(ref => ref.url).map(ref => ({
            url: ref.url!,
            text: ref.title || '',
            ...ref
        }));
        return {
            tool: 'wikipedia',
            url: result.content.url || url,
            title: result.content.title,
            text: result.content.text,
            links: [...internal_links, ...external_links]
        };
    }
}

class PDFHandler implements FetchHandler {
    matches(url: string): boolean {
        return url.endsWith('.pdf');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF from ${url}`);
        }
        const { PdfReader } = await import('pdfreader'); // TODO
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const pdf = new PdfReader();
        const allitems: string[] = [];
        const pageitems = new Map<number, string[]>();
        await new Promise((resolve, reject) => {
            pdf.parseBuffer(buffer, (err: any, item: any) => {
                if (err) {
                    reject(err);
                } else if (!item) {
                    resolve(true);
                } else if (item.page) {
                    const pagelines = Array.from(pageitems.entries());
                    pagelines.sort((a, b) => a[0] - b[0]);
                    allitems.push(...pagelines.map(([_, f]) => f.join(' ')));
                    pageitems.clear();
                } else if (item.text) {
                    const text = item.text;
                    if (text) {
                        const pi = pageitems.get(item.y) || [];
                        pi.push(text);
                        pageitems.set(item.y, pi);
                    }
                }
            });
        });
        return {
            tool: 'pdfreader',
            url,
            text: allitems.join('\n')
        };
    }
}

class RSSHandler implements FetchHandler {
    matches(url: string): boolean {
        return url.endsWith('.rss') || url.endsWith('/rss') || url.endsWith('/atom.xml') || url.endsWith('/feed.xml');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const parser = new Parser();
        const feed = await parser.parseURL(url);
        return {
            tool: 'rss',
            url: feed.feedUrl || url,
            title: feed.title,
            text: feed.description,
            links: feed.items.map(item => ({
                url: item.link || '',
                text: item.title || '',
                ...item
            }))
        };
    }
}

class GoogleCustomSearchHandler implements FetchHandler {
    matches(url: string): boolean {
        return url.startsWith('https://www.googleapis.com/customsearch/v1');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const response = await fetch(addSecretsToQueryString(url));
        if (!response.ok) {
            throw new Error(`Failed to fetch Google Custom Search from ${url}`);
        }
        const json = await response.json();
        const items = json.items || [];
        const links = items.map((item: any) => ({
            url: item.link,
            text: item.title
        }));
        return {
            tool: 'googleapis',
            url,
            links
        };
    }
}

class WaybackHandler implements FetchHandler {
    matches(url: string): boolean {
        return url.startsWith('https://archive.org/wayback/available?url=');
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Wayback Machine links from ${url}`);
        }
        const json = await response.json();
        const links = json?.archived_snapshots?.closest?.url ? [{
            url: json.archived_snapshots.closest.url,
            text: 'Closest snapshot from ' + json.archived_snapshots.closest.timestamp
        }] : [];
        return {
            tool: 'webarchive',
            url,
            links
        };
    }
}

class WebHandler implements FetchHandler {
    private webTool = new WebTool();

    matches(url: string): boolean {
        return true; // This is the fallback handler
    }

    async fetch(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        const result = await this.webTool.fetchPage(url);
        return {
            tool: 'web',
            ...result
        };
    }
}

export class FetchTool extends LLMToolImpl<typeof FetchInputSchema, typeof FetchOutputSchema> {
    inputSchema = FetchInputSchema;
    name = 'FetchTool';
    description = 'Fetch the content of a URL. Do not include API keys or other secrets, they will be supplied.';
    sideEffects: LLMToolSideEffects = 'idempotent';

    private handlers: FetchHandler[] = [
        new WikipediaHandler(),
        new GoogleCustomSearchHandler(),
        new YoutubeTranscriptHandler(),
        new WaybackHandler(),
        new JSONHandler(),
        new PDFHandler(),
        new RSSHandler(),
        new WebHandler(), // This should be last as it's the fallback
    ];

    async fetchPage(url: string): Promise<z.infer<typeof FetchOutputSchema>> {
        for (const handler of this.handlers) {
            if (handler.matches(url)) {
                return handler.fetch(url);
            }
        }
        throw new Error(`No handler found for URL: ${url}`);
    }

    toolCallback(params: { url: string; }) {
        return this.fetchPage(params.url);
    }
    
    async isAvailableOnWaybackMachine(url: string): Promise<string> {
        const waybackUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
        const response = await fetch(waybackUrl);
        if (!response.ok) {
            throw new Error(`Failed to check Wayback Machine for ${url}`);
        }
        const json = await response.json();
        return json?.archived_snapshots?.closest?.url || '';
    }
}
