import assert from 'node:assert';
import test from 'node:test';
import { MemoryStoreEnvironment } from '../src/env.js';
import { LLMHelper } from '../src/llm.js';
import { z } from 'zod';

// Define a schema using Zod
const UserSchema = z.object({
    name: z.string().describe("The user's full name including middle name"),
    age: z.number().int().positive(),
    email: z.string().email().optional(),
    tags: z.array(z.string()).min(1),
    role: z.enum(["admin", "user", "guest"]),
}).refine(data => data.name.split(" ").length == 3, {
    message: "Name must include first, middle, and last name",
});

async function testModel(model: string) {
    const env = new MemoryStoreEnvironment();
    const helper = new LLMHelper(env).model(model);
    const user1 = await helper
        .prompt('Give me an example output for a good superhero.')
        .generate(UserSchema);
    console.log("Valid user:", user1.output);
    const user2 = await user1.continue()
        .prompt('Now give me the evil twin with a similar name and same age')
        .generate(UserSchema);
    console.log("Valid user:", user2.output);
    assert.equal(user2.output.age, user1.output.age);
    const poem = await user2.continue()
        .prompt('Write a haiku about the two characters')
        .run();
    console.log(poem.output);

    const markdown = await helper
        .prompt('Give me a Markdown file that says FOO and a single C code block that says main()')
        .outputFile('output.md')
        .run();
    console.log(markdown.output);
    assert.ok(markdown.output.includes('FOO'));
    assert.ok(markdown.output.includes('```c\n'));

    const sys = await helper
        .system('Output everything in ALL CAPS.')
        .prompt('Say "hello".')
        .outputFile('sys.txt')
        .run();
    console.log(sys.output);
    assert.ok(sys.output.includes('HELLO'));
}

// TODO: tools

test('openai', async (t) => testModel('mini'));
test('google', async (t) => testModel('gemini'));
test('antropic', async (t) => testModel('haiku'));
test('local', async (t) => testModel('local'));
test('huggingface', async (t) => testModel('gemma2-27b'));
