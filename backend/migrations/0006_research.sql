-- Durable research artifacts (publisher-kgv): persist each run's ResearchResult
-- so a run interrupted AFTER research (e.g. a backend restart mid-build) can
-- RESUME at the build phase without re-running the expensive web_search pass.
--
-- Keyed by (run_id, attempt); `latest` reads the most recently inserted row.
-- `payload` holds the full ResearchResult JSON; `text` / `sources_count` are
-- denormalized for cheap inspection.

CREATE TABLE IF NOT EXISTS research (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  attempt       INTEGER NOT NULL,
  text          TEXT NOT NULL,
  sources_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  payload       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_run ON research (run_id);
