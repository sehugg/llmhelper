
import { program } from 'commander';
import fs from 'fs/promises';
import fast_json_patch from 'fast-json-patch';
import { loadYAMLRunnable } from './llm.js';
import { readConfig } from './config.js';

// TODO

program
    .name('llm-cli')
    .description('CLI tool to process YAML files and generate LLM output')
    .version('1.0.0');

program
    .command('run')
    .description('Process a YAML file with optional inputs and generate output')
    .argument('<step.yml>', 'Step definition file')
    .argument('[inputs...]', 'Input files, if any', [])
    .option('-c, --config <path>', 'Config file path')
    .option('-o, --output <path>', 'Output file path')
    .action(async (step, input, options) => {
        const { config, output } = options;
        readConfig(config);
        const runnable = await loadYAMLRunnable(step, output);
        throw new Error('Not implemented');
    });

// JSON patch application
// TODO: remove ```json
program
    .command('patch')
    .description('Apply a JSON patch to a JSON file')
    .option('-c, --config <path>', 'Config file path')
    .argument('<input.json>', 'Input JSON file')
    .argument('<patch.json>', 'Patch JSON file')
    .argument('attrname', 'Attribute name that contains the patch')
    .argument('<output.json>', 'Output JSON file')
    .action(async (input, patch, attrname, output, options) => {
        try {
            const { config } = options;
            readConfig(config);
            const inputContents = await fs.readFile(input, 'utf8');
            const patchContents = await fs.readFile(patch, 'utf8');
            const inputJson = JSON.parse(inputContents);
            const patchJson = JSON.parse(patchContents);
            const patchArray = patchJson[attrname];
            if (!Array.isArray(patchArray)) {
                throw new Error('Invalid patch, expected an array');
            }
            await fast_json_patch.applyPatch(inputJson, patchArray);
            await fs.writeFile(output, JSON.stringify(inputJson, null, 2));
            console.log(`Output written to ${output}`);
        } catch (error) {
            console.error('Error applying patch:', error);
        }
    });

// iterate over an array
program
    .command('split')
    .description('Split an array into individual files')
    .argument('<input.json>', 'Input JSON file')
    .argument('attrname', 'Attribute name that contains the array')
    .argument('<output-prefix>', 'Output prefix')
    .action(async (input, attrname, outputPrefix, options) => {
        try {
            const inputContents = await fs.readFile(input, 'utf8');
            const inputJson = JSON.parse(inputContents);
            const array = inputJson[attrname];
            if (!Array.isArray(array)) {
                throw new Error('Invalid array, expected an array');
            }
            for (let i = 0; i < array.length; i++) {
                // leading zeroes (e.g. 1 -> 001)
                const numDigits = 3;
                const output = `${outputPrefix}${i.toString().padStart(numDigits, '0')}.json`;
                await fs.writeFile(output, JSON.stringify(array[i], null, 2));
                console.log(`Output written to ${output}`);
            }
        } catch (error) {
            console.error('Error splitting array:', error);
        }
    });

program.parse(process.argv);
