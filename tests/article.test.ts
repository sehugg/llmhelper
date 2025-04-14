import assert from 'node:assert';
import test from 'node:test';
import matter from 'gray-matter';
import { writeArticle } from '../src/recipes/article.js';
import { LLMHelper, logger } from '../src/llm.js';
import { MemoryStoreEnvironment } from '../src/env.js';

test('gray matter', async (t) => {
    const r = matter('---\ntitle: "foo"\n---\n\n# Hello\n\nWorld');
    assert.equal(r.data.title, 'foo');
    assert.equal(r.content, '\n# Hello\n\nWorld');
    r.data.date = new Date();
});

test('blog post', async (t) => {
    const llm = new LLMHelper(new MemoryStoreEnvironment());
    const out = await writeArticle(llm, 'a very short post about hello world', { code: 'int main() { return 0; }' });
    logger.logMessages(out.continue().getMessages());
    assert.ok(out.output.includes('title:'))
    assert.ok(out.output.includes('description:'))
    assert.ok(out.output.includes('filename:'))
    assert.ok(out.output.includes('tags:'))
    assert.strictEqual(out.runResult.artifacts.length, 2);
});

test('gray matter', async (t) => {
    const r = matter('---\ntitle: "foo"\n---\n\n# Hello\n\nWorld');
    assert.equal(r.data.title, 'foo');
    assert.equal(r.content, '\n# Hello\n\nWorld');
    r.data.date = new Date();
});
