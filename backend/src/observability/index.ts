/**
 * Observability & Alarms (Pillar 4, R5) — kept a separate module (ASSUMPTIONS
 * D17). The orchestrator instantiates a per-run `Meter` (D9), feeds each agent
 * call's usage/latency, asks `detectBreaches` for budget breaches, runs every
 * breach / checkpoint failure / agent error through the `AlarmEmitter`
 * (alarms RETURNED, never thrown — D7), and persists the results via
 * `persistAlarms`.
 */
export { createMeter } from "./meter.js";
export { detectBreaches, totalTokens, totalLatencyMs } from "./budget.js";
export { createAlarmEmitter } from "./alarm-emitter.js";
export { persistAlarms } from "./persist.js";
