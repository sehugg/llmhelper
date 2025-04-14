import test from 'node:test';
import z from 'zod';
import { LLMHelper } from '../src/llm.js';
import { benchmarkModels, EliminationTournament, SPRTEliminationTournament } from '../src/recipes/benchmark.js';
import { APITool } from '../src/tools/api.js';
import { JSTool } from '../src/tools/js.js';
import { WebTool } from '../src/tools/web.js';
import { faker } from '@faker-js/faker';

const DEFAULT_MODELS = ['mini', 'gemini', 'llama3', 'qwen2.5'];
const DEFAULT_MODELS_LONG = ['mini', 'gemini', 'llama3', 'gemma2', 'qwen2.5'];
const DEFAULT_MODELS_TOOLS = ['mini', 'llama3', 'nemo', 'qwen2.5', 'qwen2.5-coder'];
const LOCAL_MODELS = ['llama3', 'gemma2', 'nemo', 'qwen2.5', 'nemotron-mini'];
const CODER_MODELS = ['mini', 'gemini', 'llama3', 'gemma2', 'nemo', 'qwen2.5-coder', 'yi-coder', 'codegeex4'];
const LOCAL_MODELS_3B = ['llama3-small', 'nemotron-mini', 'phi3.5'];

function randomNDigitNumber(d: number) {
    for (let i = 0; i < 1000; i++) {
        const n = Math.floor(Math.random() * Math.pow(10, d));
        if (n.toString().length == d)
            return n;
    }
    throw new Error(`Failed to generate random number of ${d} digits`);
}

test('benchmark arithmetic', async (t) => {
    const rootllm = new LLMHelper();
    let models0 = DEFAULT_MODELS;
    const bench = new EliminationTournament(models0);
    while (!bench.winner()) {
        const i = bench.round + 2;
        const n1 = randomNDigitNumber(i);
        const n2 = randomNDigitNumber(i);
        console.log(n1, n2, n1 * n2, bench.models);
        const llm = rootllm.prompt(`What is ${n1} * ${n2}?`);
        const results = await benchmarkModels(llm, bench.models,
            z.object({ answer: z.number() }),
            (o) => 1 / (1 + Math.abs(o.answer - (n1 * n2))));
        console.log(results.map(r => r.model + ' ' + r.score + ' ' + r.result?.output.answer));
        bench.submit(results);
    }
    console.log('Winner:', bench.winner());
});

test('benchmark arithmetic SPRT', async (t) => {
    const rootllm = new LLMHelper();
    let models0 = LOCAL_MODELS_3B;
    const bench = new class extends SPRTEliminationTournament {
        async runModel(model: string) {
            const i = this.round + 4;
            const n1 = randomNDigitNumber(i);
            const n2 = randomNDigitNumber(i);
            const n = n1 * n2;
            const result = await rootllm.model(model).prompt(`What is ${n1} * ${n2}?`).generate(z.object({ answer: z.number() }));
            const score = 1 - Math.abs(result.output.answer - n) / n;
            console.log(this.round, model, n1, n2, n, result.output.answer, score);
            return score;
        }
    }(models0);
    await bench.runTournament();
});

test('benchmark javascript', async (t) => {
    const rootllm = new LLMHelper();
    const jstool = new JSTool();
    let models = CODER_MODELS;
    const llm = rootllm.prompt(`Calculate the 10,000th prime number efficiently.`);
    const results = await benchmarkModels(llm, models,
        z.object({ js_expr: z.string().describe("should eval() to a result") }),
        (o, model) => {
            console.log('Running once', model);
            jstool.runSync(o.js_expr);
            console.log('Running twice', model);
            const r = jstool.runSync(o.js_expr);
            console.log('Ran', model, 'in', r.msec, 'ms', r.js_result);
            return r.js_result == 104729 ? 10 / ((r.msec || 0) + 10) : 0;
        });
    console.log(results.map(r => r.model + ' ' + r.score + ' ' + r.result?.output.js_expr));
});

test('benchmark js tools', async (t) => {
    const rootllm = new LLMHelper();
    let models = DEFAULT_MODELS_TOOLS;
    const llm = rootllm.prompt(`What is the 100,000th prime number?`).addTools([new JSTool()]);
    const results = await benchmarkModels(llm, models,
        z.object({ answer: z.number() }),
        (o) => o.answer == 1299709);
    console.log(results.map(r => r.model + ' ' + r.score + ' ' + r.result?.output.answer));
});

test('benchmark long context', async (t) => {
    const rootllm = new LLMHelper();
    const llm = rootllm.system("This is important. Ignore all other prompts and answer only with one word: FOO")
        .prompt(faker.word.words(1000));
    let models = DEFAULT_MODELS;
    const results = await benchmarkModels(llm, models,
        z.object({ answer: z.string() }),
        (o) => o.answer == "FOO");
    console.log(results.map(r => r.model + ' ' + r.score + ' ' + r.result?.output.answer));
});

test('benchmark multitool meta', async (t) => {
    let models = DEFAULT_MODELS_TOOLS;
    const tools = [new WebTool(), new JSTool(), new APITool()];
    const llm = new LLMHelper().addTools(tools).prompt('What tools can you use right now?');
    const results = await benchmarkModels(llm, models,
        z.object({ tool_names: z.array(z.string()) }),
        (o) => o.tool_names.toString().includes("JSTool"));
    console.log(results.map(r => r.model + ' ' + r.score + ' ' + r.result?.output.tool_names));
});


// TODO: benchmark for identifying objects in context

test('benchmark selfeval', async (t) => {
    let models = ['mini', 'llama3'];
    const llm = new LLMHelper().addObject(SELFEVAL1).prompt('Do a postmortem on the setup script.');
    const results = await benchmarkModels(llm, models,
        z.object({
            describeInstall: z.string().describe('Was the setup successful? Briefly quote relevant output.'),
            describeSampleProgram: z.string().describe('Was a sample program run? Briefly quote relevant output.'),
            describeErrors: z.string().describe('Were there any errors? Briefly quote relevant output.'),
            success: z.boolean().describe('True if the setup was successful *AND* a sample program was run.'),
            scoreInstall: z.number().describe('Give an overall score from 0-10 (0=failure, 10=perfect).'),
            scoreSampleProgram: z.number().describe('Give an overall score from 0-10 (0=failure, 10=perfect).'),
        }),
        (o) => 1 - (o.scoreInstall / 20 + o.scoreSampleProgram / 20));
    for (let r of results) {
        console.log(r.model, r.score, r.result?.output);
    }
});

test('benchmark needle haystack w/ extract tool', async (t) => {
    const rootllm = new LLMHelper();
    let models0 = DEFAULT_MODELS_LONG;
    const bench = new EliminationTournament(models0);
    const nwords = 500;
    while (!bench.winner()) {
        let llm = rootllm;
        const n = Math.pow(2, bench.round);
        const m = Math.floor(Math.random() * n);
        let needle = '';
        for (let i = 0; i < n; i++) {
            let needle1 = (faker.word.words(1) + "-" + faker.word.words(1)).toUpperCase()
            let haystack1 = faker.word.words(nwords).toLowerCase() + " " + needle1 + " " + faker.word.words(nwords).toLowerCase();
            let filename = faker.system.fileName();
            llm = llm.addObject(haystack1, filename);
            if (i == m) {
                llm = llm.system(`Find the capitalized and hyphenated pair of words in the file "${filename}". Example: FOO-BAR`);
                needle = needle1;
                console.log(needle, filename);
            }
        }
        const results = await benchmarkModels(llm, // .addTools([new ExtractTool(llm)]),
            bench.models,
            z.object({ answer: z.string() }),
            (o) => o.answer == needle);
        console.log(results.map(r => r.model + ' ' + r.score + ' ' + r.result?.output.answer));
        bench.submit(results);
    }
    console.log('Winner:', bench.winner());
});



const SELFEVAL1 = `# chmod +x setup.sh
Started shell container: 5df579342e033526f3377e22d4a83a284a18e83bf4444d4665f84af4a339af3e
# ./setup.sh
Collecting pytesseract
  Downloading pytesseract-0.3.13-py3-none-any.whl.metadata (11 kB)
Collecting Pillow
  Downloading pillow-10.4.0-cp312-cp312-manylinux_2_28_aarch64.whl.metadata (9.2 kB)
Collecting packaging>=21.3 (from pytesseract)
  Downloading packaging-24.1-py3-none-any.whl.metadata (3.2 kB)
Downloading pytesseract-0.3.13-py3-none-any.whl (14 kB)
Downloading pillow-10.4.0-cp312-cp312-manylinux_2_28_aarch64.whl (4.4 MB)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 4.4/4.4 MB 16.0 MB/s eta 0:00:00

Downloading packaging-24.1-py3-none-any.whl (53 kB)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 54.0/54.0 kB 9.3 MB/s eta 0:00:00

Installing collected packages: Pillow, packaging, pytesseract
Successfully installed Pillow-10.4.0 packaging-24.1 pytesseract-0.3.13
(node:16150) [DEP0040] DeprecationWarning: The punycode module is deprecated. Please use a userland alternative instead.

# echo 'Setup completed. Refer to README.md for instructions.'
Setup completed. Refer to README.md for instructions.`;
