import path from 'path';
import betterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import * as sqliteVec from "sqlite-vec";
import { LLMEmbedding } from './types.js';

export const KBQueryResultSchema = z.object({
    id: z.number(),
    timestamp: z.date(),
    uuid: z.string(),
    workflow: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    context: z.any().optional(),
    score: z.number().optional(),
});

export type KBQueryResult = z.infer<typeof KBQueryResultSchema>;

export type KBInsertItem = Partial<KBQueryResult>;

export const KBInsertEmbeddingSchema = z.object({
    kb_id: z.number(),
    phrase: z.string(),
    model: z.string(),
    vectors: z.array(z.array(z.number())),
})

export type KBInsertEmbedding = {
    kb_id: number;
    phrase: string;
    embeddings: LLMEmbedding[];
}

export class KBDatabase {
    private db: betterSqlite3.Database;

    constructor(filepath?: string) {
        const dbPath = filepath || path.resolve(process.env.HOME || '', '.llm_kb.db');
        this.db = betterSqlite3(dbPath);
        sqliteVec.load(this.db);

        this.db.exec(`
CREATE TABLE IF NOT EXISTS llm_kb (
id INTEGER PRIMARY KEY,
uuid VARCHAR(36) NOT NULL,
timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
workflow TEXT,
title TEXT,
url TEXT,
context TEXT,
score NUMBER
)`);
        // for previous versions of the db (TODO)
        try {
            this.db.exec(`
ALTER TABLE llm_kb
ADD COLUMN url TEXT;`);
        } catch (e) {
        }

        this.db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS llm_kb_fts
USING fts5(workflow, title, context, content=llm_kb, content_rowid=id);`);

        this.db.exec(`
CREATE TRIGGER IF NOT EXISTS llm_kb_ai AFTER INSERT ON llm_kb BEGIN
    INSERT INTO llm_kb_fts(rowid, workflow, title, context) VALUES (new.id, new.workflow, new.title, new.context);
END;`);

        this.db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS llm_embeddings USING vec0(
    embedding float[64]
);`);

this.db.exec(`
CREATE TABLE IF NOT EXISTS llm_phrases (
    id INTEGER PRIMARY KEY,
    phrase TEXT
);`);

this.db.exec(`
CREATE TABLE IF NOT EXISTS llm_embeddings_phrases (
    kb_id INTEGER NOT NULL,
    phrase_id INTEGER NOT NULL,
    embedding_id INTEGER NOT NULL,
    FOREIGN KEY (kb_id) REFERENCES llm_kb (id) ON DELETE CASCADE,
    FOREIGN KEY (phrase_id) REFERENCES llm_phrases (id) ON DELETE CASCADE
);`);

    }

    public addEntry(entry: KBInsertItem): void {
        const insert = this.db.prepare(`
INSERT INTO llm_kb (uuid, workflow, title, url, context, score)
VALUES (@uuid, @workflow, @title, @url, @context, @score)
`);
    insert.run({
            uuid: randomUUID().toString(),
            context: JSON.stringify(entry.context),
            workflow: entry.workflow || null,
            title: entry.title || null,
            url: entry.url || null,
            score: entry.score || null,
        });
    }

    public addEmbeddings(embeddings: KBInsertEmbedding) {
        const insertEmbedding = this.db.prepare(`
            INSERT INTO llm_embeddings (embedding)
            VALUES (?)
        `);

        const insertPhrase = this.db.prepare(`
            INSERT OR IGNORE INTO llm_phrases (phrase)
            VALUES (?)
        `);

        const getPhraseId = this.db.prepare(`
            SELECT id FROM llm_phrases WHERE phrase = ?
        `);

        const linkEmbeddingPhrase = this.db.prepare(`
            INSERT INTO llm_embeddings_phrases (kb_id, phrase_id, embedding_id)
            VALUES (?, ?, ?)
        `);

        this.db.transaction(() => {
            // Insert or get the phrase ID
            insertPhrase.run(embeddings.phrase);
            const phraseId = (getPhraseId.get(embeddings.phrase) as any).id;

            // Insert each embedding vector and link it
            for (const vector of embeddings.embeddings) {
                const embeddingResult = insertEmbedding.run([Buffer.from(vector.embedding.buffer)]);
                const embeddingId = embeddingResult.lastInsertRowid;
                linkEmbeddingPhrase.run(embeddings.kb_id, phraseId, embeddingId);
            }
        })();
    }

    public searchEmbeddings(embedding: LLMEmbedding, limit = 25): KBQueryResult[] {
        const embed_ids = this.getNearestEmbeddings(embedding, limit);
        const stmt = this.db.prepare(`
SELECT DISTINCT
    MAX(kb.timestamp) as timestamp,
    kb.workflow, kb.title, kb.url, kb.context, kb.score
FROM llm_embeddings_phrases ep
INNER JOIN llm_kb kb ON ep.kb_id = kb.id
INNER JOIN llm_embeddings e ON ep.embedding_id = e.rowid
WHERE e.rowid IN (${embed_ids.map(e => e.id).join(',')})
`);
        const res = stmt.all().map(mapKBResult);
        return res;
    }

    getNearestEmbeddings(embedding: LLMEmbedding, limit: number) {
        const query = this.db.prepare(`
            SELECT
                e.rowid,
                distance
            FROM llm_embeddings e
            WHERE embedding MATCH ?
            ORDER BY distance
            LIMIT ?;
        `);
        const result = query.all([Buffer.from(embedding.embedding.buffer)], limit);
        return result.map((r: any) => {
            return { id: r.rowid, distance: r.distance };
        });
    }

    search(query: string): KBQueryResult[] {
        const stmt = this.db.prepare(`
SELECT DISTINCT
    MAX(kb.timestamp) as timestamp,
    kb.workflow, kb.title, kb.url, kb.context, kb.score
FROM llm_kb_fts
INNER JOIN llm_kb kb ON llm_kb_fts.rowid = kb.id
WHERE llm_kb_fts MATCH @query
AND score >= 0.5
ORDER BY rank;
`);
        const res = stmt.all({ query }).map(mapKBResult);
        return res;
    }
}

function mapKBResult(r: any): KBQueryResult {
    if (r.context) r.context = JSON.parse(r.context);
    if (r.timestamp) r.timestamp = new Date(r.timestamp); // TODO: min/max?
    return r as KBQueryResult;
}
