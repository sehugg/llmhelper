import { z } from 'zod';
import { LLMSchema, LLMToolSideEffects } from "../types.js";
import { addSecretsToQueryString, getSecretsForURL } from '../config.js';

export const APIInputSchema = z.object({
    url: z.string().url().describe("The URL to fetch."),
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).describe("The HTTP method to use."),
    contentType: z.enum(['text', 'json']).describe("The content type to expect."),
    body: z.string().optional().describe("The body to send with the request."),
});

export const APIOutputSchema = z.object({
    success: z.boolean().describe("Whether the API call was successful."),
    status: z.number().describe("The HTTP status code returned from the API."),
    content: z.any().describe("The JSON or text content returned from the API."),
});

export abstract class BaseAPITool<I extends LLMSchema, O extends LLMSchema> {
    description = 'GET a remote API endpoint.  Do not include API keys or other secrets, they will be supplied.';
    sideEffects : LLMToolSideEffects = 'idempotent';

    async invoke(params: z.infer<typeof APIInputSchema>) : Promise<z.infer<typeof APIOutputSchema>> {
        const extraHeaders = getSecretsForURL(params.url)?.__HEADERS__;
        const response = await fetch(addSecretsToQueryString(params.url), {
            method: params.method,
            headers: {
                'Content-Type': params.contentType === 'json' ? 'application/json' : 'text/plain',
                ...extraHeaders
            },
            body: params.body,
        });
        const content = params.contentType === 'json' ? await response.json() : await response.text();
        const success = response.ok;
        const status = response.status;
        return { success, status, content };
    }
}

export class APITool extends BaseAPITool<typeof APIInputSchema, typeof APIOutputSchema> {
    inputSchema = APIInputSchema;
    name = 'APITool';
    description = 'GET a remote API endpoint.  Do not include API keys or other secrets, they will be supplied.';
    sideEffects : LLMToolSideEffects = 'idempotent';

    async toolCallback(params: z.infer<typeof APIInputSchema>) : Promise<z.infer<typeof APIOutputSchema>> {
        return this.invoke(params);
    }
}

