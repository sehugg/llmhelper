import assert from 'node:assert';
import test from 'node:test';
import { z } from "zod";
import { MemoryStoreEnvironment } from '../src/env.js';
import { LLMHelper } from '../src/llm.js';
import { APITool } from '../src/tools/api.js';
import { WebTool } from '../src/tools/web.js';


test('web', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new WebTool()];
    const llm = new LLMHelper(env);
    const result = await llm.prompt("Grab ars technica home page").useTools(tools);
    const text = result.output[0].text + "";
    console.log(text.length, text.substring(0, 200));
    assert.ok(text.length > 50);
    assert.ok(!text.startsWith("There is no"));
    assert.ok(!text.startsWith("I don't see"));
    assert.ok(!text.startsWith("I can't find"));
});

test('web/api tools stuctured', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new APITool(), new WebTool()];
    const helper = new LLMHelper(env).addTools(tools);
    const out1 = await helper
        .prompt('Read this and give me install instructions for npm: https://github.com/NachoBrito/ts-textrank')
        .generate(z.object({
            installCommands: z.string(),
            //sampleProgram: z.string()
        }))
    console.log(out1.output);
    assert.ok(out1.output.installCommands.includes('ts-textrank'));
    assert.equal(out1.runResult.artifacts.length, 1);
    console.log(out1.runResult.artifacts[0].metadata.chatResult);
});

test('web/api tools non-stuctured', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new APITool(), new WebTool()];
    const helper = new LLMHelper(env).addTools(tools);
    const out1 = await helper
        .prompt('Summarize these webpages and mention the title: https://example.com/ https://example.org/')
        .run();
    console.log(out1.output);
    assert.ok(out1.output.includes('Example Domain'));
    assert.equal(out1.runResult.artifacts.length, 1);
    console.log(out1.runResult.artifacts[0].metadata.chatResult);
});
