export type RankerMode = "two_stage" | "baseline";

export type UserGenrePrefs = Map<number, number>;

export type TwoStageCandidate = {
  movie_id: string;
  title: string;
  year: number | null;
  poster_url: string | null;
  likes_recent: number;
  skips_recent: number;
  source: string | null;
  cf_score?: number;
};

export type RankedMovie = {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  reasonCode: string;
  score: number;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function popScore(likes: number, skips: number) {
  const total = likes + skips;
  const likeRate = (likes + 1) / (total + 2);
  const volume = Math.log1p(total);
  return likeRate * volume;
}

function prefScore(genreIds: number[], prefs: UserGenrePrefs) {
  if (genreIds.length === 0) return 0;
  let s = 0;
  for (const gid of genreIds) s += prefs.get(gid) ?? 0;
  return s / genreIds.length;
}

export function rerankTwoStage(args: {
  candidates: TwoStageCandidate[];
  genreNamesByMovieId: Map<string, string[]>;
  genreIdsByMovieId: Map<string, number[]>;
  prefs: UserGenrePrefs;
  limit: number;
}): RankedMovie[] {
  const { candidates, genreNamesByMovieId, genreIdsByMovieId, prefs, limit } = args;

  const popRaw = candidates.map((c) => popScore(c.likes_recent, c.skips_recent));
  const popMax = Math.max(1e-9, ...popRaw);

  const prefRaw = candidates.map((c) => {
    const gids = genreIdsByMovieId.get(c.movie_id) ?? [];
    return prefScore(gids, prefs);
  });
  const prefMaxAbs = Math.max(1e-9, ...prefRaw.map((x) => Math.abs(x)));

  const cfRaw = candidates.map((c) => (c.cf_score == null ? 0 : Number(c.cf_score)));
  const cfMax = Math.max(1e-9, ...cfRaw);

  const scored = candidates.map((c, i) => {
    const pop = popRaw[i] / popMax;
    const pref = prefRaw[i] / prefMaxAbs;
    const sourceBoost = c.source === "tmdb_trending_week" ? 0.15 : 0;
    const cf = cfRaw[i] / cfMax;
    const score =
      0.45 * clamp01(pop) + 0.25 * clamp01((pref + 1) / 2) + 0.25 * clamp01(cf) + sourceBoost;

    const reasonCode =
      c.source === "tmdb_trending_week"
        ? "hybrid_trending_week"
        : cf > 0.25
          ? "hybrid_cf"
          : pref > 0.15
            ? "hybrid_personalized"
            : "hybrid_popular_recent";

    return {
      id: c.movie_id,
      title: c.title,
      year: c.year,
      posterUrl: c.poster_url,
      genres: genreNamesByMovieId.get(c.movie_id) ?? [],
      reasonCode,
      score,
    } satisfies RankedMovie;
  });

  scored.sort((a, b) => b.score - a.score);

  const maxPerTopGenre = 4;
  const counts = new Map<string, number>();

  const out: RankedMovie[] = [];
  for (const m of scored) {
    const top = m.genres?.[0] ?? "(none)";
    const n = counts.get(top) ?? 0;
    if (n >= maxPerTopGenre) continue;
    counts.set(top, n + 1);
    out.push(m);
    if (out.length >= limit) break;
  }

  if (out.length < limit) {
    const picked = new Set(out.map((m) => m.id));
    for (const m of scored) {
      if (out.length >= limit) break;
      if (picked.has(m.id)) continue;
      out.push(m);
      picked.add(m.id);
    }
  }

  return out;
}
