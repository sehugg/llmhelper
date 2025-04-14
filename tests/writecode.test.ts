import assert from 'node:assert';
import test from 'node:test';
import { z } from 'zod';
import { TemporaryFileSystemEnvironment } from '../src/env.js';
import { LLMHelper } from '../src/llm.js';
import { MCTS } from '../src/mcts.js';
import { JSTool } from '../src/tools/js.js';

test('test mcts with llm', async (t) => {

    const env = new TemporaryFileSystemEnvironment();
    let jsTool = new JSTool();
    let rootHelper = new LLMHelper(env)
        //.model('local-code')
        .system("You are a coding assistant. You write code and tests, and fix them if they have problems.");
    let mcts = new MCTS();

    //const thing = 'a red-black tree';
    const thing = 'a doubly linked list';
    //const thing = 'a function that returns the color of the sky based on a time/date and latitude/longitude';

    const maxIters = 5;
    const fixIters = 2;

    let success = false;
    let iter, fix;
    for (iter = 0; iter < maxIters && !success; iter++) {

        mcts.reset();
        let helper = rootHelper;

        try {
            for (fix = 0; fix < fixIters; fix++) {
                let choice1 = mcts.choose();
                let result1 = await helper
                    .prompt(`Write a JavaScript class that implements ${thing}.
Do not generate example code or tests yet.
Use console.log() for debugging.`)
                    .outputFile(choice1.filename('code.js'))
                    .run();
                let code = result1.output.toString();
                console.log(code);

                let classResult = jsTool.runSync(code);
                if (classResult.error) {
                    helper = helper.addMessage(`Code failed to run: ${JSON.stringify(classResult)}`);
                    choice1.score(0);
                    continue;
                }

                let choice2 = mcts.choose();
                let result2 = await result1.continue()
                    .prompt(`Write a series of JS expressions that comprehensively test the class.
The final expression of each test should evaluate to true if the test passes and false otherwise.
Do not use "return" statement or console.log() to return the result of tests.`)
                    .outputFile(choice2.filename('tests.json'))
                    .generate(z.object({
                        tests: z.array(z.object({
                            testDescription: z.string().describe('Description of the test'),
                            testCode: z.string().describe('JavaScript expression that tests the function.')
                        }))
                    }));
                console.log(result2.output?.tests);

                let alltests = result2.output?.tests || [];
                let failures = [];
                for (let test of alltests) {
                    let testCode = code + "\n{ " + test.testCode + " }";
                    let result = jsTool.runSync(testCode);
                    if (result.js_result === true) {
                        console.log(`Test passed: ${test.testDescription}`, result);
                    } else {
                        failures.push({ test, result });
                        console.log(`Test failed: ${test.testDescription}`, result);
                    }
                }

                // score based on number of failures, +1 to encourage more tests
                choice2.score(1 - (failures.length + 1) / (alltests.length + 1));

                if (!failures.length) {
                    success = true;
                    break;
                }

                choice2.node.hints.push({ test_failures: failures }); // TODO?

                if (fix < fixIters - 1) {
                    let result3 = await result2.continue()
                        .addMessage(failures.length ? `Tests failed: ${JSON.stringify(failures)}` : "Tests passed.")
                        .prompt(`Write some ideas to fix the code and/or tests. Do not generate code, just ideas.`)
                        .outputFile(choice2.filename('fixes.txt'))
                        .run();
                    console.log(result3.output);
                    helper = result3.continue();
                }
            }
        } catch (err2) {
            console.log(err2);
        }

        console.log(helper.inputConfig.context?.getAllMessages());
    }

    if (iter === maxIters) {
        assert.fail('Too many iterations');
    }
    console.log(mcts.bestLeafNodes()[0]);
    console.log('Best path:', mcts.bestLeafNodes()[0].path());
    // TODO: show code for best path
});

