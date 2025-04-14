import assert from 'node:assert';
import test from 'node:test';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MemoryStoreEnvironment } from "../src/env.js";
import { LLMHelper } from "../src/llm.js";

// Define a schema using Zod
const UserSchema = z.object({
  name: z.string().describe("The user's full name including middle name"),
  age: z.number().int().positive(),
  email: z.string().email().optional(),
  tags: z.array(z.string()).min(1),
  role: z.enum(["admin", "user", "guest"]),
})

// Generate TypeScript type from the schema
type User = z.infer<typeof UserSchema>;

// Generate JSON Schema
const jsonSchema = zodToJsonSchema(UserSchema, "mySchema");

console.log(JSON.stringify(jsonSchema, null, 2));

// Example usage
const validateUser = (data: unknown): User => {
  return UserSchema.parse(data);
};

try {
  const user = validateUser({
    name: "Alice",
    age: 30,
    email: "alice@example.com",
    tags: ["developer"],
    role: "admin",
  });
  console.log("Valid user:", user);
} catch (error) {
  console.error("Validation error:", error);
}

test('zod schema generate', async (t) => {
  const env = new MemoryStoreEnvironment();
  const helper = new LLMHelper(env);
  const user1 = await helper
    .prompt('Give me an example output for a good superhero.')
    .outputFile('good.json')
    .generate(UserSchema);
  console.log("Valid user:", user1.output);
  const user2 = await user1.continue()
    .prompt('Now give me the evil twin with a similar name and same age')
    .outputFile('evil.json')
    .generate(UserSchema);
  console.log("Valid user:", user2.output);
  assert.equal(user2.output.age, user1.output.age);
});

