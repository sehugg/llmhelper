import syncfs from 'fs';
import assert from 'node:assert';
import test from 'node:test';
import { program } from 'commander';
import { z } from 'zod';
import { newArtifact, TemporaryFileSystemEnvironment } from '../src/env.js';
import { LLMHelper, logger } from '../src/llm.js';
import { MCTS } from '../src/mcts.js';
import { DockerBuildTool, DockerShellTool, workspacePath } from '../src/tools/docker.js';
import { KBDatabase } from '../src/kb.js';
import { writeArticle } from '../src/recipes/article.js';
import { FetchTool } from '../src/tools/fetch.js';

const PROMPT_FIXES = `
Look carefully at the output of the previous run.
Did it build and run successfully?
Were there any error messages?
Can you use tools to search for solutions?
How could you make it better?
Try something different to correct the problems.
`

function shrink(s?: string) {
    return s;
}

type RunStats = {
    Dockerfile: string,
    terminalSession: any[],
    workspaceFiles: any[]
}

async function generateBlogProject(subject: string, maxIters: number = 10, references?: string[],
    readOnlyVolumes?: { [hostPath: string]: string }) {

    console.log('Subject:', subject);

    const env = new TemporaryFileSystemEnvironment();
    let mcts = new MCTS();

    let rootllm = new LLMHelper(env).overwrite('timestamp')
        //.model('sonnet')
        //.addTools([new WebTool(), new APITool()])
        .system(`You are an expert software developer and technical writer. You are writing sample code for an article about "${subject}".`)

    // TODO: context shrinker shrinks our context

    // TODO: use document adding methods?
    if (references?.length) {
        rootllm = rootllm.addMessage(`Use these files as examples:\n<documents>\n${references.map((r: string) => `<document type="example">\n${r}\n</document>`).join('\n')
            }\n</documents>`);
    }

    const plan = await rootllm.model('smart')
        .prompt(`What are your requirements for the sample code in order to have a successful article?`)
        .outputFile('plan.json')
        .generate(z.object({
            requirements: z.array(z.string()),
            topicsToCover: z.array(z.string()),
            packageDependencies: z.array(z.string()),
            successCriteria: z.string(),
        }));
    console.log(plan.output);

    let llm = rootllm;

    //let dockerImages = await dockerSearchTool.dockerSearch({ term: subject })
    //console.log(dockerImages);

    for (let iter = 0; iter < maxIters; iter++) {

        let dockerFolder = "_docker" + iter;
        let dockerEnv = env.subenv(dockerFolder);
        let dockerBuildTool = new DockerBuildTool(dockerEnv);

        mcts.reset();

        // TODO: max tokens const, automatic sumamrize
        const tokenCount = llm.inputConfig.context?.estimateTokens() || 0;
        console.log("Context tokens:", tokenCount);
        if (llm.getMessages().length > 20) { // TODO?
            console.log("Too many tokens, retrying");
            llm = rootllm;
        }

        let hasFixes = llm !== rootllm;

        /*
        let choicemodel = mcts.choose(['mini','llama3','gemma2']);
        helper = helper.model(choicemodel.action);
        choicemodel.ok(); // assume it works if we got here
        */

        /*
        if (!hasFixes) {
            helper = helper.addMessage("Tips from previous runs:\n" + allLearnings.join("\n"));
            console.log(allLearnings);
        }
        */

        if (hasFixes) {
            llm = (await llm.prompt(`Use tools to research anything you need to fix the problems.`)
                .addTools([new FetchTool()]).run()).continue();
        }

        let choice1 = mcts.choose();
        let result1 = await llm.prompt(`You are writing a tech blog post about "${subject}".
Prepare a minimal Docker image that installs the build tools.
Only install and verify packages, don't create a new project or create source files.
You can download files, or clone git repos, but don't compile or run them.
One command per line if possible.
Don't run apt upgrade.
Commands run as root, so don't use sudo.`)
            .prompt(hasFixes ? PROMPT_FIXES : '')
            .outputFile(choice1.filename('docker.json'))
            .generate(dockerBuildTool.inputSchema);
        console.log(JSON.stringify(result1.output, null, 2));

        const buildResult = await dockerBuildTool.dockerBuild(result1.output);
        buildResult.buildError = shrink(buildResult.buildError);
        buildResult.buildOutput = shrink(buildResult.buildOutput);
        console.log(JSON.stringify(buildResult, null, 2));

        if (buildResult.buildError || !buildResult.imageID) {
            llm = result1.continue()
                .addMessage("Docker image failed: " + JSON.stringify(buildResult))
            //.addMessage('Try again and fix these problems.');
            continue;
        }

        let image = buildResult.imageID + "";
        //choice1.estimate(0.5); // docker image worked, we can try it again

        let dockerShellTool = new DockerShellTool(dockerEnv, image);
        if (readOnlyVolumes && Object.keys(readOnlyVolumes).length) {
            dockerShellTool.readOnlyVolumes = readOnlyVolumes;
        }

        llm = result1.continue()
            .addMessage(`Docker image ready.
Now you can upload files and run commands in the Docker image.
Create a project about this subject: "${subject}"
Then compile and run it.
Your $HOME directory is "${workspacePath}".
Prefer "uploadFiles" to echo or cat.`)

        if (readOnlyVolumes) {
            llm = llm.addMessage(`Sample data files are available in these read-only directories: ${Object.keys(readOnlyVolumes).join(', ')}`);
        }

        logger.logMessages(llm.getMessages());

        let errorCount = 0;
        let choice2;
        let terminalSession = [];

        for (let step = 0; step < 20; step++) {
            choice2 = mcts.choose();
            let result2 = await llm
                .prompt("Next action?")
                .outputFile(choice2.filename('cmd.json'))
                .generate(z.object({
                    uploadFiles: z.array(z.object({
                        filename: z.string().regex(/^[^/.]/, "Filename cannot start with a dot or slash"),
                        content: z.string()
                    })).optional(),
                    execCommands: z.array(z.string()).optional(),
                    done: z.boolean().optional().describe('Set to true when project is complete or cancelled.'),
                }));
            llm = result2.continue();
            for (const file of result2.output.uploadFiles || []) {
                await dockerEnv.saveArtifact(newArtifact(file.filename, file.content)); // TODO: exception?
                terminalSession.push(file);
            }
            for (const command of result2.output.execCommands || []) {
                console.log('#', command);
                const result = await dockerShellTool.shellCommand(command);
                if (result.stdout) console.log(result.stdout);
                terminalSession.push({ command, result });
                llm = llm.addMessage(`# ${command}\n${result.stdout}`);
                if (result.exitCode) {
                    console.log('*** Error', result.exitCode);
                    errorCount++;
                    llm = llm.addMessage(`*** Error ${result.exitCode}. Try to diagnose this problem if you can, or else cancel.`);
                }
            }
            if (result2.output.done || errorCount > 3) {
                break;
            }
        }

        dockerShellTool.destroy();

        if (errorCount || !choice2) {
            choice2?.score(0);
            llm = llm.addMessage('Try again and fix these problems.');
            continue;
        }


        // TODO :^P
        const Dockerfile = 'FROM ' + result1.output.image + '\n' + result1.output.installCommands.map((c: string) => 'RUN ' + c).join('\n');
        const runStats: RunStats = {
            Dockerfile,
            terminalSession,
            workspaceFiles: []
        }
        llm = rootllm;

        // TODO: brevity
        const result3 = await rootllm.model('smart')
            .prompt(`Inspect this run result critically: ${JSON.stringify(runStats)}`)
            .outputFile(choice2.filename('rating.json'))
            .generate(z.object({
                describeErrors: z.string().describe('Were there any errors? Briefly quote relevant output.'),
                describeInstall: z.string().describe('Was the setup successful? Briefly quote relevant output.'),
                describeSampleProgram: z.string().describe('Was a sample program run? Briefly quote relevant output.'),
                describeOutput: z.string().describe(`Did the program output clearly address the topic "${subject}"? Briefly quote relevant output.`),
                success: z.boolean().describe('True if the setup was successful *AND* a sample program was run.'),
                scoreInstall: z.number().describe('Rate the install from 0-10 (0=failure, 10=perfect).'),
                scoreSampleProgram: z.number().describe('Rate the sample program from 0-10 (0=failure, 10=perfect).'),
                scoreRequirements: z.number().describe('Did the project cover all of the original requirements? (0=none, 10=all).'),
                workspaceFiles: z.array(z.string()).optional().describe("Were any relevant files created?"),
            }));
        console.log(JSON.stringify(result3.output, null, 2));

        runStats.workspaceFiles = result3.output.workspaceFiles || [];

        let r = result3.output;
        let totalRating = r.scoreInstall + r.scoreSampleProgram + r.scoreRequirements;
        totalRating += (10 - result1.output.installCommands.length);
        // TODO: total size of docker image

        choice2.score(totalRating / 40.0);
        choice2.node.hints.push(runStats);
        choice2.node.privateInfo = runStats;
    }

    // TODO: how to get path to files?
    let best = mcts.bestLeafNodes()[0];
    console.log(best.hints);
    assert.ok(best.hints.length, "No good node found");
    assert.ok(best.privateInfo, "No good node found");
    const projectInfo = best.hints[0] as RunStats;

    // add to database
    new KBDatabase().addEntry({
        workflow: 'docker blog post',
        title: subject,
        context: best.privateInfo,
        score: best.avgScore()
    });

    await env.saveArtifact(newArtifact('blog.json', JSON.stringify(best.hints, null, 2)));

    await writeArticle(rootllm.model('smart'), subject, projectInfo, references?.length ? references : undefined);
}

///

program
    .name('llm-blog-post')
    .description('Generate a blog post')
    .option('-r, --references <refs...>', 'Reference files')
    .option('-i, --iterations <n>', 'Number of iterations', '10')
    .option('-d, --ro <path...>', 'Read only volumes')
    .argument('subject', 'Blog subject')
    .action(async (subject: string, options) => {
        const references: string[] = (options.references || []).map((r: string) => syncfs.readFileSync(r, 'utf-8'));
        const maxIters = parseInt(options.iterations || '10');
        const readOnlyVolumes : { [hostPath: string]: string } = {};
        for (const path of options.ro || []) {
            readOnlyVolumes[path] = path;
        }
        await generateBlogProject(subject, maxIters, references, readOnlyVolumes);
    });

program.parseAsync(process.argv).then(() => process.exit(0));
