
import * as crypto from 'crypto';
import fs from 'fs/promises';
import _path from 'path';

export function stripMarkdownCodeBlockDelimiters(s: string) : string {
    s = s.replace(/(?:\n|^)```\w*(\n[\s\S]*?\n)```(?:\n|$)/g, (match, p1) => p1);
    return s;
}

export function hashSHA256(s: string) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('base64').replace(/[/]/g, '_').replace(/[+]/g, '-');
}

export function safeJSONStringify(obj: any) {
    return JSON.stringify(obj, (key, value) => {
        switch (typeof value) {
            case 'bigint':
                return value.toString();
            default:
                return value;
        }
    });
}

export async function loadImageToBase64Url(path: string) {
    let image;
    if (path.startsWith('http:') || path.startsWith('https:')) {
        const response = await fetch(path);
        image = Buffer.from(await response.arrayBuffer());
    } else {
        const imagePath = _path.resolve(new URL(import.meta.url).pathname, '..', path);
        image = await fs.readFile(imagePath);
    }
    const mimeType = path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${image.toString('base64')}`;
}

export function convertBase64UrlToBuffer(base64: string) {
    return Buffer.from(base64.split(',')[1], 'base64');
}

export function randomShuffle<T>(array: T[], random_fn: () => number = Math.random): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(random_fn() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export function urlToIdent(url: string) {
    return new URL(url).hostname + "_" + hashSHA256(url);
}

export function safeFilename(path: string) {
    return path.replace(/[^a-zA-Z0-9_]/g, '_');
}
