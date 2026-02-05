import type { Env } from "../types";
import { fetchMovieGenres, fetchTrendingWeek, releaseYear, tmdbPosterUrl } from "./tmdb";
import { rebuildMovieGenresForMovies, upsertGenres, upsertMovies } from "./db";

export async function syncGenres(env: Env) {
  if (!env.TMDB_API_KEY) return { upserted: 0 };

  const { genres } = await fetchMovieGenres(env);
  const rows = genres.map((g) => ({ genre_id: g.id, name: g.name }));
  return upsertGenres(env, rows);
}

export async function syncTrendingMovies(env: Env) {
  if (!env.TMDB_API_KEY) return { upserted: 0 };

  const data = await fetchTrendingWeek(env);
  if (!Array.isArray(data.results) || data.results.length === 0) {
    return { upserted: 0 };
  }

  const now = Date.now();
  const movies = data.results.map((m) => ({
    movie_id: String(m.id),
    tmdb_id: m.id,
    title: m.title,
    year: releaseYear(m.release_date),
    poster_url: tmdbPosterUrl(m.poster_path),
    genres_json: JSON.stringify(m.genre_ids ?? []),
    source: "tmdb_trending_week",
  }));

  const result = await upsertMovies(env, movies, now);
  await rebuildMovieGenresForMovies(
    env,
    movies.map((m) => m.movie_id),
  );

  return result;
}
