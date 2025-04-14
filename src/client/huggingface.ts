import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMApi, LLMChatResult, LLMChatInput, LLMModelConfig } from "../types.js";
import { coalesceMessages } from "../llm.js";

// https://www.npmjs.com/package/@huggingface/inference

export class HuggingFaceAPIImpl implements LLMApi {

    constructor(readonly modelConfig: LLMModelConfig) {
        const apiKey = modelConfig.apiKey;
        if (!apiKey) {
          throw new Error('HuggingFace model requires an API key');
        }
    }

    async getHF() {
        const inference = await import('@huggingface/inference');
        return new inference.HfInference(this.modelConfig.apiKey!);
    }

    supports(type: string): boolean {
        return type === 'text'; // TODO: Support images
    }

    async chat(prompt: LLMChatInput): Promise<LLMChatResult> {
        try {
            const hf = await this.getHF();

            let systemMessage = prompt.system || '';
            if (prompt.schema) {
                const schemaName = 'mySchema';
                const jsonSchema = zodToJsonSchema(prompt.schema, schemaName);
                systemMessage += `\nJSON output will be validated by this JSON schema: ${JSON.stringify(jsonSchema)}`;
            }

            let messages = prompt.messages;
            messages = [{ role: 'user', content: systemMessage }, ...messages];
            messages = coalesceMessages(messages);

            if (prompt.tools) {
                throw new Error('Tools not supported yet'); // TODO
            }
            
            const response = await hf.chatCompletion({
                model: this.modelConfig.model,
                messages,
                temperature: this.modelConfig.temperature,
                top_p: this.modelConfig.top_p,
                // TODO tools: prompt.tools?.map(t => convertToOpenAITool(t)),
            });
            
            const choice = response.choices[0];
            if (!choice) {
                throw new Error('No response from Hugging Face');
            }
            const result: LLMChatResult = {
                choices: [{
                    role: choice.message.role as 'tool' | 'assistant',
                    content: choice.message.content as string
                }],
                error: null,
            };
            return result;
        } catch (error) {
            console.log(error);
            return {
                choices: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}

