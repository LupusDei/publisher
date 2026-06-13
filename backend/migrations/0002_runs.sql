-- Track 0 schema expansion (ASSUMPTIONS D5/D6). `run_events` is the AUTHORITATIVE
-- event log (event-sourced journal): WS is a live tail, reconnect/replay re-folds
-- the log via seq. The other tables are queryable PROJECTIONS. All statements use
-- IF NOT EXISTS so re-applying the migration is a no-op (the runner also guards
-- against re-running an already-recorded migration).

-- Run header rows (the state machine's identity + status).
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  persona_id  TEXT NOT NULL,
  concept     TEXT NOT NULL,
  worker_id   TEXT NOT NULL,
  status      TEXT NOT NULL,             -- RunStatus
  created_at  TEXT NOT NULL,             -- ISO-8601
  updated_at  TEXT NOT NULL
);

-- The authoritative append-only event log. `seq` is monotonic PER RUN; the
-- composite uniqueness of (run_id, seq) is what enforces that — duplicate seq on
-- the same run is rejected, while the same seq across different runs is fine.
CREATE TABLE IF NOT EXISTS run_events (
  run_id   TEXT NOT NULL,
  seq      INTEGER NOT NULL,
  ts       TEXT NOT NULL,                -- ISO-8601
  type     TEXT NOT NULL,               -- RunEvent discriminant `t`
  pillar   TEXT,                        -- optional pillar tag
  payload  TEXT NOT NULL,               -- JSON of the full RunEvent
  PRIMARY KEY (run_id, seq),
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE INDEX IF NOT EXISTS idx_run_events_run_seq ON run_events (run_id, seq);

-- Projection: explicit checkpoint pass/fail per attempt (StoredCheckpointResult).
CREATE TABLE IF NOT EXISTS checkpoints (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  attempt     INTEGER NOT NULL,
  name        TEXT NOT NULL,             -- CheckpointName
  passed      INTEGER NOT NULL,          -- 0|1
  score       REAL,
  threshold   REAL,
  details     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  payload     TEXT NOT NULL,             -- JSON of the full CheckpointResult
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_run ON checkpoints (run_id);

-- Projection: structured alarms (StoredAlarm).
CREATE TABLE IF NOT EXISTS alarms (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL,
  type               TEXT NOT NULL,      -- AlarmType
  severity           TEXT NOT NULL,      -- AlarmSeverity
  phase              TEXT,               -- Phase (optional)
  recommended_action TEXT NOT NULL,
  context            TEXT NOT NULL,      -- JSON
  created_at         TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE INDEX IF NOT EXISTS idx_alarms_run ON alarms (run_id);

-- Projection: per-run metrics snapshots.
CREATE TABLE IF NOT EXISTS metrics (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  snapshot    TEXT NOT NULL,             -- JSON of Metrics
  created_at  TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE INDEX IF NOT EXISTS idx_metrics_run ON metrics (run_id);

-- Projection: escalations awaiting / resolved (HITL).
CREATE TABLE IF NOT EXISTS escalations (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  reason      TEXT NOT NULL,
  options     TEXT NOT NULL,             -- JSON array of EscalationOption
  alarm       TEXT NOT NULL,             -- JSON of the triggering Alarm
  decision    TEXT,                      -- JSON of EscalationDecision (null until resolved)
  created_at  TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE INDEX IF NOT EXISTS idx_escalations_run ON escalations (run_id);

-- Projection: webpage metadata for EVERY build attempt (rendered HTML is the
-- static file on disk — D6/G6). The published one is flagged.
CREATE TABLE IF NOT EXISTS webpages (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL,
  attempt      INTEGER NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  sources_used TEXT NOT NULL,            -- JSON array
  published    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  payload      TEXT NOT NULL,            -- JSON of the full Webpage
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE INDEX IF NOT EXISTS idx_webpages_run ON webpages (run_id);
