-- Phase 4: two-stage ranker logging + eval support

INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('phase', '4');

-- Add model metadata to impressions
ALTER TABLE recommendation_impressions ADD COLUMN model_version TEXT;
ALTER TABLE recommendation_impressions ADD COLUMN score REAL;

-- Optional: attach an anonymous user id to swipe events
ALTER TABLE swipe_events ADD COLUMN anon_user_id TEXT;

-- Indexes for time-window stats + evaluation joins
CREATE INDEX IF NOT EXISTS idx_impressions_session_deck
  ON recommendation_impressions(session_id, deck_id);

CREATE INDEX IF NOT EXISTS idx_impressions_model_ts
  ON recommendation_impressions(model_version, ts_ms);

CREATE INDEX IF NOT EXISTS idx_swipes_ts_movie
  ON swipe_events(ts_ms, movie_id);

CREATE INDEX IF NOT EXISTS idx_swipes_anon_ts
  ON swipe_events(anon_user_id, ts_ms);
