# LLMHelper: Leverage Language Models Helpfully Expediting Logic Processing and Easy Runtime

Tired of lang-chaining nodes together? Just want to write some code? LLMHelper helps you help yourself.

Key features:

* **Plain TypeScript Workflows:** No cryptic YAML or bizarre DSLs here. Just good ol' fluent TypeScript you actually understand.
* **Structured Output:** Input a Zod schema, get a typed JSON result. We'll keep asking until the LLM gets it right.
* **Restartable Workflows:** Hit Ctrl-C while generating that award-winning novel? No problem! LLMHelper can pick up where you left off.
* **Run Tools via Docker:** Need access to a specific command-line tool? Just slap it into a Docker container 
and let LLMHelper handle the rest.
* **Tree Search:** Don't settle for linear thinking! Explore possibilities with powerful tree 
search algorithms built right in.


## Get Started

### Installation

You need Node 22. Run `npm install` and create a config file:

```bash
npm install
npx playwright install
cp config.yml.example config.yml
```

Edit `config.yml` and replace the `apiKey` placeholders with your API keys for each service you want to use.

You can also set parameters like URL and temperature for some models.

### Environment Setup

An Environment stores artifacts, e.g. content files + metadata.
This allows you to run workflows and automatically use previous results.

FileSystemEnvironment stores artifacts in a directory tree, ideal for persistent or restartable workflows.
```typescript
const env = new FileSystemEnvironment("./project_name"); 
const env = new TemporaryFileSystemEnvironment(); // creates a new folder in /tmp
```

MemoryStoreEnvironment stores artifacts in memory only:
```typescript
const env = new MemoryStoreEnvironment();
``` 

NullEnvironment is the default. It doesn't store anything.

### Initialize LLMHelper

Select a model and optionally define its initial system message:

```typescript
const llm = new LLMHelper(env).model('mini').system("You are a helpful assistant.");
```

Replace `mini` with your desired language model or alias as defined in `config.yml` (e.g., `local`, `llama3`).

The default model is `default`, unless the `LLM_DEFAULT_MODEL` environment variable is set.

### Run an Example

```typescript
node --loader ts-node/esm examples/backronym.ts "a new LLM framework"
```

## Unstructured Output

Use `run()` to generate text or Markdown:

```typescript
const result = await llm
    .system('Output everything in ALL CAPS.')
    .prompt('Say "hello".')
    .outputFile('sys.txt')
    .run();
console.log(result.output); // "HELLO"
```

The framework will automatically add formatting prompts to the system message for text, Markdown, JSON, based on output file extension and whether a schema is present. Or use the `format()` method to set it manually.

## Structured Output

Use `generate()` to generate validated JSON objects via [Zod](https://zod.dev/) schemas:

```typescript
const UserSchema = z.object({
    name: z.string().describe("The user's full name including middle name"),
    age: z.number().int().positive(),
    email: z.string().email().optional(),
    tags: z.array(z.string()).min(1),
    role: z.enum(["admin", "user", "guest"]),
}).refine(data => data.name.split(" ").length == 3, {
    message: "Name must include first, middle, and last name",
});

const user1 = await llm
    .prompt('Give me an example output for a good superhero.')
    .outputFile('good.json')
    .generate(UserSchema);
console.log(user1.output.age);
```

## Context

LLMContext is a chain of message lists.
You can call `continue()` on a result to continue the conversation:

```typescript
const user2 = await user1.continue()
    .prompt('Now give me the evil twin with a similar name and same age')
    .generate(UserSchema);
```

LLMHelper is immutable, so you have to store it to a mutable var if you extend it:

```typescript
let llm = root_llm;
llm = user1.continue();
```

## Overwrite Policy

Each operation results in at least one file being written to the Environment.
You might want to restart a run, and not generate fresh results from the LLM.
But how do you know if you want to overwrite a file?
Use `llm.overwrite(policy)`:

* fail (default) - throw an error instead of overwriting an existing file
* skip - quietly reuse the results of an existing file
* force - always overwrite existing files
* exact - only reuse if prompt is the same
* timestamp - only reuse if input timestamps are later than output timestamp


## Tool Use

You can use tools in a few different ways.
Use `useTools()` to force output of raw tool results (the return type is an array of the union of all tool output types):

```typescript
const tools = [new JSTool()] as const;
const result = await llm
    .prompt('Compute the sieve of Eratosthenes up to 10000, and return the last prime number found.')
    .useTools(tools);
console.log(result[0].js_result); // 9973
```

Or call `addTools()` and let the LLM figure it out:

```typescript
const result = await llm.prompt(`What is the 100,000th prime number? Use tools.`)
    .addTools([new JSTool()])
    .run();
```

This may have mixed results, because not all LLMs are very good at tool usage.
You may have better luck getting structured outputs from the LLM, and calling tool methods directly from the code.

Tools available:
* JavaScript execution
* Docker image build/run
* Web browsing
* API use
* Fetch tool (parses various kinds of web content)

NOTE: Docker use may use lots of disk space.
Consider running `docker container prune` and `docker image prune` to clean up.

You can add environment variables to your Docker images via your `config.yml`, for example to add a HTTP proxy:
```yaml
tools:
  docker:
    env:
      http_proxy: http://192.168.0.123:3128/
```
If you want to use tools to call APIs that pass secrets via query string (e.g. api key) you can add them to the secrets section of config.yml. They are identified by host or domain name, for example:
```yaml
  googleapis.com:
    key: ...
    cx: ...
```

## Benchmarking

```typescript
let models = ['mini', 'gemini', 'llama3', 'phi3.5'];
const llm = rootllm.prompt(`What is the 100,000th prime number?`).addTools([new JSTool()]);
const results = await benchmarkModels(llm, models,
    z.object({ answer: z.number() }),
    (o) => o.answer == 1299709);
```

## Images

```typescript
const out1 = await llm
    .prompt('What is the make, model, and color of this car?')
    .image(await loadImageToBase64Url('examples/car.jpeg'))
    .run();
```
