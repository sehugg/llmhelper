import assert from 'node:assert';
import test from 'node:test';
import { createRunnable, LLMHelper, logger } from '../src/llm.js';
import { MemoryStoreEnvironment, TemporaryFileSystemEnvironment } from '../src/env.js';
import { JSTool } from '../src/tools/js.js';
import z from 'zod';


test('js', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new JSTool()];
    const step = await createRunnable({
        prompt: 'Compute the sieve of Eratosthenes up to 10000, and return the last prime number found.',
        format: { 'result': 'number' },
        output: 'sieve.json',
        tools
    });
    const output = await step.run(env, {});
    console.log(output.context.getAllMessages());
    console.log(output.artifacts[0]);
    assert.equal(output.artifacts[0].metadata.name, 'sieve.json');
    assert.equal(output.artifacts[0].metadata.contentType, 'json');
    assert.equal((output.artifacts[0].content as any).tool_results.JSTool.js_result, 9973);
});

test('js useTools', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new JSTool()] as const;
    const helper = new LLMHelper(env);
    const result = await helper
        .prompt('Compute the sieve of Eratosthenes up to 10000, and return the last prime number found.')
        .useTools(tools);
    console.log(result);
    assert.equal(result.output[0].js_result, 9973);
});

test('js strawberry', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new JSTool()];
    const helper = new LLMHelper(env);
    const result = await helper
        .prompt('How many Rs are in STRAWBERRY?')
        .addTools(tools)
        .generate(z.object({ answer: z.number() }))
    console.log(result);
    assert.equal(result.output.answer, 3);
});
