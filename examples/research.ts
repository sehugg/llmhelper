import { z } from "zod";
import { FileSystemEnvironment, newArtifact } from '../src/env.js';
import { LLMHelper, logger } from '../src/llm.js';
import { FetchTool } from "../src/tools/fetch.js";
import { urlToIdent } from '../src/util.js';
import { KBDatabase } from "../src/kb.js";
import { program } from 'commander';
import syncfs from 'fs';
import { Searcher, SearchResult } from "../src/recipes/search.js";


async function research(shortid: string, topic: string, maxIters: number = 25, references: any) {
    const env = new FileSystemEnvironment('/tmp/' + shortid);
    let rootllm = new LLMHelper(env)
        .overwrite('timestamp')
        .system(`You are a LLM researcher, studying the topic: "${topic}"`)
        .system(`The current date is ${new Date().toDateString()}.`);
    // TODO: don't retain?
    if (references) {
        rootllm = rootllm.addObject({ references });
    }
    let llm = rootllm;
    let tools = [new FetchTool()];
    let plan = await llm.model('smart')
        .prompt('You have access to Wikipedia and "https://www.googleapis.com/customsearch/v1?q=". What is your plan for research?')
        .outputFile('plan.json')
        .generate(z.object({
            a_priori_knowledge: z.array(z.string()),
            questions: z.array(z.string()),
            tasks: z.array(z.string()),
            search_terms: z.array(z.string())
        }));
    logger.log(plan.output);

    llm = plan.continue().model('mini');

    let searcher = new Searcher();

    let research : any[] = [];

    let toolFetches = 0;

    async function fetchMoreResults() {
        let tool_results0 = await llm.model('smart')
            .outputFile(`fetch-${toolFetches++}.json`)
            .system(`Use the tools to grab relevant content from Wikipedia and/or the web.`)
            .useTools(tools);

        // Filter out failed results and those without titles
        let tool_results = tool_results0.output.filter(tr => tr.url);

        // Add to open
        tool_results.forEach(tr => {
            searcher.addFetchResult(tr);
        });
    }

    async function processSearchResults(next: SearchResult) {
        const ident = urlToIdent(next.url);

        let page_content = {
            url: next.url,
            title: next.title,
            text: next.content,
        };
        let good_content = next.links?.length > 0; // assume good at first if it has links
        let good_source = next.tool !== 'wikipedia';

        if (page_content.text) {
            let analysis = await llm
                .outputFile(`analysis-${ident}.json`)
                .addObject({ page_content })
                .system("Analyze the page_content to see if it answers any of the questions or tasks.")
                .generate(z.object({
                    was_online: z.boolean().describe("Was the content successfully found online?"),
                    is_relevant: z.boolean().describe("If so, is some or all of the content relevant to the questions and tasks?"),
                    answers: z.array(z.string()).describe("Detailed answers to the questions and tasks."),
                    relevant_passages: z.array(z.string()).describe("Relevant passages from the content, verbatim."),
                    relevant_quotes: z.array(z.object({
                        quote: z.string(),
                        author: z.string(),
                        verbatim: z.boolean().describe("Is this quote verbatim?"),
                        //year: z.number().optional().describe("If so, when did they say this? (if verifiable)"),
                    })).describe("Relevant direct quotes from individuals."),
                    source_quality: z.number().min(0).max(10).describe("How reliable is the source? (0-10)"),
                    followup_questions: z.array(z.string()).optional().describe("Questions that arise from the analysis that are not answered here."),
                    //followup_urls: z.array(z.string().url()).describe("URLs to visit that might be relevant.")
                    /*
                    results: z.array(z.object({
                        question: z.string(),
                        answer: z.string(),
                        score: z.number().min(0).max(10)
                    }))
                    */
                }));
            //console.log(analysis.output);
            good_content = analysis.output.was_online;
            if (analysis.output.was_online && analysis.output.is_relevant) {
                if (analysis.output.followup_questions?.length) {
                    llm = llm.addObject({ questions: analysis.output.followup_questions });
                }
                research.push({
                    url: next.url,
                    title: next.title,
                    answers: analysis.output.answers,
                    relevant_passages: analysis.output.relevant_passages,
                    relevant_quotes: analysis.output.relevant_quotes,
                });
            } else {
                if (!analysis.output.was_online) {
                    try {
                        const archivedUrl = await new FetchTool().isAvailableOnWaybackMachine(next.url);
                        if (archivedUrl) {
                            logger.log("Found on archive:", archivedUrl);
                            searcher.addURL(archivedUrl, "Archived version of " + next.url);
                        }
                    } catch (e) {
                        console.log("Error checking internet archive:", e);
                    }
                }
            }
        }

        if (good_content) {

            // TODO: use llm.filter()?
            
            let links = await llm
                .outputFile(`links-${ident}.json`)
                .addObject({ links: next.links })
                .system("Extract links where you might find further information on the topic that answers the questions.")
                .generate(z.object({
                    links: z.array(z.object({
                        url: z.string().url(),
                        reason: z.string().describe("Why is this link relevant?"),
                        score_0_to_10: z.number().min(0).max(10).describe("How relevant is this link to the topic? (0-10)"),
                    }))
                }));
            // add to open
            links.output.links.sort((a, b) => b.score_0_to_10 - a.score_0_to_10);
            links.output.links.forEach(link => {
                const item = next.links.find(l => l.url === link.url);
                if (item) {
                    searcher.addItem(item);
                } else {
                    searcher.addURL(link.url);
                }
            });
            
        }
    }

    await fetchMoreResults();

    if (searcher.results.length === 0) {
        throw new Error("No initial results found.");
    }

    let tasks : Promise<any>[] = [];

    for (let iter = 0; iter < maxIters; iter++) {

        console.log("Iteration:", iter, "Open:", searcher.open.length, "Researched:", research.length);

        // Grab a result from open
        // TODO: what if timeout error?
        let next = await searcher.fetchNext();
        if (!next) {
            await logger.indefiniteTask(Promise.all(tasks), "Waiting for results");
            await fetchMoreResults();
            next = await searcher.fetchNext();
        }
        if (!next) {
            console.log("No more search items to process.");
            break;
        }
        console.log("Processing:", next.url);

        tasks.push(processSearchResults(next));
    }

    await logger.indefiniteTask(Promise.all(tasks), "Waiting for results");

    if (research.length < 3) {
        throw new Error("Not enough good analyses.");
    }

    await env.saveArtifact(newArtifact('research.json', JSON.stringify(research), 'json'));

    new KBDatabase().addEntry({
        workflow: 'research',
        title: topic,
        context: research,
        score: 1 - 1 / research.length
    });

    // TODO: summarize good analyses
    let summary = await llm.model('smart')
        .addObject({ research })
        .outputFile('article.md')
        .system(`Based on this research, write a detailed and informative article.
Be chronological if possible.
Include relevant passages and quotations.
Include links to URLs and/or references in footnotes.`)
        .run();
    console.log(summary.output);

    // TODO: check links and fix broken

    process.exit(0);
}

program
    .name('llm-research')
    .description('Generate a research project using LLM')
    .option('-r, --references <refs...>', 'Reference files')
    .option('-i, --iterations <n>', 'Number of iterations', '20')
    .argument('project_id', 'Short project ID')
    .argument('subject', 'Research subject')
    .action(async (project_id: string, subject: string, options) => {
        const references: string[] = (options.references || []).map((r: string) => syncfs.readFileSync(r, 'utf-8'));
        const maxIters = parseInt(options.iterations || '20');
        await research(project_id, subject, maxIters, references);
    });

program.parseAsync(process.argv).then(() => process.exit(0));
