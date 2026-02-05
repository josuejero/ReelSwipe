-- Phase 3: genre dictionary + movie_genres join + baseline recommender support

INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('phase', '3');

-- TMDb genre dictionary
CREATE TABLE IF NOT EXISTS tmdb_genres (
  genre_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- Join table: movies -> genres (many-to-many)
CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id TEXT NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_movie_genres_movie_id ON movie_genres(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_genres_genre_id ON movie_genres(genre_id);

-- Backfill join table from movies.genres_json (stored as JSON array of TMDb genre IDs)
-- Note: D1 supports SQLite JSON functions like json_each().
INSERT OR IGNORE INTO movie_genres(movie_id, genre_id)
SELECT m.movie_id, CAST(j.value AS INTEGER)
FROM movies m, json_each(m.genres_json) j
WHERE m.genres_json IS NOT NULL
  AND json_valid(m.genres_json) = 1;

-- Convenience view: movie_id -> JSON array of genre names
CREATE VIEW IF NOT EXISTS v_movie_genre_names AS
SELECT
  mg.movie_id AS movie_id,
  json_group_array(g.name) AS genre_names_json
FROM movie_genres mg
JOIN tmdb_genres g ON g.genre_id = mg.genre_id
GROUP BY mg.movie_id;
