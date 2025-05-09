import { Browser, chromium, Page } from 'playwright';
import { z } from 'zod';
import { LLMToolImpl, LLMToolSideEffects } from '../types.js';
import { JSDOM } from 'jsdom';

export const WebInputSchema = z.object({
    url: z.string().url().describe("The URL to visit.")
});

export const WebOutputSchema = z.object({
    url: z.string().url().describe("The fetched URL of the page."),
    title: z.string().describe("The title of the page."),
    text: z.any().describe("The textual page content."),
    links: z.array(z.object({
        url: z.string().url().describe("The URL of the link."),
        text: z.string().describe("The text of the link.")
    })).describe("The list of links on the page.")
});

async function fetchFromURL(url: string) {
    var { Readability } = await import('@mozilla/readability');
    // TODO: using?
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const response = await page.goto(url);
    const newUrl = page.url();
    const html = await page.content();
    const _rsslinks = await page.$$eval('link[rel="alternate"]', (as) => as.map(a => a instanceof HTMLElement && a.getAttribute("href")));
    const feedlinks = _rsslinks.filter(l => l).map(l => { return { url: l } });
    if (feedlinks.length) {
        console.log('Feed links:', feedlinks);
    }
    try {
        const originalDocument = new JSDOM(html);
        let article = new Readability(originalDocument.window.document).parse();
        if (!article) throw new Error('No article found');
        const title = article.title+"";
        const text = article.textContent;
        const doc = new JSDOM(article.content+"").window.document;
        const ahrefs = doc.getElementsByTagName('a');
        const links = Array.from(ahrefs).map(a => { return { url: a.href, text: a.innerText } });
        return { url: newUrl, title, text, links };
    } catch (e) {
        // page.title: Execution context was destroyed, most likely because of a navigation
        console.error('WebTool: Error parsing page: ' + e);
        const links = await page.$$eval('a', (as) => as.map(a => { return { url: a.href, text: a.innerText } }));
        const title = await page.title();
        const text = await page.innerText('body');
        const newUrl = page.url();
        // TODO const rss = await page.$$eval('link[type="application/rss+xml"]', (as) => as.map(a => a.href));
        return { url: newUrl, title, text, links };
    } finally {
        browser.close().catch((e) => { console.error(e); });
    }
}

export class WebTool extends LLMToolImpl<typeof WebInputSchema, typeof WebOutputSchema> {
    inputSchema = WebInputSchema;
    name = 'WebTool';
    description = 'Open a browser and go to an URL.';
    sideEffects : LLMToolSideEffects = 'idempotent';

    async toolCallback(params: z.infer<typeof WebInputSchema>): Promise<z.infer<typeof WebOutputSchema>> {
        return this.fetchPage(params.url);
    }

    async fetchPage(url: string) {
        return fetchFromURL(url);
    }
}
