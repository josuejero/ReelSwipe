import type { DeckMovie } from "../lib/api";

export function MovieCard({ movie }: { movie: DeckMovie }) {
  return (
    <article className="relative h-[520px] w-[340px] overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/10 shadow-2xl">
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={movie.posterUrl ?? "https://placehold.co/600x900?text=No+Poster"}
          alt={movie.title}
          className="h-full w-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      </div>

      {movie.reasonCode ? (
        <div className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white/90 ring-1 ring-white/10">
          {movie.reasonCode}
        </div>
      ) : null}

      {typeof movie.score === "number" ? (
        <div className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
          {movie.score.toFixed(3)}
        </div>
      ) : null}

      <header className="absolute bottom-0 left-0 right-0 p-5">
        <h2 className="text-xl font-semibold text-white">
          {movie.title}
          {movie.year ? <span className="text-white/70"> ({movie.year})</span> : null}
        </h2>
        {movie.genres?.length ? (
          <p className="mt-1 text-sm text-white/70">{movie.genres.join(" • ")}</p>
        ) : (
          <p className="mt-1 text-sm text-white/50">&nbsp;</p>
        )}
      </header>
    </article>
  );
}
