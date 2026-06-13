import { describe, it, expect, vi } from "vitest";
import type { Alarm } from "@publisher/shared";
import type { AlarmStore, StoredAlarm } from "../../src/stores/alarm.store.js";
import { persistAlarms } from "../../src/observability/persist.js";

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  type: "TOKEN_BUDGET_EXCEEDED",
  severity: "warning",
  context: {},
  recommendedAction: "reduce scope",
  ...over,
});

function fakeStore(): AlarmStore {
  const rows: StoredAlarm[] = [];
  return {
    insert: vi.fn((runId, phase, a): StoredAlarm => {
      const stored: StoredAlarm =
        phase === undefined
          ? { id: `a${rows.length}`, runId, createdAt: "now", alarm: a }
          : { id: `a${rows.length}`, runId, phase, createdAt: "now", alarm: a };
      rows.push(stored);
      return stored;
    }),
    listByRun: vi.fn((runId) => rows.filter((r) => r.runId === runId)),
  };
}

describe("persistAlarms", () => {
  it("should insert every alarm under the run with its phase (happy path)", () => {
    const store = fakeStore();
    const alarms = [alarm({ type: "VOICE_DRIFT" }), alarm({ type: "HIGH_LATENCY" })];
    const stored = persistAlarms(store, "run_1", "build", alarms);
    expect(stored).toHaveLength(2);
    expect(store.insert).toHaveBeenCalledTimes(2);
    expect(store.insert).toHaveBeenNthCalledWith(1, "run_1", "build", alarms[0]);
    expect(store.listByRun("run_1")).toHaveLength(2);
  });

  it("should be a no-op for an empty alarm list (edge case)", () => {
    const store = fakeStore();
    const stored = persistAlarms(store, "run_1", undefined, []);
    expect(stored).toEqual([]);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("should pass an undefined phase straight through for aggregate alarms (edge case)", () => {
    const store = fakeStore();
    persistAlarms(store, "run_1", undefined, [alarm()]);
    expect(store.insert).toHaveBeenCalledWith("run_1", undefined, expect.any(Object));
  });
});
