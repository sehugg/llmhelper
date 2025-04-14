import { z } from 'zod';
import { LLMToolImpl, LLMToolSideEffects } from "../types.js";
import betterSqlite3 from 'better-sqlite3';

export const SQLiteInputSchema = z.object({
    query: z.string().describe("The SQL query to execute."),
    params: z.record(z.any()).optional().describe("Optional parameters for the SQL query."),
});

export const SQLiteOutputSchema = z.object({
    result: z.array(z.any()).describe("The result of the query as an array of objects."),
});

export class SQLiteQueryTool extends LLMToolImpl<typeof SQLiteInputSchema, typeof SQLiteOutputSchema> {
    inputSchema = SQLiteInputSchema;
    name = 'SQLiteQueryTool';
    description = 'Execute a query on a local SQLite database.';
    sideEffects: LLMToolSideEffects = 'idempotent';

    db: betterSqlite3.Database;

    constructor(dbPath: string) {
        super();
        this.db = new betterSqlite3(dbPath, { readonly: true });
        // read list of tables
        const tables = this.db.prepare("SELECT * FROM sqlite_schema WHERE type='table' OR type='view'").all();
        let desc = this.description + ` Schema:\n${tables.map(t => (t as any).sql).join('\n')}`;
        if (desc.length > 1024) { // TODO?
            desc = this.description + ` Tables: ${tables.map(t => (t as any).name).join(', ')}.`;
        }
        this.description = desc;
    }

    async invoke(params: z.infer<typeof SQLiteInputSchema>): Promise<z.infer<typeof SQLiteOutputSchema>> {
        const stmt = this.db.prepare(params.query);
        const result = params.params ? stmt.all(params.params) : stmt.all();
        return { result };
    }

    async toolCallback(params: z.infer<typeof SQLiteInputSchema>): Promise<z.infer<typeof SQLiteOutputSchema>> {
        return this.invoke(params);
    }
}
