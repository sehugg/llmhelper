import assert from 'node:assert';
import test from 'node:test';
import { MemoryStoreEnvironment, newArtifact } from '../src/env.js';
import { createRunnable, LLMHelper, loadYAMLRunnable } from '../src/llm.js';
import { LLMOverwritePolicy } from '../src/types.js';

test('format', async (t) => {
    let llm = new LLMHelper();
    assert.ok(llm._outputFilename().startsWith('llm-'));
    assert.ok(llm._outputFilename().endsWith('.out'));
    assert.equal('string', llm.inputConfig.format);
    llm = llm.outputFile('foo.md');
    assert.equal('foo.md', llm._outputFilename());
    assert.equal('markdown', llm.inputConfig.format);
});

test('embedding', async (t) => {
    let llm = new LLMHelper();
    let embed = await llm.embedding('this is the sentence');
    assert.ok(embed.embedding.length);
    console.log(embed.model, embed.embedding.length)
});

test('overwritePolicy', async (t) => {
    const env = new MemoryStoreEnvironment();
    const a1 = newArtifact('foo1.md', 'hello');
    await env.saveArtifact(a1);
    const a2 = newArtifact('foo2.md', 'world');
    await env.saveArtifact(a2);
    const policies : LLMOverwritePolicy[] = ['force', 'exact', 'timestamp', 'fail', 'skip'];
    for (const overwrite of policies) {
        const step = await createRunnable({
            prompt: 'Just say "FOO".',
            format: 'string',
            output: 'foo2.md',
            overwrite
        });
        let b;
        try {
            b = await step.isStale(env);
        } catch (e) {
            console.log(e);
            assert.strictEqual(overwrite, 'fail');
        }
        console.log(overwrite, b);
        assert.ok(b || overwrite !== 'force', overwrite);
        try {
            const result = await step.run(env, {});
            console.log(overwrite, result.artifacts[0].metadata.version); // TODO?
        } catch (e) {
            console.log(e);
            assert.strictEqual(overwrite, 'fail');
        }
    }
});

