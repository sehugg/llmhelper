import { z } from 'zod';
import { LLMToolImpl, LLMToolSideEffects } from '../types.js';
import { getMessageText, LLMHelper } from '../llm.js';

export const ExtractInputSchema = z.object({
    regex: z.string().describe("The regex to match in the message content."),
});

export const ExtractOutputSchema = z.object({
    matches: z.array(z.string()).describe("The matches found in the message content."),
});

export class ExtractTool extends LLMToolImpl<typeof ExtractInputSchema, typeof ExtractOutputSchema> {
    inputSchema = ExtractInputSchema;
    name = 'ExtractTool';
    description = 'Extract text from previous messages in the context window.';
    sideEffects : LLMToolSideEffects = 'pure';

    constructor(readonly llm: LLMHelper) {
        super();
    }

    async toolCallback(params: z.infer<typeof ExtractInputSchema>): Promise<z.infer<typeof ExtractOutputSchema>> {
        const msgs = this.llm.getMessages();
        const regex = new RegExp(params.regex);
        const matches = msgs.map(msg => {
            const m = regex.exec(getMessageText(msg));
            return m ? (m[1] || m[0]) : '';
        });
        return { matches };
    }
}
