import { randomUUID } from "node:crypto";
import { ResearchResultSchema, type ResearchResult } from "@publisher/shared";
import type { DB } from "./db.js";

/**
 * ResearchStore — durable research artifacts (publisher-kgv). Research is the
 * slowest, most expensive phase of a run (real web_search + a long model call),
 * and until now its result lived only in the in-memory RunContext, so a backend
 * restart mid-build threw it away and a resume had to re-research from scratch.
 *
 * Persisting it lets `engine.resumeRun` rehydrate `ctx.research` and pick up at
 * the build phase. Rows are append-only per (runId, attempt); `latest` returns
 * the most recently inserted, which is the research the run was last building on.
 */
export interface StoredResearch {
  id: string;
  runId: string;
  attempt: number;
  createdAt: string;
  research: ResearchResult;
}

export interface ResearchStore {
  /** Persist the research produced for a run/attempt. */
  save(
    runId: string,
    attempt: number,
    research: ResearchResult,
  ): StoredResearch;
  /** The most recently saved research for a run, or null if none yet. */
  latest(runId: string): StoredResearch | null;
}

interface ResearchRow {
  id: string;
  run_id: string;
  attempt: number;
  created_at: string;
  payload: string;
}

export function createResearchStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): ResearchStore {
  const insertStmt = db.prepare(
    `INSERT INTO research
       (id, run_id, attempt, text, sources_count, created_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  // rowid DESC = most recently inserted, regardless of clock granularity.
  const latestStmt = db.prepare(
    `SELECT * FROM research WHERE run_id = ? ORDER BY rowid DESC LIMIT 1`,
  );

  return {
    save(runId, attempt, research) {
      const id = newId();
      const createdAt = now();
      insertStmt.run(
        id,
        runId,
        attempt,
        research.text,
        research.sources.length,
        createdAt,
        JSON.stringify(research),
      );
      return { id, runId, attempt, createdAt, research };
    },

    latest(runId) {
      const row = latestStmt.get(runId) as ResearchRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        runId: row.run_id,
        attempt: row.attempt,
        createdAt: row.created_at,
        research: ResearchResultSchema.parse(JSON.parse(row.payload)),
      };
    },
  };
}
