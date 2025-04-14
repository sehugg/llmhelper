import fs from 'fs/promises';
import yaml from 'yaml';
import { LLMApi, LLMArtifact, LLMContentType, LLMEnvironment, LLMInputConfig, LLMMessage, LLMMessagePart, LLMModelConfig, LLMOutputFormat, LLMOverwritePolicy, LLMChatInput, LLMChatResult, LLMRunnable, LLMRunResult, LLMRunVariables, LLMSchema, LLMTask, LLMToolImpl, LLMToolResult, ToolOutputType, LLMArtifactMetadata, LLMTextPart, LLMMessageResult, LLMContextReducer, LLMToolCallResult, LLMTTSInput } from "./types.js";
import { GPT4Tokenizer } from 'gpt4-tokenizer';
import { LLMChatContext } from './context.js';
import { z } from 'zod';
import { newArtifact, newTimestamp, NullEnvironment } from './env.js';
import { getModelAPI, getModelConfig } from './config.js';
import { hashSHA256, safeJSONStringify, stripMarkdownCodeBlockDelimiters } from './util.js';
import { randomUUID } from 'crypto';
import { LLMTUI } from './tui.js';
import { LogOutputReducer } from './reduce.js';
import { zodToJsonSchema } from "zod-to-json-schema";

const processID = randomUUID().toString().slice(0, 6);

export const logger = new LLMTUI();

// TODO: different tokenizers
export const tokenizer = new GPT4Tokenizer({ type: 'gpt4' });

export function getMessageText(message: LLMMessage) {
    if (typeof message.content === 'string') {
        return message.content;
    } else {
        return message.content.map(p => p.type === 'text' ? p.text : '').join('\n').trim();
    }
}

export function estimateMessageTokens(message: LLMMessage) {
    return tokenizer.estimateTokenCount(getMessageText(message));
}

export function countMessageBytes(message: LLMMessage) {
    return Buffer.from(getMessageText(message)).byteLength;
}

export function estimateMessagesLength(messages: LLMMessage[]) {
    return messages.map(countMessageBytes).reduce((a, b) => a + b, 0);
}

function getToolResults(result: LLMRunResult) {
    return (result.artifacts[0].content as any).tool_results as { [key: string]: LLMToolResult };
}

function combineMessages(a: LLMMessage, b: LLMMessage): LLMMessage {
    if (a.role !== b.role) {
        throw new Error('Cannot combine messages with different roles');
    }
    if (typeof a.content === 'string' && typeof b.content === 'string') {
        return { role: a.role, content: a.content + '\n' + b.content };
    } else {
        const aContent = typeof a.content === 'string' ? [{ type: 'text', text: a.content } as LLMTextPart] : a.content;
        const bContent = typeof b.content === 'string' ? [{ type: 'text', text: b.content } as LLMTextPart] : b.content;
        return { role: a.role, content: [...aContent, ...bContent] };
    }
}

export function coalesceMessages(messages: LLMMessage[]): LLMMessage[] {
    // coalesce adjacent messages of the same type
    let msgs: LLMMessage[] = [];
    for (let message of messages) {
        if (msgs.length && msgs[msgs.length - 1].role === message.role) {
            msgs[msgs.length - 1] = combineMessages(msgs[msgs.length - 1], message);
        } else {
            msgs.push(message);
        }
    }
    return msgs;
}

function hashPrompt(p: LLMChatInput) {
    const o = {
        messages: p.messages,
        format: p.format,
        system: p.system,
        schema: p.schema && zodToJsonSchema(p.schema),
        tools: p.tools?.map(t => t.name)
    };
    return hashSHA256(safeJSONStringify(o));
}

function hashInputConfig(p: LLMInputConfig) {
    return hashSHA256(safeJSONStringify({
        schema: p.schema && zodToJsonSchema(p.schema),
        tools: p.tools?.map(t => t.name),
        timestamp: 0,
        ...p,
    }));
}

class SimpleRunnable implements LLMTask {

    constructor(
        private readonly modelConfig: LLMModelConfig,
        private readonly prompt: LLMChatInput,
        private readonly outputPath: string,
        private readonly parentContext: LLMChatContext | null,
        private readonly writePolicy: LLMOverwritePolicy,
        private readonly timestamp: number | null = null
    ) {
    }

    async isStale(env: LLMEnvironment, inputHash: string): Promise<LLMArtifactMetadata | null | false> {
        const policy = this.writePolicy;
        const latestOutput = await env.getLatestMetadata(this.outputPath);
        if (!latestOutput) return null;
        if (policy === 'force') return latestOutput;
        if (policy === 'skip') return false;
        if (policy === 'fail') return false;
        if (policy === 'timestamp') {
            if (this.timestamp && this.timestamp > latestOutput.timestamp) {
                return latestOutput;
            } else {
                return false;
            }
        }
        if (policy === 'exact') {
            if (latestOutput.inputHash !== inputHash) return latestOutput;
        }
        return false;
    }

    async run(env: LLMEnvironment, vars?: LLMRunVariables): Promise<LLMRunResult> {

        const modelConfig = this.modelConfig;

        const prompt = Object.assign({}, this.prompt); //TODO: deep copy?
        //prompt.modelConfig = modelConfig;
        let isJSON = prompt.format === 'json';

        const preContext = new LLMChatContext(this.parentContext, prompt.messages);
        prompt.messages = preContext.getAllMessages();

        let result: LLMChatResult;

        const inputHash = hashPrompt(prompt);

        const replacedMetadata = await this.isStale(env, inputHash);
        if (replacedMetadata === false) {
            console.log(`Up to date (${this.writePolicy}):`, this.outputPath);
            if (this.writePolicy === 'fail')
                throw new Error(`Output artifact "${this.outputPath}" already exists and overwrite policy is "fail"`);
            // look at all tools
            for (const tool of prompt.tools || []) {
                if (tool.sideEffects !== 'stateful') continue;
                // TODO? stateful tools?
                if (this.writePolicy !== 'force' && this.writePolicy !== 'skip')
                    console.warn('Stateful tools in cached artifact and policy is ' + this.writePolicy);
            }
            // TODO: why not found???
            const artifact = await env.getLatestArtifact(this.outputPath);
            // TODO: should we convert to object or retain parts? what if content != chatResult?
            const content = typeof artifact.content === 'object' ? safeJSONStringify(artifact.content) : artifact.content;
            const postContext = new LLMChatContext(preContext, [
                {
                    role: 'assistant',
                    content
                }
            ]);
            return {
                artifacts: [artifact],
                context: postContext,
                errors: [],
                // TODO? toolCalls: []
            };
        }

        const llmApi: LLMApi = getModelAPI(modelConfig);
        const bytes = estimateMessagesLength(prompt.messages);
        const caption = `Running ${modelConfig.model} (${prompt.messages.length} msgs, ${Math.round(bytes / 1024)} kB) -> ${this.outputPath || prompt.format}`;
        result = await logger.indefiniteTask(llmApi.chat(prompt), caption, (result) => {
            const size = safeJSONStringify(result).length; // TODO?
            return size > 1000 ? caption + ` (${Math.round(size / 1000)}KB)` : caption;
        });

        if (result.error) {
            throw new Error(result.error);
        }

        let choice = result.choices[0];
        let output: string | object;
        let postContext: LLMChatContext;
        let errors = [];
        // TODO: clean/extract markdown here?

        let tool_call_results : LLMToolCallResult[] = [];
        let tool_results: { [key: string]: LLMToolResult } = {};
        if (choice.tool_calls?.length) {
            console.log('Tool calls:', choice.tool_calls);
            const toolCallPromises = choice.tool_calls.map(async (toolCall) => {
                const tool = prompt.tools?.find(t => t.name === toolCall.function.name);
                const tool_id = choice.tool_calls!.length == 1 ? toolCall.function.name : toolCall.id;
                try {
                    if (!tool) throw new Error(`Tool not found: ${toolCall.id}`);
                    const fnargs = toolCall.function.arguments;
                    const args = typeof fnargs === 'string' ? JSON.parse(fnargs) : fnargs;
                    const fnresult = await logger.indefiniteTask(tool.toolCallback(args), `Running ${tool.name}`);
                    console.log('Tool result:', tool.name, safeJSONStringify(fnresult).length + " bytes");
                    return { tool_id, toolCall, toolResult: fnresult };
                } catch (e) {
                    console.error('Tool error caught:', tool?.name, e + "");
                    return { tool_id, toolCall, error: { fname: tool_id, success: false, error: e + "" } };
                }
            });
            const results = await Promise.all(toolCallPromises);
            for (const { tool_id, error, toolCall, toolResult } of results) {
                if (error) {
                    errors.push(error);
                    tool_results[tool_id] = error;
                    tool_call_results.push({ toolCall, toolResult: error }); // TODO?
                } else {
                    tool_results[tool_id] = toolResult;
                    tool_call_results.push({ toolCall, toolResult });
                }
            }
            output = { tool_results };
            /*
            const tool_msgs: LLMMessageResult[] = [
                {
                    role: 'assistant',
                    content: safeJSONStringify({
                        content: choice.content,
                        tool_calls: choice.tool_calls,
                        tool_results
                    }),
                    tool_calls: choice.tool_calls
                },
            ];
            // TODO? use the 'tool' role properly?
            */
            let tool_msgs: LLMMessageResult[] = [
                {
                    role: 'assistant',
                    content: safeJSONStringify({ content: choice.content, tool_calls: choice.tool_calls }),
                    tool_calls: choice.tool_calls
                },
            ];
            for (let [tool_name, tool_result] of Object.entries(tool_results)) {
                tool_msgs.push({
                    role: 'tool',
                    content: safeJSONStringify({ tool_result }),
                    tool_call_id: choice.tool_calls.find(tc => tc.function.name === tool_name)?.id || tool_name
                });
            }
            postContext = new LLMChatContext(preContext, tool_msgs);
        } else {
            postContext = new LLMChatContext(preContext, [
                {
                    role: 'assistant',
                    content: choice.content
                }
            ]);
            try {
                output = isJSON ? JSON.parse(stripMarkdownCodeBlockDelimiters(getMessageText(choice))) : choice.content;
            } catch (e) {
                console.error('Error parsing JSON:', e);
                errors.push(e);
                output = choice.content; // TODO?
            }
        }

        const strOutput = typeof output === 'object' ? safeJSONStringify(output) : output;
        let artifact: LLMArtifact = {
            metadata: {
                uuid: randomUUID().toString(),
                name: this.outputPath,
                contentType: isJSON ? 'json' : 'text',
                version: replacedMetadata?.version || 0,
                timestamp: newTimestamp(),
                sizeBytes: strOutput.length,
                sizeTokens: tokenizer.estimateTokenCount(strOutput),
                chatResult: result,
                inputHash // TODO: tools serialize?
            },
            content: output,
        }

        await env.saveArtifact(artifact);

        return {
            artifacts: [artifact],
            context: postContext,
            errors,
            toolCalls: tool_call_results
        };
    }
}

export async function createRunnable(inputConfig: LLMInputConfig): Promise<LLMTask> {

    if (inputConfig.model && typeof inputConfig.model !== 'string') {
        throw new Error('Invalid model, expected string');
    }
    // TODO: check with zod?

    const systemMessages = [];
    if (inputConfig.system) {
        systemMessages.push(inputConfig.system);
    }

    let format: 'string' | 'json';
    let formatPrompt: string;

    // TODO: pluggable formats?
    if (inputConfig.format === 'json' || typeof inputConfig.format === 'object') {
        format = 'json';
        if (inputConfig.schema) {
            formatPrompt = `In your response, output only a JSON object.`;
        } else {
            formatPrompt = `In your response, output only a JSON object with the following schema: ${safeJSONStringify(inputConfig.format)}`;
        }
    }
    else if (inputConfig.format === 'markdown') {
        format = 'string';
        formatPrompt = "In your response, output Github Flavored Markdown."; // TODO?
    }
    else if (inputConfig.format === 'string') {
        format = 'string';
        formatPrompt = "In your response, output only text, with no Markdown or other delimiters."
    }
    else {
        throw new Error('Invalid format, expected "string" or object schema');
    }
    systemMessages.push(formatPrompt);

    if (inputConfig.tools?.length) {
        //systemMessages.push(`Use tools where needed to help you respond.`);
    }

    const system = systemMessages.join('\n').trim();
    const messages: LLMMessage[] = [{
        role: 'user',
        content: inputConfig.prompt || system
    }];
    const modelConfig = getModelConfig(inputConfig.model);

    const prompt: LLMChatInput = {
        format,
        schema: inputConfig.schema,
        tools: inputConfig.tools,
        messages,
        system
    };

    const runnable = new SimpleRunnable(
        modelConfig,
        prompt,
        inputConfig.output || 'output.txt',
        inputConfig.context || null,
        inputConfig.overwrite || 'fail',
        inputConfig.timestamp);
    return runnable;
}

export async function loadYAMLRunnable(filePath: string, outputFilename?: string): Promise<LLMTask> {

    // Read and parse the YAML file
    const fileContents = await fs.readFile(filePath, 'utf8');
    const inputConfig = yaml.parse(fileContents) as LLMInputConfig;
    if (outputFilename) {
        inputConfig.output = outputFilename;
    }

    return createRunnable(inputConfig);
}

// immutable LLM helper class

const inputConfigDefaults: LLMInputConfig = {
    prompt: '',
    output: '',
    format: 'string',
};

export class LLMHelper {
    readonly env: LLMEnvironment;
    readonly inputConfig: LLMInputConfig;
    // TODO: should be part of inputConfig?
    retries: number = 5;
    maxTokens: number = 64000; // TODO?
    reducer: LLMContextReducer;
    useYAML: boolean = false;

    constructor(base?: LLMEnvironment | LLMHelper, inputConfig?: Partial<LLMInputConfig>) {
        if (base instanceof LLMHelper) {
            Object.assign(this, base);
            this.env = base.env;
            this.reducer = base.reducer;
        } else {
            this.env = base || new NullEnvironment();
            this.reducer = new LogOutputReducer();
        }
        this.inputConfig = Object.assign({
            context: new LLMChatContext(),
            ...inputConfigDefaults
        }, inputConfig || {});
    }
    getAPI(): LLMApi {
        return getModelAPI(getModelConfig(this.inputConfig?.model));
    }
    objectToString(obj: any) {
        return this.useYAML ? yaml.stringify(obj) : safeJSONStringify(obj);
    }
    addTools(tools: LLMToolImpl<any, any>[]) {
        return this.clone({ tools: (this.inputConfig.tools || []).concat(tools) });
    }
    setTools(tools: readonly LLMToolImpl<any, any>[]) {
        return this.clone({ tools: [...tools] });
    }
    clone(newProps: Partial<LLMInputConfig>) {
        return new LLMHelper(this, Object.assign({}, this.inputConfig, newProps));
    }
    model(model: string) {
        const llm = this.clone({ model });
        llm.getAPI(); // make sure the model works
        return llm;
    }
    addPart(part: LLMMessagePart) {
        if (!part) return this;
        if (!this.getAPI().supports(part.type)) {
            throw new Error(`Model does not support message type: ${part.type}`);
        }
        // TODO: refactor?
        if (typeof this.inputConfig.prompt === 'string' && part.type === 'text') {
            return this.clone({ prompt: this.inputConfig.prompt + "\n" + part.text });
        } else {
            let oldParts = this.inputConfig.prompt;
            if (typeof oldParts === 'string') {
                oldParts = [{ type: 'text', text: oldParts }];
            }
            return this.clone({ prompt: [...oldParts, part] });
        }
    }
    prompt(prompt: string) {
        return prompt ? this.addPart({ type: 'text', text: prompt }) : this;
    }
    image(imageUrl: string) {
        const imageType = imageUrl.startsWith('data:image/png') ? 'png' : 'jpeg';
        return imageUrl ? this.addPart({ type: 'image', imageType, imageUrl }) : this;
    }
    system(system: string) {
        return this.clone({ system: this.inputConfig.system ? this.inputConfig.system + "\n" + system : system });
    }
    format(format: LLMOutputFormat) {
        return this.clone({ format });
    }
    overwrite(overwrite: LLMOverwritePolicy) {
        return this.clone({ overwrite });
    }
    outputFile(output: string) {
        let format = this.inputConfig.format;
        // TODO: better way to determine format? pluggable?
        if (output.endsWith('.json')) {
            format = 'json';
        } else if (output.endsWith('.md')) {
            format = 'markdown';
        } else if (output.endsWith('.txt')) {
            format = 'string';
        }
        return this.clone({ output, format });
    }
    addMessage(content: string | LLMMessagePart[], role: 'user' | 'assistant' = 'user') {
        // TODO: crashes?
        const oldContext = this.inputConfig.context!;
        return this.clone({ context: oldContext.newContext([{ role, content }]) });
    }
    addObject(obj: any, name?: string, doctype: string = 'document') {
        if (obj === undefined || obj === null) return this;
        let objtext = typeof obj === 'string' ? obj : this.objectToString(obj);
        if (name) {
            objtext = `<${doctype} id="${name}">\n${objtext}\n</${doctype}>`;
        }
        return this.addMessage(objtext);
    }
    addArtifact(artifact: LLMArtifact) {
        return this.addObject(artifact.content, artifact.metadata.name).timestamp(artifact.metadata.timestamp);
    }
    timestamp(timestamp: number) {
        if (!this.inputConfig.timestamp || timestamp > this.inputConfig.timestamp) {
            return this.clone({ timestamp });
        } else {
            return this;
        }
    }
    _continue(context: LLMChatContext) {
        return this.clone({ context, ...inputConfigDefaults });
    }
    getMessages() {
        return this.inputConfig.context?.getAllMessages() || [];
    }
    getFileExtension() {
        if (this.inputConfig.format === 'json') {
            return 'json';
        } else if (this.inputConfig.format === 'markdown') {
            return 'md';
        }
        return 'out';
    }
    _outputFilename() {
        return this.inputConfig.output || `llm-${processID}-${this.env.nextSequence().toString(36)}.${this.getFileExtension()}`;
        //return this.inputConfig.output || `llm-${hashInputConfig(this.inputConfig)}.out`;
    }
    async run(outputSchema: z.ZodString = z.string()) {
        return await this._generate(outputSchema, typeof this.inputConfig.format == 'string' ? this.inputConfig.format : 'string'); // TODO?
    }
    // TODO: can't generate a string if the output is a schema
    private async _generate<
        OutputSchema extends LLMContentType,
        OutputType = z.TypeOf<OutputSchema>
    >(outputSchema: OutputSchema, format: LLMOutputFormat, returnToolResults?: boolean): Promise<LLMHelperResult<OutputType>> {
        let self: LLMHelper = await this.reduceContext();
        let outpath = this._outputFilename()
        let initialContext = null;
        let toolUses = 0;
        // TODO: pluggable retry policies?
        for (let trial = 0; trial < self.retries; trial++) {
            let isSchema = format === 'json'; // TODO? look at schema type?
            let newConfig: LLMInputConfig = Object.assign({}, self.inputConfig, {
                format,
                schema: isSchema ? outputSchema : undefined,
                output: outpath,
                tools: toolUses == 0 ? self.inputConfig.tools : []
            });
            const step = await createRunnable(newConfig);
            const runResult = await step.run(self.env, {});
            const toolResults = getToolResults(runResult);
            if (!initialContext) {
                initialContext = runResult.context.parent!;
            }
            let runErrors: any = runResult.errors;
            // TODO: validate all tool results with schema?
            // TODO: returnToolResults is flaky
            if ((toolResults == null || returnToolResults) && !runResult.errors.length) {
                const content = runResult.artifacts[0].content;
                try {
                    // TODO: we don't need all trials in the context, just the last one
                    const output = outputSchema.parse(content) as OutputType;
                    // reparent the context if needed
                    // TODO? keep tool results?
                    const splitContext = runResult.context.parent!;
                    if (splitContext !== initialContext) {
                        runResult.context = runResult.context.reparent(splitContext, initialContext);
                    }
                    return new LLMHelperResult<OutputType>(self, runResult, output);
                } catch (e) {
                    console.error(`Error parsing tool results: ${e}`);
                    runErrors = e;
                }
            }
            this.env.removeArtifact(outpath);
            // TODO: configurable retry policies and prompts?
            if (toolResults != null && !returnToolResults) {
                self = self._continue(runResult.context).prompt(`Does tool_results contain the answer? If so, return it. Otherwise, try something else.`);
                trial = 0;
                toolUses++;
            } else {
                self = self._continue(runResult.context).prompt(`Try again. Error: ${this.objectToString(runErrors)}`);
                //console.log('Error:', trial, runErrors);
            }
        }
        throw new Error(`Failed to generate valid output after ${self.retries} trials`);
    }
    async generate<OutputSchema extends LLMSchema>(outputSchema: OutputSchema) {
        return await this._generate(outputSchema, 'json');
    }
    setRetries(retries: number) {
        this.retries = retries;
        return this;
    }
    async useTools<
        T extends readonly LLMToolImpl<any, any>[],
        O = ToolOutputType<T[number]>
    >(tools: T): Promise<LLMHelperResult<O[]>> {
        // TODO: unreliable
        const tool_results = z.object({ tool_results: z.record(z.unknown()) }); // TODO?
        const result = await this.setTools(tools)._generate(tool_results, 'json', true);
        if (result.runResult.errors.length == 0) {
            let tool_results = getToolResults(result.runResult);
            if (tool_results) {
                // validate all tool results
                let toolResult: LLMToolResult;
                let allResults: O[] = [];
                for (toolResult of Object.values(tool_results)) {
                    if (toolResult.success === false) {
                        throw new Error(`Tool failed: ${toolResult.error}`);
                    } else {
                        allResults.push(toolResult as O);
                    }
                }
                return new LLMHelperResult(this, result.runResult, allResults);
            }
        }
        throw new Error(`Tool failed: ${result.runResult.errors}`);
    }
    async embedding(text: string) {
        const api: LLMApi = this.getAPI();
        if (!api.embedding) {
            throw new Error('Model does not support embeddings');
        }
        return await api.embedding(text);
    }
    async reduceContext() {
        // TODO: pluggable reduce?
        // TODO: configurable by model
        // TODO: should stay in context?
        // TODO: how to reduce prompt also?
        if (this.inputConfig.context) {
            const initialMessages = this.inputConfig.context.getAllMessages();
            const reducedMessages = await this.reducer.reduce(initialMessages, this.maxTokens);
            if (reducedMessages) {
                console.log('Reduced messages from', estimateMessagesLength(initialMessages), 'to about', estimateMessagesLength(reducedMessages), 'bytes');
                return this.clone({ context: new LLMChatContext(null, reducedMessages) });
            }
        }
        return this;
    }
    // TODO: outputFile?
    async filter<T>(items: T[]) : Promise<T[]> {
        if (items.length == 0) return [];
        const textSize = safeJSONStringify(items).length;
        const targetSize = 5000; // TODO?
        if (items.length > 1 && textSize > targetSize) {
            const numSplits = Math.min(Math.ceil(textSize / targetSize), items.length);
            const itemsPerSplit = Math.ceil(items.length / numSplits);
            console.log('Splitting', items.length, 'items into', numSplits, 'splits of', itemsPerSplit, 'items each');
            const splititems = [];
            for (let i = 0; i < numSplits; i++) {
                splititems.push(items.slice(i * itemsPerSplit, (i + 1) * itemsPerSplit));
            }
            // filter in parallel
            return (await Promise.all(splititems.map((split) => this.filter(split)))).flat();
        } else {
            // TODO: what if another index field?
            const indexed_items = items.map((item, _id) => ({ _id, item }));
            const result = await this
                .addObject({ indexed_items })
                .system("Output the _id field of selected items that fit the critera.")
                .generate(z.object({
                    matching_items: z.array(z.number().min(0).max(items.length-1)).describe('The _id of items that should be selected.'), // TODO?
                }));
            const matching_indices = result.output.matching_items;
            return matching_indices.map(i => indexed_items[i].item);
        }
    }
    async tts(_params: LLMTTSInput) {
        const params = Object.assign({
            format: 'mp3',
            voice: 'alloy',
            rate: 1.0
        }, _params);
        const api: LLMApi = this.getAPI();
        if (!api.tts) {
            throw new Error('Model does not support TTS');
        }
        const hash = hashSHA256(safeJSONStringify(params));
        const outpath = `tts-${hash}.${params.format}`;
        if (await this.env.getLatestMetadata(outpath)) {
            return this.env.getLatestArtifact(outpath);
        }
        const content = await api.tts(params);
        return this.env.saveArtifact(newArtifact(outpath, content, 'binary'));
    }
    async transcribe(audioArtifact: LLMArtifact, prompt?: string) {
        const api: LLMApi = this.getAPI();
        if (!api.transcribe) {
            throw new Error('Model does not support transcription');
        }
        const audio = audioArtifact.content;
        if (!Buffer.isBuffer(audio)) {
            throw new Error('Invalid audio artifact');
        }
        const filename = audioArtifact.metadata.name;
        const format = filename.indexOf('.mp3') > 0 ? 'mp3' : 'wav'; // TODO
        const content = await api.transcribe({ audio, prompt, format });
        return content;
    }
}

export class LLMHelperResult<OutputType> {
    constructor(
        readonly parent: LLMHelper,
        readonly runResult: LLMRunResult,
        readonly output: OutputType
    ) {
    }
    continue() {
        return this.parent._continue(this.runResult.context);
    }
}
