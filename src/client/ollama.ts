import { Message, Ollama, Tool, ToolCall } from 'ollama';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getMessageText } from '../llm.js';
import { LLMApi, LLMChatInput, LLMChatResult, LLMEmbedding, LLMMessage, LLMModelConfig, LLMTool, LLMToolCall } from '../types.js';

function convertToOllamaTool(tool: LLMTool): Tool {
    //console.log(zodToJsonSchema(tool.inputSchema));
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description || "",
            parameters: zodToJsonSchema(tool.inputSchema) as any, // TODO?
        }
    }
}

function convertFromOllamaToolCalls(toolCalls?: ToolCall[]): LLMToolCall[] {
    if (!toolCalls) return [];
    return toolCalls.map((tc, index) => {
        return {
            type: 'function',
            id: "toolcall_" + index,
            function: {
                name: tc.function.name,
                arguments: JSON.stringify(tc.function.arguments)
            },
        };
    });
}

function extractBase64Image(imageUrl: string): string {
    const pos = imageUrl.indexOf('base64,');
    if (pos < 0) {
        throw new Error('Invalid image URL');
    }
    return imageUrl.slice(pos + 7);
}

function convertToOllamaMessage(msg: LLMMessage): Message {
    return {
        role: msg.role,
        content: getMessageText(msg),
        images: typeof msg.content === 'string' ? undefined : msg.content.filter(p => p.type === 'image').map(p => extractBase64Image(p.imageUrl)),
    };
}

export class OllamaApiImpl implements LLMApi {
    private ollama: Ollama;

    constructor(readonly modelConfig: LLMModelConfig) {
        let baseUrl = modelConfig.url || 'http://localhost:11434';
        this.ollama = new Ollama({ host: baseUrl });
    }

    supports(type: string): boolean {
        return type === 'text' || type === 'image'; // TODO: Support images
    }

    async chat(prompt: LLMChatInput): Promise<LLMChatResult> {
        try {
            // TODO: use tool to generate object?
            //const useSchemaTool = prompt.schema != null && prompt.tools == null;

            let systemMessage = prompt.system || '';
            if (prompt.schema) {
                const schemaName = 'mySchema';
                const jsonSchema = zodToJsonSchema(prompt.schema, schemaName);
                systemMessage += `\nJSON output will be validated by this JSON schema: ${JSON.stringify(jsonSchema)}`;
            }
            const messages = [{
                role: 'system',
                content: systemMessage,
            }, ...prompt.messages.map(convertToOllamaMessage)];

            //console.log(messages);

            // remove apiKey etc.
            let { apiKey, type, model, ...options } = this.modelConfig;

            // https://github.com/ollama/ollama/blob/main/docs/api.md
            const response = await this.ollama.chat({
                model: this.modelConfig.model,
                messages,
                format: prompt.format === 'json' ? 'json' : undefined,
                stream: false,
                // https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
                options,
                tools: prompt.tools?.length ? prompt.tools?.map(t => convertToOllamaTool(t)) : undefined,
            });
            //console.log(response.message.content);

            return {
                choices: [{
                    role: 'assistant',
                    content: response.message.content,
                    tool_calls: convertFromOllamaToolCalls(response.message.tool_calls)
                }],
                error: null,
            };
        } catch (error) {
            console.log(error);
            return {
                choices: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async embedding(text: string): Promise<LLMEmbedding> {
        const model = 'mxbai-embed-large'; // TODO
        const result = await this.ollama.embeddings({ model, prompt: text });
        return {
            model,
            embedding: new Float32Array(result.embedding)
        };
    }
}

