-- Persona Store: per-user personas (the declared guardrail set).
-- Arrays/objects are stored as JSON text and validated against the shared
-- PersonaSchema on read.
CREATE TABLE IF NOT EXISTS personas (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  voice           TEXT NOT NULL,
  style_points    TEXT NOT NULL, -- JSON array of strings
  key_learnings   TEXT NOT NULL, -- JSON array of strings
  design_elements TEXT NOT NULL, -- JSON object of string -> string
  created_at      TEXT NOT NULL  -- ISO-8601
);
