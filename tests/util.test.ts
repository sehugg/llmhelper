import assert from 'node:assert';
import test from 'node:test';
import { stripMarkdownCodeBlockDelimiters } from '../src/util.js';

test('stripMarkdownCodeBlocks', async (t) => {
    assert.strictEqual(stripMarkdownCodeBlockDelimiters("\n\n```c\nfoo\n```"), '\n\nfoo\n');
    assert.strictEqual(stripMarkdownCodeBlockDelimiters("```json\n{}\n```\n"), '\n{}\n');
});

