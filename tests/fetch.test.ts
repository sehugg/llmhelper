import assert from 'node:assert';
import test from 'node:test';
import { z } from "zod";
import { LLMHelper } from '../src/llm.js';
import { FetchTool } from '../src/tools/fetch.js';

test('fetch youtube', async (t) => {
    const out = await new FetchTool().fetchPage('https://www.youtube.com/watch?v=lTvW2IyhwZw.');
    console.log(out);
    assert.ok(out.text.length);
    assert.strictEqual(out.tool, 'youtube');
});

test('fetch google search', async (t) => {
    const out1 = await new LLMHelper()
        .prompt('Use https://www.googleapis.com/customsearch/v1?q= to find information about Cheetos.')
        .useTools([new FetchTool()]);
    const out = out1.output[0];
    console.log(out);
    assert.strictEqual(out.tool, 'googleapis');
    assert.ok(out.links?.length);
});

test('fetch pdf', async (t) => {
    const result = await new FetchTool().fetchPage('http://www.robjhyndman.com/papers/mase.pdf');
    console.log(result.text);
    assert.ok(result.text.length);
});

test('fetch wikipedia 2', async (t) => {
    const result = await new FetchTool().fetchPage('https://en.wikipedia.org/wiki/Flamin%27_Hot_Cheetos');
    assert.strictEqual(result.url, 'https://en.wikipedia.org/wiki/Cheetos');
});

test('fetch wikipedia', async (t) => {
    const out1 = await new LLMHelper()
        .prompt('Fetch the Wikipedia page for James Earl Jones.')
        .useTools([new FetchTool()]);
    const out = out1.output[0];
    assert.strictEqual(out.tool, 'wikipedia');
    assert.strictEqual(out.title, 'James Earl Jones');
    assert.strictEqual(out.url, 'https://en.wikipedia.org/wiki/James_Earl_Jones');
});

test('fetch wikipedia', async (t) => {
    const out1 = await new LLMHelper()
        .prompt('Fetch the example.com home page.')
        .useTools([new FetchTool()]);
    const out = out1.output[0];
    assert.strictEqual(out.tool, 'web');
    assert.strictEqual(out.title, 'Example Domain');
    assert.strictEqual(out.url, 'http://example.com/');
});

test('fetch RSS', async (t) => {
    const out1 = await new LLMHelper()
        .prompt('Fetch the Hacker News RSS feed (http://news.ycombinator.com/rss)')
        .useTools([new FetchTool()]);
    const out = out1.output[0];
    assert.strictEqual(out.tool, 'rss');
    assert.strictEqual(out.title, 'Hacker News');
    assert.strictEqual(out.url, 'http://news.ycombinator.com/rss');
});

test('fetch wayback machine', async (t) => {
    const avail = await new FetchTool().isAvailableOnWaybackMachine('http://www.cnn.com/2001/WORLD/meast/09/18/arafat.cease/index.html');
    assert.strictEqual(avail, 'http://web.archive.org/web/20230803050727/http://www.cnn.com/2001/WORLD/meast/09/18/arafat.cease/index.html');
});
