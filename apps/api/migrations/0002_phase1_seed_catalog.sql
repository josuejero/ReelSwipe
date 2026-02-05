-- Phase 1: demo sessions + seeded catalog

-- Track the current phase
INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('phase', '1');

-- Demo sessions (no auth)
CREATE TABLE IF NOT EXISTS demo_sessions (
  session_id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- Seeded catalog (small and reliable)
CREATE TABLE IF NOT EXISTS movies (
  movie_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER,
  poster_url TEXT,
  genres_json TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);

-- Minimal seed set (replace later with a larger curated list)
-- Posters use placeholders so Phase 1 is zero-dependency.
INSERT OR REPLACE INTO movies(
  movie_id, title, year, poster_url, genres_json, created_at_ms, updated_at_ms
) VALUES
  ('seed-001', 'Night Train', 2019, 'https://placehold.co/600x900?text=Night+Train', '["Thriller"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-002', 'Paper Suns', 2021, 'https://placehold.co/600x900?text=Paper+Suns', '["Drama"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-003', 'Static Summer', 2018, 'https://placehold.co/600x900?text=Static+Summer', '["Romance"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-004', 'Orbit Kids', 2022, 'https://placehold.co/600x900?text=Orbit+Kids', '["Family","Adventure"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-005', 'Rust & Neon', 2020, 'https://placehold.co/600x900?text=Rust+%26+Neon', '["Sci-Fi"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-006', 'Loud Library', 2017, 'https://placehold.co/600x900?text=Loud+Library', '["Comedy"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-007', 'Blue Signal', 2016, 'https://placehold.co/600x900?text=Blue+Signal', '["Mystery"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-008', 'Cold Orchard', 2023, 'https://placehold.co/600x900?text=Cold+Orchard', '["Horror"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-009', 'Seven Bridges', 2015, 'https://placehold.co/600x900?text=Seven+Bridges', '["Action"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-010', 'Glass Weekend', 2014, 'https://placehold.co/600x900?text=Glass+Weekend', '["Indie"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-011', 'Beacon Road', 2013, 'https://placehold.co/600x900?text=Beacon+Road', '["Crime"]', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('seed-012', 'Moonfold', 2012, 'https://placehold.co/600x900?text=Moonfold', '["Fantasy"]', strftime('%s','now')*1000, strftime('%s','now')*1000);
