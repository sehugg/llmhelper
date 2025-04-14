
import { logger } from "../llm.js";
import { FetchOutputSchema, FetchTool } from "../tools/fetch.js";
import { z } from "zod";

export interface SearchItem {
    url: string;
    title: string;
    tool_name: string;
    tool_call: () => Promise<SearchResult>;
}

export interface SearchResult {
    url: string;
    title: string;
    tool: string;
    content: any;
    links: SearchItem[];
}

export class Searcher {
    visited = new Set<string>();
    open : SearchItem[] = [];
    results : SearchResult[] = [];
    fetchTool = new FetchTool();

    addItem(item: SearchItem) {
        if (!this.visited.has(item.url) && !this.open.find(i => i.url === item.url)) {
            this.open.push(item);
            this.visited.add(item.url);
        }
    }
    addURL(url: string, title?: string) {
        this.addItem({
            url,
            title: title || url,
            tool_name: 'fetch',
            tool_call: async () => {
                const result = await this.fetchTool.toolCallback({ url });
                return this.fetchToSearchResult(result);
            }
        });
    }
    fetchToSearchResult(out: z.infer<typeof FetchOutputSchema>) : SearchResult {
        const title = out.title || out.url;
        const links = out.links?.map(link => {
            return {
                url: link.url,
                title: link.text,
                tool_name: 'fetch',
                tool_call: async () => {
                    const result = await this.fetchTool.toolCallback({ url: link.url });
                    return this.fetchToSearchResult(result);
                }
            };
        });
        return {
            url: out.url,
            title,
            tool: out.tool,
            content: out.text,
            links: links || []
        };
    }
    addFetchResult(out: z.infer<typeof FetchOutputSchema>) {
        const result = this.fetchToSearchResult(out);
        this.results.push(result);
    }
    async fetchNext() {
        let next = this.results.shift();
        if (!next) {
            let nextitem;
            while (nextitem = this.open.shift()) {
                try {
                    // TODO: cache tool results
                    next = await logger.indefiniteTask(nextitem.tool_call(), `Fetching ${nextitem.url}`);
                    break;
                } catch (e) {
                    console.error("Error fetching:", nextitem.url, e);
                }
            }
        }
        return next;
    }
}