-- Phase 5: Metrics + Observability

-- Request-level logs (for metrics like p50 latency)
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  dur_ms INTEGER NOT NULL,
  ts_ms INTEGER NOT NULL
);

-- Fast time-window queries
CREATE INDEX IF NOT EXISTS idx_request_logs_ts_ms ON request_logs(ts_ms);
CREATE INDEX IF NOT EXISTS idx_request_logs_route_ts ON request_logs(route, ts_ms);

-- Helpful indexes for existing metrics queries
CREATE INDEX IF NOT EXISTS idx_swipe_events_ts_ms ON swipe_events(ts_ms);
CREATE INDEX IF NOT EXISTS idx_reco_impressions_ts_ms ON recommendation_impressions(ts_ms);
