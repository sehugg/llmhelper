import { LLMHelper } from "../src/llm.js";
import { z } from "zod";
import { program } from 'commander';

const rootllm = new LLMHelper().system("You are a creative person that loves wordplay and acronyms.");

async function backronym(idea: string) {
    const out1 = await rootllm.prompt(`Create some backronym ideas for this idea: ${idea}`).generate(z.object({
        backronyms: z.array(z.object({
            acronym: z.string().describe('The backronym for the idea, ALL CAPS.'),
            words: z.string().describe('e.g. EBW = the Expansion of the Backronym in Words.'),
            rating: z.number().min(0).max(10).describe('A rating (0-10) of how relevant the backronym is to the idea.')
        }))
    }))
    for (let out of out1.output.backronyms) {
        // check the backronym .. take all capitalized words
        const words = out.words.split(/\W+/).filter(w => w[0] === w[0]?.toUpperCase());
        const backronym = words.map(w => w[0]).join('');
        if (backronym !== out.acronym.replace(/\W/g, '')) {
            console.log('Backronym failed:', backronym, out.acronym);
        } else {
            console.log(out);
        }
    }
}

///

program
    .argument('<idea>', 'The idea to create backronyms for.')
    .action(backronym)
    .parse(process.argv)

