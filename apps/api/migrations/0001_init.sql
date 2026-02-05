-- Phase 0: minimal schema for sanity checks
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('phase', '0');
