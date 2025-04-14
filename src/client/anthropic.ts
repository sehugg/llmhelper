import Anthropic from '@anthropic-ai/sdk';
import { LLMApi, LLMMessage, LLMChatInput, LLMChatResult, LLMTextPart, LLMModelConfig } from "../types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { coalesceMessages } from '../llm.js';

const ROLE_MAP: { [name: string]: 'user' | 'assistant' } = {
  user: 'user',
  assistant: 'assistant',
  system: 'user',
  tool: 'assistant',
};

//   Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.4.content.0: Input should be a valid dictionary or object to extract fields from"}}

function convertToAnthropicMessages(messages: LLMMessage[]): Anthropic.Messages.MessageParam[] {
  messages = coalesceMessages(messages);
  let msgs: Anthropic.Messages.MessageParam[] = messages.map(msg => ({
    role: ROLE_MAP[msg.role],
    content: typeof msg.content === 'string' ? msg.content : msg.content.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text.trim() } as LLMTextPart;
      } else {
        return { type: 'text', text: '' } as LLMTextPart; // TODO { image: { imageUrl: part.imageUrl } };
      }
    }).filter(p => p.type === 'text' && p.text.length > 0),
  }));
  //console.log(JSON.stringify(r, null, 2));
  return msgs;
}

function contentToText(message: Anthropic.Messages.Message): string {
  return message.content.map(c => (c as any).text).join('');
}

export class AnthropicApiImpl implements LLMApi {
  private anthropic: Anthropic;

  constructor(readonly modelConfig: LLMModelConfig) {
    const apiKey = modelConfig.apiKey;
    if (!apiKey) {
      throw new Error('Anthropic model requires an API key');
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  supports(type: string): boolean {
    return type === 'text'; // TODO: Support images
  }

  async chat(prompt: LLMChatInput): Promise<LLMChatResult> {
    try {
      const messages = [...prompt.messages];

      let systemMessage = prompt.system || '';
      if (prompt.schema) {
        const schemaName = 'mySchema';
        const jsonSchema = zodToJsonSchema(prompt.schema, schemaName);
        systemMessage += `\nJSON output will be validated by this JSON schema: ${JSON.stringify(jsonSchema)}`;
      }

      if (prompt.tools) {
        throw new Error('Tools not supported yet');
      }

      const response = await this.anthropic.messages.create({
        model: this.modelConfig.model,
        messages: convertToAnthropicMessages(messages),
        system: systemMessage,
        max_tokens: 4096, // TODO: Adjust as needed?
        // TODO tool_choice: prompt.format === 'tools' ? 'any' : 'auto',
        temperature: this.modelConfig.temperature,
        top_p: this.modelConfig.top_p,
      });

      return {
        choices: [{
          role: 'assistant',
          content: contentToText(response), // TODO?
        }],
        error: null,
      };
    } catch (error) {
      return {
        choices: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
