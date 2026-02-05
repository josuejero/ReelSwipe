import type { Env } from "../types";

const TMDB_BASE = "https://api.themoviedb.org";

export type TmdbMovie = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
};

export type TmdbGenre = {
  id: number;
  name: string;
};

type TmdbPaged<T> = {
  page: number;
  results: T[];
};

type TmdbGenreList = {
  genres: TmdbGenre[];
};

function assertKey(env: Env) {
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY is missing");
}

export function tmdbPosterUrl(posterPath?: string | null) {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/w500${posterPath}`;
}

export function releaseYear(releaseDate?: string) {
  if (!releaseDate) return null;
  const y = Number(releaseDate.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

async function fetchTmdbJson<T>(
  env: Env,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  assertKey(env);

  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", env.TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TMDb ${res.status} ${res.statusText}: ${body}`);
  }

  return (await res.json()) as T;
}

export async function fetchPopular(env: Env, page = 1) {
  return fetchTmdbJson<TmdbPaged<TmdbMovie>>(env, "/3/movie/popular", { page });
}

export async function fetchTrendingWeek(env: Env) {
  return fetchTmdbJson<TmdbPaged<TmdbMovie>>(env, "/3/trending/movie/week");
}

export async function fetchMovieGenres(env: Env) {
  return fetchTmdbJson<TmdbGenreList>(env, "/3/genre/movie/list", { language: "en-US" });
}
