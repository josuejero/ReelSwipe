-- Phase 6: Offline ML model registry + CF neighbors

INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('phase', '6');

-- Registry of trained models and their metrics
CREATE TABLE IF NOT EXISTS model_versions (
  model_version TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  snapshot_id TEXT NOT NULL,
  algo TEXT NOT NULL,
  params_json TEXT NOT NULL,
  metrics_json TEXT,
  notes TEXT
);

-- Item-item neighbors for implicit-feedback collaborative filtering
CREATE TABLE IF NOT EXISTS cf_item_neighbors (
  model_version TEXT NOT NULL,
  movie_id TEXT NOT NULL,
  neighbor_movie_id TEXT NOT NULL,
  score REAL NOT NULL,
  PRIMARY KEY (model_version, movie_id, neighbor_movie_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_neighbors_lookup
  ON cf_item_neighbors(model_version, movie_id, score DESC);

-- App-level pointer to which model is active (set by admin endpoint or SQL)
INSERT OR IGNORE INTO app_meta(key, value)
VALUES ('current_model_version', 'two_stage_v2');
