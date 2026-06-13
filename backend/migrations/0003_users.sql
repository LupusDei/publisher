-- Authentication: user accounts (Epic publisher-85q). Bearer-token auth; the
-- password_hash is a bcrypt digest and never leaves the store as part of the
-- public `User`. IF NOT EXISTS keeps re-application a no-op (the migration
-- runner also guards against re-running an already-recorded migration).
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,            -- login identity
  password_hash TEXT NOT NULL,                   -- bcrypt digest
  role          TEXT NOT NULL DEFAULT 'user',    -- 'user' | 'admin'
  created_at    TEXT NOT NULL                    -- ISO-8601
);

-- Case-insensitive-ish lookups still go through the UNIQUE index on email; an
-- explicit index documents the access pattern (getByEmail on every login).
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
