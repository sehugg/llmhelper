import test from 'node:test';
import assert from 'node:assert';
import { FileSystemEnvironment } from '../src/env.js';
import { LLMHelper } from '../src/llm.js';
import { LLMTTSInput } from '../src/types.js';

test('tts', async (t) => {
    let llm = new LLMHelper(new FileSystemEnvironment('/tmp/tts')).model('mini');
    const params : LLMTTSInput = {
        text: 'hello world',
        voice: 'fable',
        rate: 1.2,
        quality: 'normal',
        format: 'mp3'
    };
    const a = await llm.tts(params);
    console.log(a);
    assert.ok(Buffer.isBuffer(a.content));
    // TODO: timestamp differs on create vs read
    const b = await llm.transcribe(a);
    assert.equal(b, 'Hello World.');
});
