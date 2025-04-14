import { LLMArtifact, LLMArtifactContent, LLMArtifactMetadata, LLMEnvironment, LLMLogMessage } from "./types.js";
import fs from 'fs/promises';
import syncfs from 'fs'
import { randomUUID } from "crypto";

let _curts = -1;

export function newTimestamp() {
    return _curts = Math.max(_curts + 1, Date.now());
}

export function newArtifact(name: string, content: LLMArtifactContent, contentType: 'text' | 'binary' | 'json' | 'yaml' = 'text'): LLMArtifact {
    return {
        metadata: {
            uuid: randomUUID().toString(),
            name,
            contentType,
            version: 0,
            timestamp: newTimestamp(),
            sizeBytes: (content as any).length | 0, // TODO?
        },
        content
    };
}

abstract class BaseLLMEnvironment {

    private _logs: LLMLogMessage[] = [];

    getRootPath() {
        return '';
    }

    // TODO: why do we have these?
    // TODO?? these need to be added where console.log is
    log(msg: Partial<LLMLogMessage>) {
        this._logs.push({ timestamp: Date.now(), ...msg });
        console.log(msg.action, this.getRootPath() + '/' + msg.path, msg.error || "");
    }

    getLogs() {
        return this._logs;
    }

    // TODO: could fail if called too quickly
    nextSequence() {
        return newTimestamp();
    }
}

export class FileSystemEnvironment extends BaseLLMEnvironment implements LLMEnvironment {

    constructor(readonly rootPath: string) {
        super();
        syncfs.mkdirSync(rootPath, { recursive: true });
    }

    subenv(path: string) {
        if (!this.isValidPath(path) || path.startsWith('.')) {
            throw new Error('Invalid path ' + path);
        }
        return new FileSystemEnvironment(`${this.rootPath}/${path}`);
    }

    getRootPath() {
        return this.rootPath;
    }

    getMetadataPath(path: string) {
        return `${this.rootPath}/${path}.metadata`;
    }

    getContentPath(path: string) {
        return `${this.rootPath}/${path}`;
    }

    isValidPath(path: string) {
        // ensure that we don't have absolute paths or ..
        // TODO: better validation
        return !path.includes('..') && !path.startsWith('/');
    }

    async getLatestMetadata(path: string): Promise<LLMArtifactMetadata | null> {
        if (!this.isValidPath(path)) {
            throw new Error('Invalid path ' + path);
        }
        const metadataPath = this.getMetadataPath(path);
        try {
            const filePath = this.getContentPath(path);
            if (!await fs.access(filePath).then(() => true).catch(() => false)) {
                return null; // file does not exist, so no metadata either
            }
            const timestamp = await fs.stat(filePath).then(stat => stat.mtimeMs).catch(() => undefined);
            const sizeBytes = await fs.stat(filePath).then(stat => stat.size).catch(() => undefined);
            const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
            if (metadataExists) {
                // set timestamp and size from content file if metadata exists
                let metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as LLMArtifactMetadata;
                if (typeof timestamp === 'number') metadata.timestamp = timestamp;
                if (typeof sizeBytes === 'number') metadata.sizeBytes = sizeBytes;
                return metadata;
            } else {
                // create metadata from content
                // TODO: timestamp is different on read vs write
                return {
                    name: path,
                    contentType: 'text', // TODO?
                    version: 0,
                    timestamp: timestamp || 0,
                    sizeBytes: sizeBytes || 0,
                };
            }
        } catch (e) {
            this.log({ action: 'error', path, error: e });
        }
        return null;
    }

    async getLatestArtifact(path: string): Promise<LLMArtifact> {
        let metadata = await this.getLatestMetadata(path);
        if (!metadata) {
            throw new Error('Artifact not found: ' + path);
        }
        const filePath = this.getContentPath(path);
        let content : LLMArtifactContent;
        if (metadata.contentType === 'binary') {
            content = await fs.readFile(filePath);
        } else {
            content = await fs.readFile(filePath, 'utf8');
            if (metadata.contentType === 'json') {
                content = JSON.parse(content);
            }
        }
        this.log({ action: 'read', path });
        return { metadata, content };
    }

    async saveArtifact(artifact: LLMArtifact): Promise<LLMArtifact> {
        if (!this.isValidPath(artifact.metadata.name)) {
            throw new Error('Invalid path ' + artifact.metadata.name);
        }
        const path = artifact.metadata.name;
        if (path.indexOf('/') > 0) {
            const parentPath = artifact.metadata.name.split('/').slice(0, -1).join('/');
            await fs.mkdir(`${this.rootPath}/${parentPath}`, {
                recursive: true
            });
        }
        artifact.metadata.version = (artifact.metadata.version || 0) + 1;
        const filePath = this.getContentPath(path);
        const metadataPath = this.getMetadataPath(path);
        await fs.writeFile(metadataPath, JSON.stringify(artifact.metadata));
        const encoding = artifact.metadata.contentType === 'binary' ? 'binary' : 'utf8';
        let content = artifact.content;
        if (typeof content === 'object' && !Buffer.isBuffer(content)) {
            content = JSON.stringify(content);
        }
        // make backup first?
        if (await fs.access(filePath).then(() => true).catch(() => false)) {
            await fs.rename(filePath, `${filePath}.${newTimestamp().toString(36)}.bak`);
        }
        await fs.writeFile(filePath, content, encoding);
        this.log({ action: 'write', path });
        return artifact;
    }

    async removeArtifact(path: string): Promise<void> {
        if (!this.isValidPath(path)) {
            throw new Error('Invalid path ' + path);
        }
        const metadataPath = this.getMetadataPath(path);
        const filePath = this.getContentPath(path);
        await fs.rename(filePath, `${filePath}.${newTimestamp().toString(36)}.bak`);
        await fs.unlink(metadataPath);
        this.log({ action: 'delete', path });
    }

    async listArtifacts(prefix?: string): Promise<string[]> {
        prefix = prefix || '';
        const files = await fs.readdir(this.rootPath, { recursive: true });
        return files
            .filter(f => f.startsWith(prefix) && f.endsWith('.metadata'))
            .map(f => f.substring(0, f.length - '.metadata'.length));
    }
}

export class TemporaryFileSystemEnvironment extends FileSystemEnvironment {

    constructor() {
        super(`/tmp/llm_${Date.now().toString(36)}_${Math.random().toString(36).substring(7)}`);
    }

    deleteAll() {
        return syncfs.rmSync(this.rootPath, { recursive: true });
    }
}

export class MemoryStoreEnvironment extends BaseLLMEnvironment implements LLMEnvironment {

    private artifacts: { [key: string]: LLMArtifact } = {};

    constructor() {
        super();
    }

    async getLatestMetadata(name: string): Promise<LLMArtifactMetadata | null> {
        const artifact = this.artifacts[name];
        if (!artifact) return null;
        return JSON.parse(JSON.stringify(artifact.metadata));
    }

    async getLatestArtifact(name: string): Promise<LLMArtifact> {
        let artifact = this.artifacts[name];
        if (!artifact) {
            throw new Error(`Artifact not found: ${name}`);
        }
        artifact = JSON.parse(JSON.stringify(artifact));
        this.log({ action: 'read', path: name });
        return artifact;
    }

    async saveArtifact(artifact: LLMArtifact): Promise<LLMArtifact> {
        artifact.metadata.version = (artifact.metadata.version || 0) + 1;
        this.artifacts[artifact.metadata.name] = artifact;
        this.log({ action: 'write', path: artifact.metadata.name });
        return artifact;
    }

    async removeArtifact(name: string): Promise<void> {
        delete this.artifacts[name];
        this.log({ action: 'delete', path: name });
    }

    async listArtifacts(prefix?: string): Promise<string[]> {
        return Object.keys(this.artifacts).filter(k => k.startsWith(prefix || ''));
    }
}

export class NullEnvironment extends BaseLLMEnvironment implements LLMEnvironment {

    async getLatestMetadata(name: string): Promise<LLMArtifactMetadata | null> {
        return null;
    }

    async getLatestArtifact(name: string): Promise<LLMArtifact> {
        throw new Error('Not implemented');
    }

    async saveArtifact(artifact: LLMArtifact): Promise<LLMArtifact> {
        return artifact;
    }

    async removeArtifact(name: string): Promise<void> {
    }

    async listArtifacts(prefix: string): Promise<string[]> {
        return [];
    }
}
