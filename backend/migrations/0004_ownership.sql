-- Per-user ownership (Epic publisher-85q, 85q.4). Stamps the authoring user on
-- personas and runs so list/get/PATCH can be scoped by owner (admin sees all).
-- The column is NULLABLE so the migration applies cleanly to any pre-existing
-- rows (seeded demo data) without a backfill; new writes always stamp it.
-- IF NOT EXISTS on the indexes keeps re-application a no-op (the runner also
-- guards against re-running an already-recorded migration). SQLite ALTER TABLE
-- ADD COLUMN is not itself guarded, but a migration runs at most once.

ALTER TABLE personas ADD COLUMN user_id TEXT;
ALTER TABLE runs ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_personas_user ON personas (user_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs (user_id);
