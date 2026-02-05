export interface Env {
  DB: D1Database;
  CORS_ORIGIN?: string;

  // TMDb sync
  TMDB_API_KEY?: string;

  // Protect admin endpoints
  ADMIN_TOKEN?: string;

  // Phase 4 configurables
  RANKER_MODE?: "two_stage" | "baseline";

  // Phase 7 configurables
  LOG_SAMPLE_RATE?: string;
  REQUEST_LOG_RETENTION_DAYS?: string;
}
