import assert from 'node:assert';
import test from 'node:test';
import { z } from 'zod';
import { MemoryStoreEnvironment } from '../src/env.js';
import { LLMHelper } from '../src/llm.js';
import { APITool } from '../src/tools/api.js';
import { JSTool } from '../src/tools/js.js';
import { WebTool } from '../src/tools/web.js';
import { FetchTool } from '../src/tools/fetch.js';

const Schema = z.object({
    success: z.boolean().describe('Whether the temperature was found.'),
    nyc: z.coerce.number().optional().describe('The current temperature in NYC, degress C.'),
    url: z.coerce.string().optional().describe('The URL that this result comes from.'),
});

test('multitool', async (t) => {
    const env = new MemoryStoreEnvironment();
    const tools = [new WebTool(), new JSTool(), new APITool(), new FetchTool()];
    const rootllm = new LLMHelper(env).addTools(tools);
    const result = await rootllm
        .prompt('What is the current temperature in NYC? Use your tools. (open-meteo?)')
        .generate(Schema);
    console.log(result.output);
    assert.ok(result.runResult.toolCalls?.length);
    assert.ok(result.output.success);
    assert.ok(typeof result.output.nyc === 'number' && result.output.nyc > -50 && result.output.nyc < 50);
    const verify = await result.continue().prompt('Can you check this result using tools?').generate(Schema);
    console.log(verify.output);
    assert.ok(verify.output.success);
    assert.ok(verify.runResult.toolCalls?.length);
});
