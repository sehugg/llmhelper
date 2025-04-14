import { LLMApi, LLMChatInput, LLMChatResult, LLMEmbedding } from "../types.js";

export class MetaApiImpl implements LLMApi {

    apiIndex = 0;

    constructor(readonly apis: LLMApi[]) {
    }

    getAPI() {
        return this.apis[this.apiIndex];
    }
    nextAPI() {
        this.apiIndex = (this.apiIndex + 1) % this.apis.length;
    }
    handleError(e?: any) {
        console.error("Error in " + this.apis[this.apiIndex]);
        this.nextAPI();
    }
    async callAPI<T>(fn: (api: LLMApi) => Promise<T>): Promise<T> {
        for (let i = 0; i < this.apis.length; i++) {
            const api = this.getAPI();
            try {
                const value = await fn(api);
                if (value) {
                    return value;
                } else {
                    this.nextAPI();
                }
            } catch (e) {
                this.handleError(e);
            }
        }
        throw new Error("All APIs failed calling " + fn);
    }

    supports(type: "text" | "image"): boolean {
        return this.apis.every(api => api.supports(type));
    }
    async chat(input: LLMChatInput): Promise<LLMChatResult> {
        return this.callAPI(api => api.chat(input));
    }
    async embedding?(text: string): Promise<LLMEmbedding> {
        const embedding = await this.callAPI(async api => api.embedding && api.embedding(text));
        if (embedding) {
            return embedding;
        } else {
            throw new Error("No embedding support in any API.");
        }
    }
}
