import { LLMChatContext } from "./context.js";
import { z } from "zod";

// Low-level

export interface LLMMessage {
    role: 'user' | 'assistant' | 'tool';
    content: string | LLMMessagePart[];
    tool_calls?: LLMToolCall[] | undefined;
    tool_call_id?: string;
}

export interface LLMMessageResult extends LLMMessage {
    role: 'assistant' | 'tool';
}

export interface LLMToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    }
}

export type LLMSchema = z.ZodType<object, z.ZodObjectDef | z.ZodEffectsDef, object>; // TODO: https://github.com/colinhacks/zod/issues/2474
export type LLMContentType = LLMSchema | z.ZodString;

export type LLMMessagePart = LLMTextPart | LLMImagePart;

export type LLMTextPart = {
    type: 'text';
    text: string;
}

export type LLMImagePart = {
    type: 'image';
    imageType: 'jpeg' | 'png';
    imageUrl: string;
}

export type LLMToolSideEffects = 'pure' | 'idempotent' | 'stateful';

//TODO?
export type LLMToolResult = any | {
    success?: false;
    error?: string;
}

export type LLMToolCallResult = {
    toolCall: LLMToolCall;
    toolResult: LLMToolResult;
}

export interface LLMTool {
    inputSchema: LLMSchema;
    name: string;
    description?: string;
    sideEffects: LLMToolSideEffects;
    toolCallback(params: object): Promise<LLMToolResult>;
}

export interface LLMModelConfig {
    type: 'ollama' | 'openai' | 'anthropic' | 'google' | 'huggingface';
    model: string;
    url?: string;
    apiKey?: string;
    temperature?: number;
    top_p?: number;
}

export interface LLMChatInput {
    format: 'string' | 'json' | 'tools';
    messages: LLMMessage[];
    schema?: LLMSchema;
    system?: string;
    tools?: LLMTool[];
}

export interface LLMChatResult {
    choices: LLMMessageResult[];
    error: string | null;
}

export interface LLMEmbedding {
    model: string;
    embedding: Float32Array;
}

export interface LLMTTSInput {
    text: string;
    voice: string;
    rate?: number;
    quality?: 'normal' | 'high';
    format?: 'mp3' | 'aac' | 'opus' | 'flac' | 'wav' | 'pcm';
}

export interface LLMTranscribeInput {
    audio: Buffer;
    format: 'mp3' | 'flac' | 'wav' | 'webm';
    prompt?: string;
    temperature?: number;
}

export interface LLMApi {
    supports(type: 'text' | 'image' | 'tools'): boolean; // TODO? async?
    chat(input: LLMChatInput): Promise<LLMChatResult>;
    embedding?(text: string): Promise<LLMEmbedding>;
    tts?(input: LLMTTSInput): Promise<Buffer>;
    transcribe?(input: LLMTranscribeInput): Promise<string>;
}

// High-level interfaces

export interface ProgramConfig {
    secrets: {
        [key: string]: {
            apiKey: string,
            __HEADERS__: { [key: string]: string }
        }
    };
    models: { [key: string]: LLMModelConfig | string };
    tools: { [key: string]: any }; // tool defaults
}

export type LLMOutputFormat = 'string' | 'json' | 'markdown';

// TODO?
export interface LLMInputConfig {
    format: LLMOutputFormat | object;
    prompt: string | LLMMessagePart[];
    output: string;
    overwrite?: LLMOverwritePolicy;
    system?: string;
    model?: string;
    schema?: LLMSchema;
    tools?: LLMTool[];
    context?: LLMChatContext;
    timestamp?: number;
}

export type LLMOverwritePolicy = 'force' | 'exact' | 'timestamp' | 'fail' | 'skip';

export interface LLMArtifactMetadata {
    uuid?: string;
    name: string;
    version: number;
    timestamp: number;
    contentType: 'text' | 'binary' | 'json' | 'yaml' | 'image' | 'video' | 'audio';
    sizeBytes: number;
    sizeTokens?: number;
    inputHash?: string;
    chatResult?: LLMChatResult; // TODO: these include tool results?
}

export type LLMArtifactContent = string | object | Buffer;

export interface LLMArtifact {
    metadata: LLMArtifactMetadata;
    content: LLMArtifactContent; // TODO??? tool_results?
}

export interface LLMLogMessage {
    timestamp: number;
    action?: string;
    error?: any;
    path?: string;
}

export interface LLMEnvironment {
    getLatestMetadata(name: string): Promise<LLMArtifactMetadata | null>;
    getLatestArtifact(name: string): Promise<LLMArtifact>;
    saveArtifact(artifact: LLMArtifact): Promise<LLMArtifact>;
    removeArtifact(name: string): Promise<void>;
    listArtifacts(prefix?: string): Promise<string[]>;
    getLogs(): LLMLogMessage[];
    nextSequence(): number;
}

export interface LLMRunResult {
    artifacts: LLMArtifact[];
    context: LLMChatContext;
    errors: any[];
    toolCalls?: LLMToolCallResult[];
}

export type LLMRunVariables = { [name: string]: string };

export interface LLMRunnable {
    run(env: LLMEnvironment, vars: LLMRunVariables): Promise<LLMRunResult>;
}

export interface LLMTask extends LLMRunnable {
    isStale(env: LLMEnvironment, inputHash?: string): Promise<LLMArtifactMetadata | null | false>;
}

export interface LLMContextReducer {
    reduce(initialMsgs: LLMMessage[], targetTokens: number): Promise<LLMMessage[] | null>;
}

export type LLMValidateResult = { content: LLMArtifactContent } | { error: string };

export abstract class LLMToolImpl<
    InputSchema extends LLMSchema,
    OutputSchema extends LLMSchema,
    InputType = z.infer<InputSchema>,
    OutputType = z.infer<OutputSchema>
> {
    abstract readonly inputSchema: InputSchema;
    abstract readonly name: string;
    abstract readonly description?: string;
    abstract readonly sideEffects: LLMToolSideEffects;
    abstract toolCallback(params: InputType): Promise<OutputType>;
}

export type ToolOutputType<T> = T extends LLMToolImpl<any, any, any, infer O> ? O : never;

