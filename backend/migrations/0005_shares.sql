-- Shareable preview URLs (Epic publisher-share, share.1.1). A `share` maps an
-- unguessable, url-safe slug to a run so an anonymous browser can load the run's
-- already self-contained HTML via GET /p/:slug — without exposing the internal
-- (enumerable) runId. A share is a DISTINCT concept from run.status='published':
-- approving into the gallery (publish) is not the same as minting a public link.
--
-- owner_id is NULLABLE to match runs.user_id nullability (un-owned/seeded runs).
-- revoked_at NULL means the share is ACTIVE; setting it revokes the link so
-- GET /p/:slug 404s. No TTL/expiry in the MVP — revoke covers the need.
--
-- The partial unique index enforces AT MOST ONE active share per run, which is
-- what makes mint idempotent: a concurrent second mint hits the constraint and
-- the service returns the existing active share instead of creating a new one.
-- (Revoked rows are excluded from the index, so a run can be re-shared after a
-- revoke without colliding with the historical revoked row.)

CREATE TABLE IF NOT EXISTS shares (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  owner_id    TEXT,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_active_run
  ON shares (run_id) WHERE revoked_at IS NULL;
