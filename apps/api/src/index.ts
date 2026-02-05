import type { Env } from "./types";
import { json, withCors } from "./lib/http";
import {
  countMovies,
  getCandidateMoviesForDeck,
  getCurrentModelVersion,
  getGenreIdsForMovies,
  getGenreNamesForMovies,
  getMetrics24h,
  getPhase,
  getProfileSummary,
  getUserGenrePrefs,
  getTwoStageCandidates,
  getCFCandidates,
  modelVersionExists,
  pruneRequestLogs,
  recordImpressions,
  recordRequestLog,
  recordSwipe,
  setCurrentModelVersion,
  type SwipeAction,
} from "./lib/db";
import { rerankTwoStage, RankedMovie, TwoStageCandidate } from "./lib/ranker";
import { log } from "./lib/log";
import { syncGenres, syncTrendingMovies } from "./lib/sync";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ok<T extends Record<string, unknown>>(payload: T, reqId: string) {
  return json({ ok: true, request_id: reqId, ...payload });
}

function badRequest(message: string, reqId: string, extra: Record<string, unknown> = {}) {
  return json({ ok: false, request_id: reqId, error: { message, ...extra } }, 400);
}

function unauthorized(reqId: string) {
  return json({ ok: false, request_id: reqId, error: { message: "unauthorized" } }, 401);
}

function getAdminToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const x = req.headers.get("x-admin-token");
  if (x) return x.trim();
  return null;
}

async function requireAdmin(req: Request, env: Env) {
  const token = getAdminToken(req);
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}

function routeKey(method: string, pathname: string) {
  if (pathname.startsWith("/v1/admin")) return `${method} /v1/admin/*`;
  if (pathname.startsWith("/v1/events")) return `${method} /v1/events/*`;
  if (pathname.startsWith("/v1")) return `${method} ${pathname}`;
  return `${method} ${pathname}`;
}

function withRequestId(res: Response, reqId: string) {
  const headers = new Headers(res.headers);
  headers.set("x-request-id", reqId);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function shouldLogRequest(env: Env): boolean {
  const raw = env.LOG_SAMPLE_RATE ?? "1";
  const rate = Number(raw);
  if (!Number.isFinite(rate)) return true;
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

async function buildDeck(env: Env, sessionId: string, limit: number, reqId: string) {
  const now = Date.now();
  const mode = (env.RANKER_MODE ?? "two_stage") as "two_stage" | "baseline";

  if (mode === "baseline") {
    const candidates = await getCandidateMoviesForDeck(env, sessionId, limit);
    if (candidates.length === 0)
      return {
        deck_id: null as string | null,
        deck: [] as any[],
        reason: "no candidates",
        model_version: "baseline_v1",
      };

    const movieIds = candidates.map((c) => c.movie_id);
    const nameMap = await getGenreNamesForMovies(env, movieIds);
    const idMap = await getGenreIdsForMovies(env, movieIds);
    const prefs = await getUserGenrePrefs(env, sessionId);

    const denom = Math.max(1, ...Array.from(prefs.values()).map((v) => Math.abs(v)));

    const scored: RankedMovie[] = candidates.map((c) => {
      const gids = idMap.get(c.movie_id) ?? [];
      const pref =
        gids.length > 0 ? gids.reduce((sum, id) => sum + (prefs.get(id) ?? 0), 0) / gids.length : 0;

      const total = c.likes + c.skips;
      const pop = ((c.likes + 1) / (total + 2)) * Math.log1p(total);
      const score = 0.75 * pop + 0.25 * (pref / denom);

      return {
        id: c.movie_id,
        title: c.title,
        year: c.year,
        posterUrl: c.poster_url,
        genres: nameMap.get(c.movie_id) ?? [],
        reasonCode: "baseline_mix",
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const deck = scored.slice(0, limit);

    const deckId = crypto.randomUUID();
    const modelVersion = "baseline_v1";

    await recordImpressions(
      env,
      deck.map((m, i) => ({
        impression_id: crypto.randomUUID(),
        deck_id: deckId,
        session_id: sessionId,
        movie_id: m.id,
        rank: i + 1,
        reason_code: m.reasonCode,
        model_version: modelVersion,
        score: m.score,
        ts_ms: now,
        request_id: reqId,
      })),
    );

    return { deck_id: deckId, deck, model_version: modelVersion };
  }

  const modelVersion = await getCurrentModelVersion(env);
  const cfCandidates = await getCFCandidates(env, {
    sessionId,
    modelVersion,
    limit: 200,
  });

  const baseCandidates = await getTwoStageCandidates(env, {
    sessionId,
    nowMs: now,
    windowMs: 14 * 86400_000,
    limit: Math.max(220, limit * 10),
    topGenres: 5,
  });

  if (cfCandidates.length === 0 && baseCandidates.length === 0) {
    return {
      deck_id: null as string | null,
      deck: [] as any[],
      reason: "no candidates",
      model_version: modelVersion,
    };
  }

  const byId = new Map<string, TwoStageCandidate>();
  for (const candidate of [...cfCandidates, ...baseCandidates]) {
    const prev = byId.get(candidate.movie_id);
    if (!prev) {
      byId.set(candidate.movie_id, candidate);
      continue;
    }
    byId.set(candidate.movie_id, {
      ...prev,
      likes_recent: Math.max(prev.likes_recent ?? 0, candidate.likes_recent ?? 0),
      skips_recent: Math.max(prev.skips_recent ?? 0, candidate.skips_recent ?? 0),
      cf_score: Math.max(prev.cf_score ?? 0, candidate.cf_score ?? 0),
      source: prev.source === "cf_neighbors" ? prev.source : candidate.source,
    });
  }

  const candidates = Array.from(byId.values());
  const movieIds = candidates.map((c) => c.movie_id);
  const nameMap = await getGenreNamesForMovies(env, movieIds);
  const idMap = await getGenreIdsForMovies(env, movieIds);
  const prefs = await getUserGenrePrefs(env, sessionId);

  const ranked = rerankTwoStage({
    candidates,
    genreNamesByMovieId: nameMap,
    genreIdsByMovieId: idMap,
    prefs,
    limit,
  });

  const deckId = crypto.randomUUID();

  await recordImpressions(
    env,
    ranked.map((m, i) => ({
      impression_id: crypto.randomUUID(),
      deck_id: deckId,
      session_id: sessionId,
      movie_id: m.id,
      rank: i + 1,
      reason_code: m.reasonCode,
      model_version: modelVersion,
      score: m.score,
      ts_ms: now,
      request_id: reqId,
    })),
  );

  return { deck_id: deckId, deck: ranked, model_version: modelVersion };
}

async function handle(req: Request, env: Env, reqId: string, origin: string) {
  if (req.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), origin);
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/health") {
    const phase = await getPhase(env);
    return withCors(ok({ phase }, reqId), origin);
  }

  if (req.method === "GET" && pathname === "/v1/deck") {
    const sessionId = url.searchParams.get("session_id");
    const limit = clamp(Number(url.searchParams.get("limit") || "20"), 1, 50);
    if (!sessionId) return withCors(badRequest("session_id is required", reqId), origin);

    const payload = await buildDeck(env, sessionId, limit, reqId);
    return withCors(json(payload, 200), origin);
  }

  if (req.method === "GET" && pathname === "/v1/profile") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return withCors(badRequest("session_id is required", reqId), origin);

    const profile = await getProfileSummary(env, sessionId);
    return withCors(json({ session_id: sessionId, ...profile }, 200), origin);
  }

  if (req.method === "GET" && pathname === "/v1/metrics") {
    if (!(await requireAdmin(req, env))) {
      return withCors(unauthorized(reqId), origin);
    }

    const raw = url.searchParams.get("window") ?? "24h";
    const match = raw.match(/^([0-9]{1,3})h$/);
    const hours = match ? Math.max(1, Math.min(72, Number(match[1]))) : 24;
    const windowMs = hours * 60 * 60 * 1000;

    const data = await getMetrics24h(env.DB, windowMs);
    const resp = withCors(ok(data, reqId), origin);
    resp.headers.set("cache-control", "no-store");
    return resp;
  }

  if (req.method === "POST" && pathname === "/v1/events/swipe") {
    const idem = req.headers.get("x-idempotency-key") || crypto.randomUUID();
    const body = (await req.json().catch(() => null)) as any;

    if (!body?.session_id) return withCors(badRequest("session_id is required", reqId), origin);
    if (!body?.deck_id) return withCors(badRequest("deck_id is required", reqId), origin);
    if (!body?.movie_id) return withCors(badRequest("movie_id is required", reqId), origin);
    if (body?.action !== "like" && body?.action !== "skip")
      return withCors(badRequest("action must be like|skip", reqId), origin);

    await recordSwipe(env, {
      event_id: String(idem),
      session_id: String(body.session_id),
      deck_id: String(body.deck_id),
      movie_id: String(body.movie_id),
      action: body.action as SwipeAction,
      ts_ms: Number(body.ts_ms || Date.now()),
      dwell_ms: body.dwell_ms == null ? null : Number(body.dwell_ms),
      request_id: reqId,
    });

    return withCors(ok({}, reqId), origin);
  }

  if (req.method === "POST" && pathname === "/v1/admin/tmdb/sync-genres") {
    if (!(await requireAdmin(req, env))) return withCors(unauthorized(reqId), origin);
    const res = await syncGenres(env);
    return withCors(ok({ genres: res }, reqId), origin);
  }

  if (req.method === "POST" && pathname === "/v1/admin/tmdb/sync") {
    if (!(await requireAdmin(req, env))) return withCors(unauthorized(reqId), origin);

    try {
      await syncGenres(env);
    } catch (e) {
      console.log({ level: "warn", req_id: reqId, msg: "genre sync failed", err: String(e) });
    }

    const res = await syncTrendingMovies(env);
    return withCors(ok({ movies: res }, reqId), origin);
  }

  if (req.method === "GET" && pathname === "/v1/admin/model") {
    if (!(await requireAdmin(req, env))) return withCors(unauthorized(reqId), origin);

    const current = await getCurrentModelVersion(env);
    const known = await env.DB
      .prepare(
        `SELECT model_version, snapshot_id, algo, created_at_ms
           FROM model_versions
          ORDER BY created_at_ms DESC
          LIMIT 25`,
      )
      .all<{
        model_version: string;
        snapshot_id: string;
        algo: string;
        created_at_ms: number;
      }>();

    return withCors(
      ok({ current_model_version: current, known_models: known.results ?? [] }, reqId),
      origin,
    );
  }

  if (req.method === "POST" && pathname === "/v1/admin/model") {
    if (!(await requireAdmin(req, env))) return withCors(unauthorized(reqId), origin);

    const body = (await req.json().catch(() => null)) as { model_version?: string } | null;
    const mv = String(body?.model_version ?? "").trim();
    if (!mv) return withCors(badRequest("model_version is required", reqId), origin);
    if (!(await modelVersionExists(env, mv)))
      return withCors(badRequest("unknown model_version", reqId), origin);

    await setCurrentModelVersion(env, mv);
    return withCors(ok({ current_model_version: mv }, reqId), origin);
  }

  return withCors(
    json({ ok: false, request_id: reqId, error: { message: "not found" } }, 404),
    origin,
  );
}

function retentionDays(env: Env): number {
  const raw = env.REQUEST_LOG_RETENTION_DAYS ?? "14";
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return 14;
  return days;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const start = Date.now();
    const url = new URL(req.url);
    const origin = env.CORS_ORIGIN || "*";
    const route = routeKey(req.method, url.pathname);
    const reqId = req.headers.get("x-request-id") || crypto.randomUUID();

    let res: Response;
    let errorMessage: string | undefined;

    try {
      res = await handle(req, env, reqId, origin);
    } catch (e: unknown) {
      errorMessage = e instanceof Error ? e.message : String(e);
      res = withCors(
        json({ ok: false, request_id: reqId, error: { message: "internal error" } }, 500),
        origin,
      );
    }

    const durMs = Date.now() - start;
    const status = res.status;

    const logFields: Record<string, unknown> = {
      req_id: reqId,
      route,
      method: req.method,
      path: url.pathname,
      status,
      dur_ms: durMs,
    };

    if (errorMessage) logFields.error = errorMessage;

    log(errorMessage ? "error" : "info", logFields);

    if (env.DB && url.pathname !== "/health" && shouldLogRequest(env)) {
      ctx.waitUntil(
        recordRequestLog(env.DB, {
          req_id: reqId,
          route,
          method: req.method,
          path: url.pathname,
          status,
          dur_ms: durMs,
          ts_ms: Date.now(),
        }),
      );
    }

    return withRequestId(res, reqId);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const cutoff = Date.now() - retentionDays(env) * 24 * 60 * 60 * 1000;

    ctx.waitUntil(
      (async () => {
        try {
          await syncTrendingMovies(env);
        } catch (err) {
          console.warn("[scheduled] syncTrendingMovies failed", err);
        }
      })(),
    );

    ctx.waitUntil(
      (async () => {
        try {
          await pruneRequestLogs(env.DB, cutoff);
        } catch (err) {
          console.warn("[scheduled] pruneRequestLogs failed", err);
        }
      })(),
    );

    ctx.waitUntil(
      (async () => {
        try {
          const total = await countMovies(env.DB);
          console.info(`[scheduled] movies count=${total}`);
        } catch (err) {
          console.warn("[scheduled] countMovies failed", err);
        }
      })(),
    );
  },
};
