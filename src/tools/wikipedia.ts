import { z } from 'zod';
import { BaseAPITool } from './api.js';
import * as wtf from 'wtf_wikipedia';

export const WikipediaInputSchema = z.object({
    title: z.string().describe("The Wikipedia page title to fetch."),
    type: z.enum(['summary', 'all']).describe("The type of data to fetch."),
});

export const WikipediaOutputSchema = z.object({
    success: z.boolean().describe("Whether the API call was successful."),
    content: z.object({
        title: z.string().optional().describe("The title of the page."),
        url: z.string().optional().describe("The URL of the page."),
        pageID: z.number().describe("The Wikipedia page ID."),
        text: z.string().describe("The text content of the page."),
        links: z.array(z.object({
            type: z.string().optional().describe("The type of link."),
            page: z.string().optional().describe("The page linked to."),
            text: z.string().optional().describe("The text of the link."),
        })).describe("The links in the page."),
        references: z.array(z.object({
            url: z.string().optional().describe("The URL of the reference."),
            work: z.string().optional().describe("The work cited."),
            title: z.string().optional().describe("The title of the reference."),
            type: z.string().optional().describe("The type of reference."),
            year: z.number().optional().describe("The year of the reference."),
            publisher: z.string().optional().describe("The publisher of the reference."),
        })).describe("The references in the page."),
    }).optional()
});

export class WikipediaAPITool extends BaseAPITool<typeof WikipediaInputSchema, typeof WikipediaOutputSchema> {
    inputSchema = WikipediaInputSchema;
    name = 'WikipediaAPITool';
    description = 'GET a Wikipedia page summary or full text.';
    baseURL = 'https://en.wikipedia.org/w/api.php';

    async toolCallback(params: z.infer<typeof WikipediaInputSchema>) : Promise<z.infer<typeof WikipediaOutputSchema>> {
        // TODO: fix wtf module
        let doc = await (wtf as any).default.fetch(params.title, { follow_redirects: true });
        if (!doc) {
            // TODO: throw error?
            return { success: false };
        }
        if (Array.isArray(doc)) {
            doc = doc[0];
        }
        const content = {
            pageID: doc.pageID() || -1,
            title: doc.title() || params.title,
            url: doc.url() || "",
            text: doc.text(),
            links: doc.links().map((link:any) => link.json()),
            references: doc.references().map((ref:any) => ref.json())
        }
        return { success: true, content };
    }
}
