import type { Alarm, Phase } from "@publisher/shared";
import type { AlarmStore, StoredAlarm } from "../stores/alarm.store.js";

/**
 * Orchestrator helper: persist a batch of RETURNED alarms (D7) via the
 * `AlarmStore`. This module owns NO wiring — the orchestrator decides when to
 * call it and supplies the store, the `runId`, and the firing `phase`
 * (undefined for aggregate / budget alarms). Kept tiny and dependency-injected
 * so Track E stays inside `backend/src/observability/` (D17).
 */
export function persistAlarms(
  store: AlarmStore,
  runId: string,
  phase: Phase | undefined,
  alarms: readonly Alarm[],
): StoredAlarm[] {
  return alarms.map((alarm) => store.insert(runId, phase, alarm));
}
