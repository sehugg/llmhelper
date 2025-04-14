import { z } from 'zod';
import { LLMSchema, LLMToolImpl, LLMToolSideEffects } from "../types.js";
import { KBDatabase, KBQueryResult, KBQueryResultSchema } from "../kb.js";

export const KBSearchInputSchema = z.object({
    query: z.string().describe("The Sqlite FTS5 match pattern to execute on the knowledge base."),
});

export const KBSearchOutputSchema = z.object({
    results: z.array(KBQueryResultSchema).describe("The search results from the knowledge base."),
});

export class KBSearchTool extends LLMToolImpl<typeof KBSearchInputSchema, typeof KBSearchOutputSchema> {
    inputSchema = KBSearchInputSchema;
    name = 'KBSearchTool';
    description = 'Search the knowledge base using a query. Returns matching entries from the database.';
    sideEffects: LLMToolSideEffects = 'idempotent';

    constructor(readonly db: KBDatabase) {
        super();
    }

    async invoke(params: z.infer<typeof KBSearchInputSchema>): Promise<z.infer<typeof KBSearchOutputSchema>> {
        const results = this.db.search(params.query);
        return { results };
    }

    async toolCallback(params: z.infer<typeof KBSearchInputSchema>) {
        return this.invoke(params);
    }
}
