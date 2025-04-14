import { Method, Optional, Param } from '../reflect.js';
import { FileSystemEnvironment, newArtifact } from '../env.js';
import dockerode, { Container } from 'dockerode';
import { Writable } from 'node:stream';
import { LLMToolImpl, LLMToolSideEffects } from '../types.js';
import { z } from 'zod';
import { logger } from '../llm.js';
import { getMainConfig } from '../config.js';

// https://docs.docker.com/reference/dockerfile/

export const workspacePath = '/work';

const allowed_images = [
    "alpine",
    "ubuntu",
    "debian",
    "archlinux",
    "fedora",
    "rust",
    "gcc",
    "python",
    "golang",
    "node",
    //"eclipse-temurin",
    "maven",
    "gradle",
    "php",
    "pandoc/latex",
    //"texlive/texlive",
] as const;

// TODO: constrained dockerfile like techbook2.test
export const BuildInputSchema = z.object({
    image: z.enum(allowed_images).describe("a base image tag from the Docker repository"),
    installCommands: z.array(z.string().describe("The shell commands to install and verify prerequisites. Only commands that run as root. Prefer package manager over curl/wget install. Use non-interactive mode.")).max(10),
    //Dockerfile: z.string().describe('The text of the Dockerfile.'),
});

export const BuildOutputSchema = z.object({
    imageID: z.string().optional().describe('The id of the Docker image that was built.'),
    //Dockerfile: z.string().describe('The text of the Dockerfile.'),
    buildError: z.string().optional().describe('The error message from the Docker build.'),
    buildOutput: z.string().optional().describe('The output of the Docker build.'),
});

export const RunInputSchema = z.object({
    image: z.string().describe('The tag or ID of the Docker image to run.'),
    command: z.string().optional().describe('Run this shell command after starting container.'),
    mountRoot: z.boolean().optional().describe(`Mount workspace to ${workspacePath} if true.`),
});

export const RunOutputSchema = z.object({
    success: z.boolean().describe('Whether the Docker container ran successfully.'),
    statusCode: z.number().describe('The exit status code of the Docker container.'),
    stdout: z.string().optional().describe('The output of the Docker command.'),
});

export const SearchInputSchema = z.object({
    term: z.string().describe('The Docker image search term to use.'),
});

export const SearchOutputSchema = z.object({
    results: z.array(z.object({
        name: z.string().describe('The name of the image.'),
        description: z.string().optional().describe('The description of the image.'),
        star_count: z.number().optional().describe('The number of stars for the image.'),
        is_official: z.boolean().optional().describe('Whether the image is official.'),
        is_auto: z.boolean().optional().describe('Whether the image is automated.'),
    })).describe('The Docker image search results.'),
});

export const ShellInputSchema = z.object({
    command: z.string().describe('The shell command to run.'),
});

export const ShellOutputSchema = z.object({
    stdout: z.string().describe('The output of the shell command.'),
    //stderr: z.string().optional().describe('The error output of the shell command.'),
    exitCode: z.number().describe('The exit code of the shell command.'),
});

class MemoryWritable extends Writable {
    data: Buffer[];

    constructor() {
        super();
        this.data = [];
    }

    _write(chunk: Buffer, encoding: string, callback: () => void) {
        this.data.push(chunk);
        callback();
    }

    removeANSIEscapeSequences(s: string) {
        return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    }

    toString() {
        return this.removeANSIEscapeSequences(Buffer.concat(this.data).toString());
    }
}

const docker = new dockerode({
    timeout: 120000
});

const defaultEnvVars = [
    'NO_COLOR=1',
    'FORCE_COLOR=false',
    'TERM=dumb',
    'DEBIAN_FRONTEND=noninteractive',
    'TZ=UTC',
    'LANG=C.UTF-8',
    'LANGUAGE=C.UTF-8',
    'LC_ALL=C.UTF-8',
    // TODO? more?
];

function getEnvVars(): string[] {
    let vars = [...defaultEnvVars];
    const cfg = getMainConfig().tools?.docker?.env;
    if (typeof cfg === 'object') {
        Object.entries(cfg).forEach(([k, v]) => {
            vars.push(`${k}=${v}`);
        });
    }
    return vars;
}

const pulledImages = new Set<string>();

async function _dockerPull(imageID: string) {
    const stream = await docker.pull(imageID, {});
    const result = await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
    });
    return result;
}

async function dockerPull(imageID: string) {
    if (imageID.startsWith("sha256:")) {
        return;
    }
    if (pulledImages.has(imageID)) {
        return;
    }
    await logger.indefiniteTask(_dockerPull(imageID), 'Pulling Docker image ' + imageID);
    pulledImages.add(imageID);
}

export class DockerBuildTool extends LLMToolImpl<typeof BuildInputSchema, typeof BuildOutputSchema> {

    name = 'DockerBuildTool';
    description = 'Build a Docker container.';
    inputSchema = BuildInputSchema;
    sideEffects: LLMToolSideEffects = 'stateful';

    constructor(readonly env: FileSystemEnvironment) {
        super();
    }

    async toolCallback(params: z.infer<typeof BuildInputSchema>): Promise<z.infer<typeof BuildOutputSchema>> {
        return await this.dockerBuild(params);
    }

    private createDockerfile(params: z.infer<typeof BuildInputSchema>): string {
        const { image, installCommands } = params;
        const lines = [
            `FROM ${image}`,
            `WORKDIR ${workspacePath}`,
            `ENV HOME=${workspacePath}`,
            `RUN uname -a`
        ];
        for (let env of getEnvVars()) {
            lines.push(`ENV ${env}`);
        }
        for (let cmd of installCommands) {
            // TODO: check for bad commands (WORKDIR etc)
            cmd = cmd.replace(/^RUN /, '');
            lines.push(`RUN ${cmd}`);
        }
        return lines.join('\n');
    }

    async dockerBuild(params: z.infer<typeof BuildInputSchema>): Promise<z.infer<typeof BuildOutputSchema>> {
        // write Dockerfile to root path
        const Dockerfile = this.createDockerfile(params);
        // TODO: metadata?
        await this.env.saveArtifact(newArtifact('Dockerfile', Dockerfile));

        let result: any[];
        try {
            const stream = await docker.buildImage({
                context: this.env.getRootPath(),
                src: ['Dockerfile']
            });
            result = await logger.indefiniteTask(new Promise((resolve, reject) => {
                // TODO: sometimes exceptions (unknown instruction "import"?)
                docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
            }), 'Building Docker image');
        } catch (e) {
            console.error('Build failed:', e);
            return { buildError: e + "", buildOutput: '' };
        }

        let imageID = null;
        let logOutput = '';
        for (let log of result as any[]) {
            if (!log) continue;
            if (log.stream) {
                logOutput += log.stream;
            }
            if (log.error) {
                return { buildError: log.error + "", buildOutput: logOutput }
            }
            if (log.aux?.ID) {
                console.log('Built image:', log.aux.ID);
                imageID = log.aux.ID + "";
                return { imageID, buildOutput: logOutput };
            }
        }
        throw new Error('No image ID or error found in build output.');
    }

}

export class DockerRunTool extends LLMToolImpl<typeof RunInputSchema, typeof RunOutputSchema> {

    name = 'DockerRunTool';
    description = 'Run a Docker container.';
    inputSchema = RunInputSchema;
    timeoutMsec = 60000;
    sideEffects: LLMToolSideEffects = 'stateful';


    constructor(readonly env: FileSystemEnvironment) {
        super();
    }

    async toolCallback(params: z.infer<typeof RunInputSchema>): Promise<z.infer<typeof RunOutputSchema>> {
        return await this.dockerRun(params);
    }

    @Method('Run a Docker image.')
    async dockerRun(params: z.infer<typeof RunInputSchema>): Promise<z.infer<typeof RunOutputSchema>> {
        let imageID = params.image;
        let command = params.command;
        let mountRoot = params.mountRoot;

        try {
            await dockerPull(imageID);
        } catch (e) {
            console.error('Pull failed:', e);
            // TODO? return { success: false, statusCode: -1, stdout: e+'' };
        }

        const commandArgs = ['sh', '-c', command || "echo"];

        console.log('Running image:', imageID, commandArgs);
        const stdout = new MemoryWritable();
        let timeoutId: NodeJS.Timeout | undefined = undefined;
        let abortController = new AbortController();

        const runPromise = logger.indefiniteTask(docker.run(imageID, commandArgs, stdout, {
            AttachStdin: false,
            AttachStdout: true,
            AttachStderr: true,
            WorkingDir: workspacePath,
            Volumes: mountRoot ? { workspacePath: {} } : {},
            HostConfig: {
                Binds: mountRoot ? [this.env.getRootPath() + ':' + workspacePath] : []
            },
            Env: getEnvVars(),
        }, {
            abortSignal: abortController.signal
        }), 'Running Docker image');

        // TODO: doesn't work
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => abortController.abort(), this.timeoutMsec);
        });

        const runinfo = await Promise.race([runPromise, timeoutPromise]) as any[];
        clearTimeout(timeoutId);

        //console.log('Run info:', runinfo);
        let runID = null;
        let statusCode = 0;
        for (let run of runinfo) {
            if (run.id) {
                console.log('Run ID:', run.id);
                runID = run.id;
            }
            if (run.StatusCode) {
                console.log('Exit status:', run.StatusCode);
                statusCode = run.StatusCode;
            }
        }
        const success = statusCode === 0 && runID != null;

        // destroy container
        if (runID) {
            const container = docker.getContainer(runID);
            await container.remove();
        }

        return { success, statusCode, stdout: stdout.toString() }; //TODO?
    }
}

export class DockerSearchTool extends LLMToolImpl<typeof SearchInputSchema, typeof SearchOutputSchema> {

    name = 'DockerSearchTool';
    description = 'Search for a Docker image.';
    inputSchema = SearchInputSchema;
    sideEffects: LLMToolSideEffects = 'idempotent';

    async toolCallback(params: z.infer<typeof SearchInputSchema>): Promise<z.infer<typeof SearchOutputSchema>> {
        return await this.dockerSearch(params);
    }

    async dockerSearch(params: z.infer<typeof SearchInputSchema>): Promise<z.infer<typeof SearchOutputSchema>> {
        const term = params.term;
        const filter = { is_official: true };
        const results = await new Promise((resolve, reject) => {
            docker.searchImages({ term, filter }, (err, res) => err ? reject(err) : resolve(res));
        });
        return { results: results as any[] };
    }
}

export class DockerShellTool extends LLMToolImpl<typeof ShellInputSchema, typeof ShellOutputSchema> {
    name = 'ShellTool';
    description = 'Run a shell command.';
    inputSchema = ShellInputSchema;
    started = false;
    container: Container | null = null;
    timeoutMsec = 30000;
    sideEffects: LLMToolSideEffects = 'stateful';
    readOnlyVolumes: { [hostPath: string]: string } = {};

    constructor(readonly env: FileSystemEnvironment, readonly imageID: string) {
        super();
    }

    async setup() {
        if (this.started) {
            return;
        }
        try {
            await dockerPull(this.imageID);
        } catch (e) {
            console.error('Pull failed:', e);
            // TODO? return { success: false, statusCode: -1, stdout: e+'' };
        }
        // start container
        this.container = await docker.createContainer({
            Image: this.imageID,
            Tty: true,
            Cmd: ['sh'],
            AttachStdout: true,
            AttachStderr: true,
            Volumes: {
                workspacePath: {}
            },
            HostConfig: {
                Binds: [
                    this.env.getRootPath() + ':' + workspacePath,
                    ...Object.entries(this.readOnlyVolumes).map(([hostPath, containerPath]) => `${hostPath}:${containerPath}:ro`)
                ],
            },
            Env: getEnvVars(),
            WorkingDir: workspacePath,
        });
        await this.container.start();
        this.started = true;
        console.log('Started shell container:', this.container.id);
    }

    async destroy() {
        if (this.started) {
            await this.container!.stop();
            await this.container!.remove();
            this.started = false;
        }
    }

    async toolCallback(params: z.infer<typeof ShellInputSchema>): Promise<z.infer<typeof ShellOutputSchema>> {
        return await this.shellCommand(params.command);
    }

    async shellCommand(command: string): Promise<z.infer<typeof ShellOutputSchema>> {
        await this.setup();

        const exec = await this.container!.exec({
            Tty: true,
            Cmd: ['sh', '-c', command],
            AttachStdout: true,
            AttachStderr: true,
        });

        const stream = await exec.start({ hijack: true, stdin: true, Tty: true });

        return new Promise((resolve, reject) => {
            let output = '';

            // Set up event listeners
            stream.on('data', (chunk) => {
                output += chunk.toString();
            });

            stream.on('end', async () => {
                const exitCode = (await exec.inspect()).ExitCode;
                resolve({
                    stdout: output,
                    exitCode: exitCode || 0
                });
            });

            stream.on('error', (err) => {
                reject(err);
            });

            // Close the stream after a timeout
            setTimeout(() => {
                stream.end();
            }, this.timeoutMsec); // TODO: Adjust timeout as needed
        });
    }
}
