import { randomUUID } from "node:crypto";
import { WebpageSchema, type Webpage } from "@publisher/shared";
import type { DB } from "./db.js";

/** Stored webpage metadata for one build attempt (D6 — HTML is the static file). */
export interface StoredWebpage {
  id: string;
  runId: string;
  attempt: number;
  published: boolean;
  createdAt: string;
  webpage: Webpage;
}

/** Projection store recording EVERY build attempt; the published one is flagged. */
export interface WebpageStore {
  insert(
    runId: string,
    attempt: number,
    webpage: Webpage,
    published: boolean,
  ): StoredWebpage;
  listByRun(runId: string): StoredWebpage[];
}

interface WebpageRow {
  id: string;
  run_id: string;
  attempt: number;
  published: number;
  created_at: string;
  payload: string;
}

export function createWebpageStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): WebpageStore {
  const insertStmt = db.prepare(
    `INSERT INTO webpages
       (id, run_id, attempt, title, summary, sources_used, published, created_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStmt = db.prepare(
    `SELECT * FROM webpages WHERE run_id = ? ORDER BY attempt ASC, id ASC`,
  );

  return {
    insert(runId, attempt, webpage, published) {
      const id = newId();
      const createdAt = now();
      insertStmt.run(
        id,
        runId,
        attempt,
        webpage.title,
        webpage.summary,
        JSON.stringify(webpage.sourcesUsed),
        published ? 1 : 0,
        createdAt,
        JSON.stringify(webpage),
      );
      return { id, runId, attempt, published, createdAt, webpage };
    },

    listByRun(runId) {
      return (listStmt.all(runId) as WebpageRow[]).map((row) => ({
        id: row.id,
        runId: row.run_id,
        attempt: row.attempt,
        published: row.published === 1,
        createdAt: row.created_at,
        webpage: WebpageSchema.parse(JSON.parse(row.payload)),
      }));
    },
  };
}
