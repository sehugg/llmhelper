import { GoogleAIFileManager } from "@google/generative-ai/server";
import { Content, GenerateContentCandidate, GenerateContentRequest, GoogleGenerativeAI } from "@google/generative-ai";
import { LLMApi, LLMMessage, LLMMessageResult, LLMChatInput, LLMChatResult, LLMModelConfig } from "../types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { stripMarkdownCodeBlockDelimiters } from "../util.js";

const ROLE_MAP: { [name: string]: 'user' | 'model' } = {
  user: 'user',
  assistant: 'model',
  system: 'user',
  tool: 'model',
};

function convertFromGoogleCandidate(candidate: GenerateContentCandidate): LLMMessageResult {
  // TODO:   Error: Cannot read properties of undefined (reading 'parts')
  let content = candidate.content.parts.map(p => p.text).join('').trim();
  // TODO: what if it is markdown format???
  content = stripMarkdownCodeBlockDelimiters(content);
  return {
    role: 'assistant',
    content // TODO: parts: candidate.content.parts,
  };
}

export class GoogleApiImpl implements LLMApi {
  private genAI: GoogleGenerativeAI;
  private fileManager: GoogleAIFileManager;

  constructor(readonly modelConfig: LLMModelConfig) {
    const apiKey = modelConfig.apiKey;
    if (!apiKey) {
      throw new Error('Google model requires an API key');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
  }

  supports(type: string): boolean {
    return type === 'text' || type === 'image';
  }

  convertToGoogleMessages(messages: LLMMessage[]): Content[] {
    return messages.map(msg => ({
      role: ROLE_MAP[msg.role],
      parts: typeof msg.content === 'string' ? [{ text: msg.content }] : msg.content.map(part => {
        if (part.type === 'text') {
          return { text: part.text };
        } else {
          return {
            inlineData: {
              data: part.imageUrl.substring(part.imageUrl.indexOf(',') + 1),
              mimeType: part.imageType === 'png' ? 'image/png' : 'image/jpeg',
            }
          }
        }
      })
    }));
  }

  async chat(prompt: LLMChatInput): Promise<LLMChatResult> {
    try {
      const isJSON = prompt.format === 'json';
      const model = this.genAI.getGenerativeModel({
        model: this.modelConfig.model,
        generationConfig: {
          responseMimeType: isJSON ? 'application/json' : 'text/plain',
          // TODO responseSchema: prompt.schema ? zodToJsonSchema(prompt.schema, 'mySchema').definitions : undefined,
        },
      });

      let systemMessage = prompt.system || '';
      if (prompt.schema) {
        const schemaName = 'mySchema';
        const jsonSchema = zodToJsonSchema(prompt.schema, schemaName);
        systemMessage += `\nJSON output will be validated by this JSON schema: ${JSON.stringify(jsonSchema)}`;
      }

      if (prompt.tools) {
        throw new Error('Tools not supported yet');
      }

      const request: GenerateContentRequest = {
        contents: await this.convertToGoogleMessages(prompt.messages),
        systemInstruction: systemMessage,
        //tools?: Tool[]; // TODO
        //toolConfig?: ToolConfig;
      }
      //console.log(JSON.stringify(request.contents, null, 2));

      const response = await model.generateContent(request);
      const choices: LLMMessageResult[] = [{
        role: 'assistant',
        content: response.response.text()
        // TODO: parse parts
      }];
      //console.log(JSON.stringify(choices[0], null, 2));

      return {
        choices,
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
