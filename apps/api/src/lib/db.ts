import type { Env } from "../types";
import type { TwoStageCandidate } from "./ranker";

export type RequestLogRow = {
  req_id: string;
  route: string;
  method: string;
  path: string;
  status: number;
  dur_ms: number;
  ts_ms: number;
};

export type Metrics24h = {
  window_ms: number;
  since_ms: number;
  swipes: number;
  likes: number;
  skips: number;
  impressions: number;
  like_rate: number | null;
  skip_rate: number | null;
  p50_deck_ms: number | null;
};

async function scalarInt(db: D1Database, sql: string, ...params: any[]) {
  const out = await db
    .prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return Number(out?.n ?? 0);
}

async function medianMs(db: D1Database, sinceMs: number, route: string): Promise<number | null> {
  const n = await scalarInt(
    db,
    `SELECT COUNT(*) AS n FROM request_logs WHERE ts_ms >= ? AND route = ?`,
    sinceMs,
    route,
  );

  if (n <= 0) return null;

  if (n % 2 === 1) {
    const offset = Math.floor(n / 2);
    const row = await db
      .prepare(
        `SELECT dur_ms FROM request_logs
         WHERE ts_ms >= ? AND route = ?
         ORDER BY dur_ms
         LIMIT 1 OFFSET ?`,
      )
      .bind(sinceMs, route, offset)
      .first<{ dur_ms: number }>();
    return row ? Number(row.dur_ms) : null;
  }

  const o1 = n / 2 - 1;
  const o2 = n / 2;

  const r1 = await db
    .prepare(
      `SELECT dur_ms FROM request_logs
       WHERE ts_ms >= ? AND route = ?
       ORDER BY dur_ms
       LIMIT 1 OFFSET ?`,
    )
    .bind(sinceMs, route, o1)
    .first<{ dur_ms: number }>();

  const r2 = await db
    .prepare(
      `SELECT dur_ms FROM request_logs
       WHERE ts_ms >= ? AND route = ?
       ORDER BY dur_ms
       LIMIT 1 OFFSET ?`,
    )
    .bind(sinceMs, route, o2)
    .first<{ dur_ms: number }>();

  if (!r1 || !r2) return null;
  return Math.round((Number(r1.dur_ms) + Number(r2.dur_ms)) / 2);
}

export async function recordRequestLog(db: D1Database, row: RequestLogRow) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO request_logs (id, req_id, route, method, path, status, dur_ms, ts_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, row.req_id, row.route, row.method, row.path, row.status, row.dur_ms, row.ts_ms)
    .run();
}

export async function pruneRequestLogs(
  db: D1Database,
  cutoffTsMs: number,
): Promise<void> {
  await db.prepare("DELETE FROM request_logs WHERE ts_ms < ?").bind(cutoffTsMs).run();
}

export async function countMovies(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM movies").first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function getMetrics24h(
  db: D1Database,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<Metrics24h> {
  const sinceMs = Date.now() - windowMs;

  const swipes = await scalarInt(
    db,
    `SELECT COUNT(*) AS n FROM swipe_events WHERE ts_ms >= ?`,
    sinceMs,
  );
  const likes = await scalarInt(
    db,
    `SELECT COUNT(*) AS n FROM swipe_events WHERE ts_ms >= ? AND action = 'like'`,
    sinceMs,
  );
  const skips = await scalarInt(
    db,
    `SELECT COUNT(*) AS n FROM swipe_events WHERE ts_ms >= ? AND action = 'skip'`,
    sinceMs,
  );
  const impressions = await scalarInt(
    db,
    `SELECT COUNT(*) AS n FROM recommendation_impressions WHERE ts_ms >= ?`,
    sinceMs,
  );

  const like_rate = swipes > 0 ? likes / swipes : null;
  const skip_rate = swipes > 0 ? skips / swipes : null;
  const p50_deck_ms = await medianMs(db, sinceMs, `GET /v1/deck`);

  return {
    window_ms: windowMs,
    since_ms: sinceMs,
    swipes,
    likes,
    skips,
    impressions,
    like_rate,
    skip_rate,
    p50_deck_ms,
  };
}

export type MovieRow = {
  movie_id: string;
  tmdb_id: number | null;
  title: string;
  year: number | null;
  poster_url: string | null;
  genres_json: string | null; // JSON array of TMDb genre IDs
  source: string | null;
};

export type UpsertMovie = {
  movie_id: string;
  tmdb_id: number | null;
  title: string;
  year: number | null;
  poster_url: string | null;
  genres_json: string; // JSON array
  source: string;
};

export type GenreRow = {
  genre_id: number;
  name: string;
};

export type SwipeAction = "like" | "skip";

export type CandidateMovie = {
  movie_id: string;
  title: string;
  year: number | null;
  poster_url: string | null;
  likes: number;
  skips: number;
};

function nowMs() {
  return Date.now();
}

async function one<T>(stmt: D1PreparedStatement): Promise<T | null> {
  const r = await stmt.first<T>();
  return r ?? null;
}

export async function getPhase(env: Env): Promise<string> {
  const row = await one<{ value: string }>(
    env.DB.prepare("SELECT value FROM app_meta WHERE key = ?1").bind("phase"),
  );
  return row?.value ?? "unknown";
}

export async function setMeta(env: Env, key: string, value: string) {
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key, value) VALUES (?1, ?2)")
    .bind(key, value)
    .run();
}

export async function getMeta(env: Env, key: string): Promise<string | null> {
  const row = await one<{ value: string }>(
    env.DB.prepare("SELECT value FROM app_meta WHERE key = ?1").bind(key),
  );
  return row?.value ?? null;
}

export async function getCurrentModelVersion(env: Env): Promise<string> {
  const value = await getMeta(env, "current_model_version");
  return value ?? "two_stage_v2";
}

export async function modelVersionExists(env: Env, modelVersion: string): Promise<boolean> {
  const row = await one<{ n: number }>(
    env.DB.prepare("SELECT COUNT(*) AS n FROM model_versions WHERE model_version = ?1").bind(modelVersion),
  );
  return Number(row?.n ?? 0) > 0;
}

export async function setCurrentModelVersion(env: Env, modelVersion: string) {
  await setMeta(env, "current_model_version", modelVersion);
}

export async function upsertGenres(env: Env, genres: GenreRow[]) {
  const t = nowMs();
  const stmts = genres.map((g) =>
    env.DB.prepare(
      `INSERT INTO tmdb_genres(genre_id, name, updated_at_ms)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(genre_id) DO UPDATE SET
           name = excluded.name,
           updated_at_ms = excluded.updated_at_ms`,
    ).bind(g.genre_id, g.name, t),
  );

  if (stmts.length > 0) await env.DB.batch(stmts);
  return { upserted: stmts.length };
}

export async function listMovies(env: Env, limit = 5000): Promise<MovieRow[]> {
  const r = await env.DB.prepare(
    `SELECT movie_id, tmdb_id, title, year, poster_url, genres_json, source
       FROM movies
       ORDER BY updated_at_ms DESC
       LIMIT ?1`,
  )
    .bind(limit)
    .all<MovieRow>();

  return (r.results ?? []) as MovieRow[];
}

export async function upsertMovies(env: Env, movies: UpsertMovie[], nowMs: number) {
  const stmts = movies.map((m) =>
    env.DB.prepare(
      `INSERT INTO movies(movie_id, tmdb_id, title, year, poster_url, genres_json, source, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(movie_id) DO UPDATE SET
           tmdb_id = excluded.tmdb_id,
           title = excluded.title,
           year = excluded.year,
           poster_url = excluded.poster_url,
           genres_json = excluded.genres_json,
           source = excluded.source,
           updated_at_ms = excluded.updated_at_ms`,
    ).bind(m.movie_id, m.tmdb_id, m.title, m.year, m.poster_url, m.genres_json, m.source, nowMs),
  );

  if (stmts.length > 0) await env.DB.batch(stmts);
  return { upserted: stmts.length };
}

export async function rebuildMovieGenresForMovies(env: Env, movieIds: string[]) {
  if (movieIds.length === 0) return { rebuilt: 0 };
  const idsJson = JSON.stringify(movieIds);

  await env.DB.prepare(
    `DELETE FROM movie_genres
       WHERE movie_id IN (SELECT value FROM json_each(?1))`,
  )
    .bind(idsJson)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO movie_genres(movie_id, genre_id)
       SELECT m.movie_id, CAST(j.value AS INTEGER)
       FROM movies m, json_each(m.genres_json) j
       WHERE m.movie_id IN (SELECT value FROM json_each(?1))
         AND m.genres_json IS NOT NULL
         AND json_valid(m.genres_json) = 1`,
  )
    .bind(idsJson)
    .run();

  return { rebuilt: movieIds.length };
}

export async function getGenreNamesForMovies(env: Env, movieIds: string[]) {
  if (movieIds.length === 0) return new Map<string, string[]>();
  const idsJson = JSON.stringify(movieIds);

  const r = await env.DB.prepare(
    `SELECT mg.movie_id as movie_id,
              json_group_array(g.name) as names_json
       FROM movie_genres mg
       JOIN tmdb_genres g ON g.genre_id = mg.genre_id
       WHERE mg.movie_id IN (SELECT value FROM json_each(?1))
       GROUP BY mg.movie_id`,
  )
    .bind(idsJson)
    .all<{ movie_id: string; names_json: string }>();

  const out = new Map<string, string[]>();
  for (const row of r.results ?? []) {
    try {
      const arr = JSON.parse(row.names_json) as string[];
      out.set(row.movie_id, Array.isArray(arr) ? arr : []);
    } catch {
      out.set(row.movie_id, []);
    }
  }
  return out;
}

export async function getGenreIdsForMovies(env: Env, movieIds: string[]) {
  if (movieIds.length === 0) return new Map<string, number[]>();
  const idsJson = JSON.stringify(movieIds);

  const r = await env.DB.prepare(
    `SELECT mg.movie_id as movie_id,
              json_group_array(mg.genre_id) as ids_json
       FROM movie_genres mg
       WHERE mg.movie_id IN (SELECT value FROM json_each(?1))
       GROUP BY mg.movie_id`,
  )
    .bind(idsJson)
    .all<{ movie_id: string; ids_json: string }>();

  const out = new Map<string, number[]>();
  for (const row of r.results ?? []) {
    try {
      const arr = JSON.parse(row.ids_json) as number[];
      out.set(row.movie_id, Array.isArray(arr) ? arr : []);
    } catch {
      out.set(row.movie_id, []);
    }
  }
  return out;
}

export async function getCandidateMoviesForDeck(
  env: Env,
  sessionId: string,
  limit: number,
): Promise<CandidateMovie[]> {
  const r = await env.DB.prepare(
    `WITH stats AS (
         SELECT
           movie_id,
           SUM(CASE WHEN action = 'like' THEN 1 ELSE 0 END) AS likes,
           SUM(CASE WHEN action = 'skip' THEN 1 ELSE 0 END) AS skips
         FROM swipe_events
         GROUP BY movie_id
       )
       SELECT
         m.movie_id,
         m.title,
         m.year,
         m.poster_url,
         COALESCE(s.likes, 0) AS likes,
         COALESCE(s.skips, 0) AS skips
       FROM movies m
       LEFT JOIN stats s ON s.movie_id = m.movie_id
       WHERE m.movie_id NOT IN (
         SELECT movie_id FROM swipe_events WHERE session_id = ?1
       )
       ORDER BY COALESCE(s.likes, 0) DESC, COALESCE(s.skips, 0) ASC, m.updated_at_ms DESC
       LIMIT ?2`,
  )
    .bind(sessionId, Math.max(limit, 100))
    .all<CandidateMovie>();

  return (r.results ?? []) as CandidateMovie[];
}

export async function getTwoStageCandidates(
  env: Env,
  args: {
    sessionId: string;
    nowMs: number;
    windowMs: number;
    limit: number;
    topGenres: number;
  },
): Promise<TwoStageCandidate[]> {
  const { sessionId, nowMs, windowMs, limit, topGenres } = args;
  const cutoff = nowMs - windowMs;

  const r = await env.DB.prepare(
    `WITH seen AS (
         SELECT movie_id FROM recommendation_impressions WHERE session_id = ?1
         UNION
         SELECT movie_id FROM swipe_events WHERE session_id = ?1
       ),
       recent AS (
         SELECT
           movie_id,
           SUM(CASE WHEN action = 'like' THEN 1 ELSE 0 END) AS likes_recent,
           SUM(CASE WHEN action = 'skip' THEN 1 ELSE 0 END) AS skips_recent
         FROM swipe_events
         WHERE ts_ms >= ?2
         GROUP BY movie_id
       ),
       base AS (
         SELECT
           m.movie_id,
           m.title,
           m.year,
           m.poster_url,
           m.source,
           COALESCE(r.likes_recent, 0) AS likes_recent,
           COALESCE(r.skips_recent, 0) AS skips_recent
         FROM movies m
         LEFT JOIN recent r ON r.movie_id = m.movie_id
         WHERE m.movie_id NOT IN (SELECT movie_id FROM seen)
       ),
       top_genres AS (
         SELECT
           mg.genre_id AS genre_id,
           SUM(CASE WHEN se.action = 'like' THEN 1 ELSE -1 END) AS score
         FROM swipe_events se
         JOIN movie_genres mg ON mg.movie_id = se.movie_id
         WHERE se.session_id = ?1
         GROUP BY mg.genre_id
         ORDER BY score DESC
         LIMIT ?3
       ),
       popular_recent AS (
         SELECT
           movie_id, title, year, poster_url, source,
           likes_recent, skips_recent,
           'popular_recent' AS bucket
         FROM base
         ORDER BY
           ((likes_recent + 1.0) / (likes_recent + skips_recent + 2.0)) DESC,
           (likes_recent + skips_recent) DESC
         LIMIT 140
       ),
       genre_match AS (
         SELECT
           b.movie_id, b.title, b.year, b.poster_url, b.source,
           b.likes_recent, b.skips_recent,
           'genre_match' AS bucket
         FROM base b
         JOIN movie_genres mg ON mg.movie_id = b.movie_id
         JOIN top_genres tg ON tg.genre_id = mg.genre_id
         GROUP BY b.movie_id
         ORDER BY
           COUNT(*) DESC,
           (b.likes_recent + b.skips_recent) DESC
         LIMIT 140
       ),
       explore AS (
         SELECT
           movie_id, title, year, poster_url, source,
           likes_recent, skips_recent,
           'explore' AS bucket
         FROM base
         ORDER BY RANDOM()
         LIMIT 60
       ),
       unioned AS (
         SELECT * FROM popular_recent
         UNION ALL
         SELECT * FROM genre_match
         UNION ALL
         SELECT * FROM explore
       )
       SELECT
         u.movie_id,
         u.title,
         u.year,
         u.poster_url,
         u.source,
         MAX(u.likes_recent) AS likes_recent,
         MAX(u.skips_recent) AS skips_recent
       FROM unioned u
       GROUP BY u.movie_id
       LIMIT ?4;`,
  )
    .bind(sessionId, cutoff, topGenres, limit)
    .all<TwoStageCandidate>();

  return (r.results ?? []) as TwoStageCandidate[];
}

export async function getCFCandidates(
  env: Env,
  args: {
    sessionId: string;
    modelVersion: string;
    limit: number;
    maxLikes?: number;
  },
): Promise<TwoStageCandidate[]> {
  const { sessionId, modelVersion, limit, maxLikes = 20 } = args;
  const likedLimit = Math.max(1, Number(maxLikes));

  const liked = await env.DB.prepare(
    `SELECT movie_id
       FROM swipe_events
      WHERE session_id = ?1 AND action = 'like'
      ORDER BY ts_ms DESC
      LIMIT ?2`,
  )
    .bind(sessionId, likedLimit)
    .all<{ movie_id: string }>();

  const likedIds: string[] = [];
  const seenLikes = new Set<string>();
  for (const row of liked.results ?? []) {
    const id = String(row?.movie_id ?? "").trim();
    if (!id || seenLikes.has(id)) continue;
    seenLikes.add(id);
    likedIds.push(id);
  }

  if (!likedIds.length) return [];

  const placeholders = likedIds.map((_, i) => `?${i + 3}`).join(",");
  const limitPlaceholder = `?${likedIds.length + 3}`;
  const safeLimit = Math.max(1, limit);

  const sql = `WITH seen AS (
      SELECT movie_id FROM recommendation_impressions WHERE session_id = ?1
      UNION
      SELECT movie_id FROM swipe_events WHERE session_id = ?1
    ),
    neighbors AS (
      SELECT neighbor_movie_id AS movie_id,
             SUM(score) AS cf_score
        FROM cf_item_neighbors
       WHERE model_version = ?2
         AND movie_id IN (${placeholders})
       GROUP BY neighbor_movie_id
    ),
    recent AS (
      SELECT
        movie_id,
        SUM(CASE WHEN action='like' THEN 1 ELSE 0 END) AS likes_recent,
        SUM(CASE WHEN action='skip' THEN 1 ELSE 0 END) AS skips_recent
      FROM swipe_events
      WHERE ts_ms >= (strftime('%s','now')*1000 - 14*24*60*60*1000)
      GROUP BY movie_id
    )
    SELECT
      m.movie_id,
      m.title,
      m.year,
      m.poster_url,
      COALESCE(r.likes_recent, 0) AS likes_recent,
      COALESCE(r.skips_recent, 0) AS skips_recent,
      'cf_neighbors' AS source,
      n.cf_score AS cf_score
    FROM neighbors n
    JOIN movies m ON m.movie_id = n.movie_id
    LEFT JOIN recent r ON r.movie_id = m.movie_id
    WHERE m.movie_id NOT IN (SELECT movie_id FROM seen)
    ORDER BY n.cf_score DESC
    LIMIT ${limitPlaceholder};`;

  const stmt = env.DB.prepare(sql);
  const bound = stmt.bind(sessionId, modelVersion, ...likedIds, safeLimit);
  const res = await bound.all<TwoStageCandidate>();

  return (res.results ?? []).map((row) => ({
    ...row,
    likes_recent: Number(row.likes_recent ?? 0),
    skips_recent: Number(row.skips_recent ?? 0),
    cf_score: Number(row.cf_score ?? 0),
  }));
}

export async function getUserGenrePrefs(env: Env, sessionId: string) {
  const r = await env.DB.prepare(
    `SELECT
         mg.genre_id AS genre_id,
         SUM(CASE WHEN se.action = 'like' THEN 1 ELSE -1 END) AS score
       FROM swipe_events se
       JOIN movie_genres mg ON mg.movie_id = se.movie_id
       WHERE se.session_id = ?1
       GROUP BY mg.genre_id`,
  )
    .bind(sessionId)
    .all<{ genre_id: number; score: number }>();

  const prefs = new Map<number, number>();
  for (const row of r.results ?? []) prefs.set(row.genre_id, row.score);
  return prefs;
}

export async function recordImpressions(
  env: Env,
  rows: {
    impression_id: string;
    deck_id: string;
    session_id: string;
    movie_id: string;
    rank: number;
    reason_code: string;
    ts_ms: number;
    model_version?: string | null;
    score?: number | null;
    request_id?: string;
  }[],
) {
  const stmts = rows.map((r) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO recommendation_impressions(
          impression_id, deck_id, session_id, movie_id, rank, reason_code, model_version, score, ts_ms, request_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    ).bind(
      r.impression_id,
      r.deck_id,
      r.session_id,
      r.movie_id,
      r.rank,
      r.reason_code,
      r.model_version ?? null,
      r.score ?? null,
      r.ts_ms,
      r.request_id ?? null,
    ),
  );

  if (stmts.length > 0) await env.DB.batch(stmts);
  return { inserted: stmts.length };
}

export async function recordSwipe(
  env: Env,
  args: {
    event_id: string;
    session_id: string;
    deck_id: string;
    movie_id: string;
    action: SwipeAction;
    ts_ms: number;
    dwell_ms?: number | null;
    request_id?: string;
  },
) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO swipe_events(
         event_id, session_id, deck_id, movie_id, action, ts_ms, dwell_ms, request_id
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      args.event_id,
      args.session_id,
      args.deck_id,
      args.movie_id,
      args.action,
      args.ts_ms,
      args.dwell_ms ?? null,
      args.request_id ?? null,
    )
    .run();
}

export async function getProfileSummary(env: Env, sessionId: string) {
  const counts = await env.DB.prepare(
    `SELECT action, COUNT(*) AS c
       FROM swipe_events
       WHERE session_id = ?1
       GROUP BY action`,
  )
    .bind(sessionId)
    .all<{ action: SwipeAction; c: number }>();

  let likes = 0;
  let skips = 0;
  for (const row of counts.results ?? []) {
    if (row.action === "like") likes = row.c;
    if (row.action === "skip") skips = row.c;
  }

  const topGenres = await env.DB.prepare(
    `SELECT
         g.genre_id AS genre_id,
         g.name AS name,
         SUM(CASE WHEN se.action = 'like' THEN 1 ELSE 0 END) AS likes,
         SUM(CASE WHEN se.action = 'skip' THEN 1 ELSE 0 END) AS skips,
         (SUM(CASE WHEN se.action = 'like' THEN 1 ELSE 0 END) - SUM(CASE WHEN se.action = 'skip' THEN 1 ELSE 0 END)) AS net
       FROM swipe_events se
       JOIN movie_genres mg ON mg.movie_id = se.movie_id
       JOIN tmdb_genres g ON g.genre_id = mg.genre_id
       WHERE se.session_id = ?1
       GROUP BY g.genre_id
       ORDER BY net DESC, likes DESC
       LIMIT 10`,
  )
    .bind(sessionId)
    .all<{ genre_id: number; name: string; likes: number; skips: number; net: number }>();

  const recent = await env.DB.prepare(
    `SELECT
         se.event_id AS event_id,
         se.action AS action,
         se.ts_ms AS ts_ms,
         m.movie_id AS movie_id,
         m.title AS title,
         m.year AS year,
         m.poster_url AS poster_url
       FROM swipe_events se
       JOIN movies m ON m.movie_id = se.movie_id
       WHERE se.session_id = ?1
       ORDER BY se.ts_ms DESC
       LIMIT 20`,
  )
    .bind(sessionId)
    .all<{
      event_id: string;
      action: SwipeAction;
      ts_ms: number;
      movie_id: string;
      title: string;
      year: number | null;
      poster_url: string | null;
    }>();

  const movieIds = (recent.results ?? []).map((r) => r.movie_id);
  const genreMap = await getGenreNamesForMovies(env, movieIds);

  const recentWithGenres = (recent.results ?? []).map((r) => ({
    ...r,
    genres: genreMap.get(r.movie_id) ?? [],
  }));

  return {
    likes,
    skips,
    total: likes + skips,
    top_genres: topGenres.results ?? [],
    recent: recentWithGenres,
  };
}
