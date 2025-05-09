import assert from 'node:assert';
import test from 'node:test';
import { createRunnable, LLMHelper } from '../src/llm.js';
import { MemoryStoreEnvironment, TemporaryFileSystemEnvironment } from '../src/env.js';
import { APITool } from '../src/tools/api.js';
import { z } from "zod";
import { WikipediaAPITool } from '../src/tools/wikipedia.js';

test('api', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new APITool()];
    const step = await createRunnable({
        prompt: 'Get a "safe" joke via JokeAPI.',
        format: {},
        output: 'joke.json',
        tools
    });
    const output = await step.run(env, {});
    console.log(output.artifacts[0].content)
    const joke = (output.artifacts[0].content as any).tool_results.APITool;
    console.log(joke);
    assert.ok(joke.content);
    assert.ok(joke.content.id);
    assert.ok(!joke.content.error);
});

test('api 2', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new WikipediaAPITool()];
    let llm = new LLMHelper(env).addTools(tools);
    // use wikipedia
    let out1 = await llm
        .prompt('What national park is Boulders Beach part of? Use Wikipedia API.')
        .generate(z.object({
            answer: z.string().describe('The name of the park.')
        }));
    console.log(out1.output);
    console.log(out1.runResult.context.getAllMessages())
    assert.ok(out1.output.answer.includes('Table Mountain'));
});
