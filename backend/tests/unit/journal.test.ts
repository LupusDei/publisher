import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createRunEventStore } from "../../src/stores/run-event.store.js";
import { createJournal } from "../../src/journal/index.js";
import type { CheckpointResult, RunEvent, Webpage } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const RUN = "run_j";

function webpage(title: string): Webpage {
  return {
    title,
    html: `<main>${title}</main>`,
    css: "",
    summary: `summary of ${title}`,
    sourcesUsed: [
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ],
  };
}

function checkpointResult(
  name: CheckpointResult["name"],
  passed: boolean,
): CheckpointResult {
  return { name, passed, details: "", autoCorrectable: true, alarms: [] };
}

describe("Journal (over RunEventStore)", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    createRunStore(db).create({
      id: RUN,
      personaId: "p_1",
      concept: "On Emergence",
      workerId: "mock",
    });
  });

  function journal() {
    return createJournal(createRunEventStore(db));
  }

  it("append + load round-trips events in seq order (happy path)", () => {
    const j = journal();
    j.append({ runId: RUN, seq: 0, ts: "t0", t: "phase", phase: "research" });
    j.append({ runId: RUN, seq: 1, ts: "t1", t: "phase", phase: "build" });
    const loaded = j.load(RUN);
    expect(loaded.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("loadSince returns only events strictly after the given seq (reconnect primitive)", () => {
    const j = journal();
    for (let i = 0; i < 3; i++)
      j.append({
        runId: RUN,
        seq: i,
        ts: `t${i}`,
        t: "phase",
        phase: "research",
      });
    expect(j.loadSince(RUN, 0).map((e) => e.seq)).toEqual([1, 2]);
  });

  describe("replayFrom (fold the log — R9)", () => {
    it("re-enters at the FIRST non-passed checkpoint, reusing prior outputs (happy path)", () => {
      const j = journal();
      let seq = 0;
      const emit = (body: Omit<RunEvent, "runId" | "seq" | "ts">) =>
        j.append({
          runId: RUN,
          seq: seq++,
          ts: `t${seq}`,
          ...body,
        } as RunEvent);

      emit({ t: "phase", phase: "research" });
      emit({ t: "phase", phase: "build" });
      emit({ t: "draft", attempt: 1, webpage: webpage("Draft 1") });
      // research-sufficiency + voice-fidelity pass; design-conformance FAILS.
      emit({
        t: "checkpoint",
        result: checkpointResult("research-sufficiency", true),
      });
      emit({
        t: "checkpoint",
        result: checkpointResult("voice-fidelity", true),
      });
      emit({
        t: "checkpoint",
        result: checkpointResult("design-conformance", false),
      });

      const replay = j.replayFrom(RUN);
      expect(replay.fromCheckpoint).toBe("design-conformance");
      expect(replay.priorOutputs.passedCheckpoints).toEqual([
        "research-sufficiency",
        "voice-fidelity",
      ]);
      expect(replay.priorOutputs.lastWebpage?.title).toBe("Draft 1");
      // research is reusable (sufficiency passed) — reconstructed from the log.
      expect(replay.priorOutputs.research?.sources.length).toBe(3);
    });

    it("uses the LATEST draft as lastWebpage across multiple attempts (R2 retain-drafts)", () => {
      const j = journal();
      let seq = 0;
      const emit = (body: Omit<RunEvent, "runId" | "seq" | "ts">) =>
        j.append({
          runId: RUN,
          seq: seq++,
          ts: `t${seq}`,
          ...body,
        } as RunEvent);

      emit({
        t: "checkpoint",
        result: checkpointResult("research-sufficiency", true),
      });
      emit({
        t: "draft",
        attempt: 1,
        webpage: webpage("Draft 1"),
        passed: false,
      });
      emit({
        t: "checkpoint",
        result: checkpointResult("voice-fidelity", false),
      });
      emit({
        t: "draft",
        attempt: 2,
        webpage: webpage("Draft 2"),
        passed: true,
      });
      emit({
        t: "checkpoint",
        result: checkpointResult("voice-fidelity", true),
      });

      const replay = j.replayFrom(RUN);
      expect(replay.priorOutputs.lastWebpage?.title).toBe("Draft 2");
      // voice-fidelity now passed (latest verdict wins) → first unpassed is design.
      expect(replay.fromCheckpoint).toBe("design-conformance");
      expect(replay.priorOutputs.passedCheckpoints).toContain("voice-fidelity");
    });

    it("returns the first gate and empty priors on a fresh/empty run (edge case)", () => {
      const j = journal();
      const replay = j.replayFrom(RUN);
      expect(replay.fromCheckpoint).toBe("research-sufficiency");
      expect(replay.priorOutputs.passedCheckpoints).toEqual([]);
      expect(replay.priorOutputs.lastWebpage).toBeUndefined();
      expect(replay.priorOutputs.research).toBeUndefined();
    });

    it("returns 'quality' as the re-entry when all four gates passed (edge: fully green)", () => {
      const j = journal();
      let seq = 0;
      const emit = (body: Omit<RunEvent, "runId" | "seq" | "ts">) =>
        j.append({
          runId: RUN,
          seq: seq++,
          ts: `t${seq}`,
          ...body,
        } as RunEvent);
      emit({ t: "draft", attempt: 1, webpage: webpage("Final") });
      for (const n of [
        "research-sufficiency",
        "voice-fidelity",
        "design-conformance",
        "quality",
      ] as const)
        emit({ t: "checkpoint", result: checkpointResult(n, true) });

      const replay = j.replayFrom(RUN);
      // All passed → re-entry collapses to the last gate (nothing to redo before it).
      expect(replay.fromCheckpoint).toBe("quality");
      expect(replay.priorOutputs.passedCheckpoints).toHaveLength(4);
    });

    it("does NOT count research as reusable if research-sufficiency failed (fold correctness)", () => {
      const j = journal();
      let seq = 0;
      const emit = (body: Omit<RunEvent, "runId" | "seq" | "ts">) =>
        j.append({
          runId: RUN,
          seq: seq++,
          ts: `t${seq}`,
          ...body,
        } as RunEvent);
      emit({
        t: "checkpoint",
        result: checkpointResult("research-sufficiency", false),
      });
      const replay = j.replayFrom(RUN);
      expect(replay.fromCheckpoint).toBe("research-sufficiency");
      expect(replay.priorOutputs.research).toBeUndefined();
    });
  });
});
