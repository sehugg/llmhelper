import OpenAI from "openai";
import { ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionTool, ResponseFormatJSONSchema } from "openai/resources/index.mjs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMApi, LLMChatInput, LLMChatResult, LLMEmbedding, LLMMessage, LLMModelConfig, LLMTool, LLMTranscribeInput, LLMTTSInput } from "../types.js";
import { toFile } from 'openai/uploads';

function convertToOpenAITool(tool: LLMTool): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema)
    }
  }
}

function convertToOpenAIMessage(message: LLMMessage): OpenAI.ChatCompletionMessageParam {
  return {
    role: message.role === 'tool' ? 'assistant' : message.role,
    tool_call_id: message.tool_call_id,
    // TODO: gives 500 error?
    //tool_calls: message.tool_calls,
    content: typeof message.content === 'string' ? message.content : message.content.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text } as ChatCompletionContentPartText;
      } else if (part.type === 'image') {
        return { type: 'image_url', image_url: { url: part.imageUrl } } as ChatCompletionContentPartImage;
      } else {
        throw new Error('Unsupported message part type');
      }
    })
  } as any // TODO
}

export class OpenAIApiImpl implements LLMApi {
  private openai: OpenAI;

  constructor(readonly modelConfig: LLMModelConfig) {
    const apiKey = modelConfig.apiKey;
    if (!apiKey) {
      throw new Error('OpenAI model requires an API key');
    }
    this.openai = new OpenAI({ apiKey });
  }

  supports(type: string): boolean {
    return type === 'text' || type === 'image';
  }

  async chat(prompt: LLMChatInput): Promise<LLMChatResult> {
    try {
      let promptSchema: ResponseFormatJSONSchema.JSONSchema | null = null;
      if (prompt.schema) {
        const schemaName = 'mySchema';
        const jsonSchema = zodToJsonSchema(prompt.schema, schemaName);
        promptSchema = {
          name: schemaName,
          strict: false,
          schema: (jsonSchema as any).definitions[Object.keys((jsonSchema as any).definitions)[0]]
        };
      }

      const messages: OpenAI.ChatCompletionMessageParam[] = [{
        role: 'system',
        content: [{ type: 'text', text: prompt.system || '' }]
      }, ...prompt.messages.map(convertToOpenAIMessage)];

      const hasTools = prompt.tools?.length;

      const response = await this.openai.chat.completions.create({
        model: this.modelConfig.model,
        messages,
        response_format: promptSchema ?
          { type: "json_schema", json_schema: promptSchema } :
          prompt.format === 'json' ? { type: "json_object" } : undefined,
        temperature: this.modelConfig.temperature,
        top_p: this.modelConfig.top_p,
        tools: hasTools ? prompt.tools?.map(t => convertToOpenAITool(t)) : undefined,
        tool_choice: prompt.format === 'tools' ? 'required' : undefined,
        parallel_tool_calls: hasTools ? true : undefined,
      }, {
        maxRetries: 3,
        timeout: 60000,
      });

      return {
        choices: response.choices.map(choice => ({
          role: choice.message.role,
          text: choice.message.content || '',
          content: choice.message.content || '',
          tool_calls: choice.message.tool_calls || undefined
        })),
        error: null,
      };
    } catch (error) {
      return {
        choices: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async embedding(text: string): Promise<LLMEmbedding> {
    const model = 'text-embedding-3-small'; // TODO?
    const response = await this.openai.embeddings.create({
      model,
      input: text
    });
    return {
      model,
      embedding: new Float32Array(response.data[0].embedding) // TODO: multiple?
    }
  }

  async tts(input: LLMTTSInput) {
    const model = input.quality === 'high' ? 'tts-1-hd' : 'tts-1';
    const text = input.text;
    const voice: any = input.voice || 'alloy';
    const speed = input.rate || 1.0;
    const response_format = input.format || 'mp3';
    const response = await this.openai.audio.speech.create({
      model,
      input: text,
      voice,
      speed,
      response_format
    });
    if (!response.ok) {
      throw new Error(`Failed to generate TTS: ${response.status}`);
    }
    return response.buffer();
  }

  async transcribe(input: LLMTranscribeInput) {
    if (!Buffer.isBuffer(input.audio)) {
      throw new Error('Expected audio buffer');
    }
    const model = 'whisper-1';
    const type = input.format;
    const readStream = await toFile(input.audio, 'audio.' + type);
    const response = await this.openai.audio.transcriptions.create({
      model,
      file: readStream,
      prompt: input.prompt,
      temperature: input.temperature
    });
    return response.text;
  }
}
