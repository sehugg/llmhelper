import assert from 'node:assert';
import test from 'node:test';
import { MemoryStoreEnvironment, newArtifact, TemporaryFileSystemEnvironment } from '../src/env.js';
import { LLMChatContext } from '../src/context.js';
import { LLMHelper } from '../src/llm.js';
import { LLMEnvironment } from '../src/types.js';

async function testEnv(env: LLMEnvironment) {
    assert.ok(!await env.getLatestMetadata('src/test.txt'));
    const art = newArtifact('src/test.txt', 'Hello, world!');
    await env.saveArtifact(art);
    assert.ok(await env.getLatestMetadata('src/test.txt'));
    const art2 = await env.getLatestArtifact('src/test.txt');
    assert.equal(art2.content, 'Hello, world!');
    const art3 = await env.saveArtifact(art2);
    assert.equal(art3.metadata.timestamp, art2.metadata.timestamp);
    assert.equal(art3.metadata.version, 2);
    console.log(art3);
    const listsrc = await env.listArtifacts('src');
    assert.deepEqual(listsrc, ['src/test.txt']);
    const listroot = await env.listArtifacts();
    assert.deepEqual(listroot, ['src/test.txt']);
    await env.removeArtifact('src/test.txt');
    assert.deepEqual(env.getLogs().map(l => l.action), [ 'write', 'read', 'write', 'delete' ]);
    assert.notStrictEqual(env.nextSequence(), env.nextSequence());
}

test('memory store env', async (t) => {
    await testEnv(new MemoryStoreEnvironment());
});

test('file system env', async (t) => {
    const fsenv = new TemporaryFileSystemEnvironment();
    t.after(() => fsenv.deleteAll());
    await testEnv(fsenv);
});

test('context', async (t) => {
    const ctx0 = new LLMChatContext(null, [{ role: 'user', content: 'Hello, world!' }]);
    const ctx1 = ctx0.newContext([{ role: 'user', content: 'Hello, again!' }]);
    const ctx2 = ctx1.newContext([{ role: 'user', content: 'Hi!' }]);
    const ctx3 = ctx2.newContext([{ role: 'user', content: 'Goodbye!' }]);
    const ctx4 = ctx3.reparent(ctx2, ctx0);
    console.log(ctx4.getAllMessages());
    assert.equal(2, ctx4.getAllMessages().length);
    const ctx5 = ctx4.newContext([{ role: 'user', content: 'Goodbye!' }]);
    console.log(ctx5.getAllMessages());
    assert.equal(3, ctx5.getAllMessages().length);

    const env = new MemoryStoreEnvironment();
    const h1 = new LLMHelper(env, { context: ctx4 });
    assert.equal(2, h1.inputConfig?.context?.getAllMessages().length);
    const h2 = h1.addMessage('Hello, I am an assistant.');
    console.log(h2.inputConfig.context?.getAllMessages());
    assert.equal(3, h2.inputConfig?.context?.getAllMessages().length);
});

