-- Phase 2: impressions + swipe logging + TMDb catalog

INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('phase', '2');

-- Extend movies to support TMDb (keep poster_url as full URL for UI compatibility)
ALTER TABLE movies ADD COLUMN tmdb_id INTEGER;
ALTER TABLE movies ADD COLUMN source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_tmdb_id
  ON movies(tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- Impression log (one row per item served)
CREATE TABLE IF NOT EXISTS recommendation_impressions (
  impression_id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  movie_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_impressions_session_ts
  ON recommendation_impressions(session_id, ts_ms);

CREATE INDEX IF NOT EXISTS idx_impressions_deck_rank
  ON recommendation_impressions(deck_id, rank);

-- Swipe log (idempotent by event_id)
CREATE TABLE IF NOT EXISTS swipe_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  deck_id TEXT NOT NULL,
  movie_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('like','skip')),
  ts_ms INTEGER NOT NULL,
  dwell_ms INTEGER,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_swipes_session_ts
  ON swipe_events(session_id, ts_ms);

CREATE INDEX IF NOT EXISTS idx_swipes_movie_action
  ON swipe_events(movie_id, action);

-- TMDb sync visibility
CREATE TABLE IF NOT EXISTS tmdb_sync_log (
  run_id TEXT PRIMARY KEY,
  started_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  status TEXT NOT NULL,
  inserted INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  error TEXT
);
