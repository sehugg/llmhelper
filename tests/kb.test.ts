import assert from 'node:assert';
import test from 'node:test';
import { KBDatabase } from '../src/kb.js';
import { LLMHelper } from '../src/llm.js';
import { SQLiteQueryTool } from '../src/tools/sqlite.js';
import { KBSearchTool } from '../src/tools/kbtool.js';

test('kb db', async (t) => {
    const kb = new KBDatabase('/tmp/test.db');
    kb.addEntry({
        workflow: 'test',
        title: 'greeting',
        context: [{ role: 'user', content: 'hello' }],
        score: 0.5
    });
    kb.addEntry({
        workflow: 'test',
        title: 'greeting',
        context: [{ role: 'user', content: 'goodbye' }],
        score: 0.5
    });
    const q = await kb.search('hello OR fooface');
    console.log(q);
    assert.equal(1, q.length);
});

test('kb embedding', async (t) => {
    const kb = new KBDatabase('/tmp/test.db');
    const vec = new Float32Array(64).fill(0.5);
    const embed = { model: 'test', embedding: vec };
    try {
        kb.addEmbeddings({
            kb_id: 1,
            phrase: 'greeting',
            embeddings: [embed]
        });
        const results = kb.searchEmbeddings(embed);
        console.log(results);
        assert.equal(1, results.length);
    } catch (e) {
        console.log(e);
        throw e;
    }
});

test('sqlite tool', async (t) => {
    const llm = await new LLMHelper()
        .addTools([new SQLiteQueryTool('/tmp/test.db')])
        .prompt('what tables are available to query?')
        .run();
    console.log(llm.output);
    assert.ok(llm.output.includes('llm_kb_fts'))
});

test('kbtool', async (t) => {
    const llm = await new LLMHelper()
        .addTools([new KBSearchTool(new KBDatabase('/tmp/test.db'))])
        .prompt('what kb entries mention a greeting?')
        .run();
    console.log(llm.output);
    assert.ok(llm.output.includes('hello'));
});
