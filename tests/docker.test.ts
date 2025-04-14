import assert from 'node:assert';
import test from 'node:test';
import { newArtifact, TemporaryFileSystemEnvironment } from '../src/env.js';
import { DockerRunTool, DockerShellTool } from '../src/tools/docker.js';

test('gradle', async (t) => {
    const env = new TemporaryFileSystemEnvironment();
    const dockerRunTool = new DockerRunTool(env);
    await env.saveArtifact(newArtifact("build.gradle", "apply plugin: 'java'"));
    const runOutput = await dockerRunTool.dockerRun({
        image: 'gradle',
        command: 'timeout 15s gradle init --overwrite --type java-application < /dev/null'
        //command: 'timeout -s9 15s gradle --no-daemon build'
    });
    console.log(runOutput);
    assert.equal(runOutput.success, true);
    assert.equal(runOutput.statusCode, 0);
    assert.ok(runOutput.stdout?.includes('BUILD SUCCESSFUL'));
});

test('docker shell', async (t) => {        
    const env = new TemporaryFileSystemEnvironment();
    const dockerShellTool = new DockerShellTool(env, 'alpine:latest');
    t.after(() => {
        env.deleteAll();
        dockerShellTool.destroy();
    });
    const shellOutput = await dockerShellTool.shellCommand('touch ~/foo');
    console.log(shellOutput);
    const shellOutput2 = await dockerShellTool.shellCommand('ls -l ~/foo');
    console.log(shellOutput2);
    assert.equal(shellOutput2.exitCode, 0);
    const shellOutput3 = await dockerShellTool.shellCommand('ls -l /NOEXIST');
    console.log(shellOutput3);
    assert.equal(shellOutput3.exitCode, 1);
    assert.ok(shellOutput3.stdout.includes('ls: /NOEXIST: No such file or directory'));
    const attachments = (await dockerShellTool.shellCommand('ls -1 ~')).stdout.split(/[\r\n]+/);
    console.log(attachments);
});

test('docker tools', async (t) => {
    const env = new TemporaryFileSystemEnvironment();
    const dockerRunTool = new DockerRunTool(env);
    const runOutput = await dockerRunTool.dockerRun({ image: 'alpine:latest', command: 'timeout 5s echo hello' });
    console.log(runOutput);
    assert.equal(runOutput.success, true);
    assert.equal(runOutput.statusCode, 0);
    assert.equal(runOutput.stdout, 'hello\r\n');
});

test('docker timeout', async (t) => {
    const env = new TemporaryFileSystemEnvironment();
    const dockerRunTool = new DockerRunTool(env);
    dockerRunTool.timeoutMsec = 5000;
    assert.fail('timeout not implemented yet');
    try {
        const runOutput = await dockerRunTool.dockerRun({ image: 'alpine:latest', command: 'while true; do echo hello; sleep 1; done' });
        assert.equal(runOutput.success, false);
    } catch (e) {
        console.log(e);
        assert.equal(e+"", 'Error: Docker run timed out');
    }
});

