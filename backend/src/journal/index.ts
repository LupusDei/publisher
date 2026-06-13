/**
 * Track D — Journal surface. The domain `Journal` over the authoritative
 * `run_events` log (ASSUMPTIONS D5): append/load/loadSince + `replayFrom` as a
 * pure fold for R9 replay.
 */
export { createJournal } from "./journal.js";
