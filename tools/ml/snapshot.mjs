import fs from "node:fs";
import path from "node:path";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readWranglerJson(p) {
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf8");
  const obj = JSON.parse(raw);
  if (Array.isArray(obj)) return obj;
  if (obj?.result?.[0]?.results) return obj.result[0].results;
  if (obj?.results) return obj.results;
  return [];
}

function writeJson(p, v) {
  mkdirp(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    out[k] = v;
  }
  return out;
}

const args = parseArgs(process.argv);
const snapshotId = String(args.snapshot || "").trim();
const rawDir = String(args.raw || "artifacts/ml/raw");
const outRoot = String(args.out || "artifacts/ml/snapshots");

if (!snapshotId) {
  console.error("--snapshot is required (example: 2025-12-30)");
  process.exit(1);
}

const swipes = readWranglerJson(path.join(rawDir, "swipe_events.json"));
const movies = readWranglerJson(path.join(rawDir, "movies.json"));
const movieGenres = readWranglerJson(path.join(rawDir, "movie_genres.json"));
const tmdbGenres = readWranglerJson(path.join(rawDir, "tmdb_genres.json"));

const outDir = path.join(outRoot, snapshotId);
mkdirp(outDir);

writeJson(path.join(outDir, "swipe_events.json"), swipes);
writeJson(path.join(outDir, "movies.json"), movies);
writeJson(path.join(outDir, "movie_genres.json"), movieGenres);
writeJson(path.join(outDir, "tmdb_genres.json"), tmdbGenres);

const manifest = {
  snapshot_id: snapshotId,
  created_at: new Date().toISOString(),
  counts: {
    swipe_events: swipes.length,
    movies: movies.length,
    movie_genres: movieGenres.length,
    tmdb_genres: tmdbGenres.length,
  },
  files: ["swipe_events.json", "movies.json", "movie_genres.json", "tmdb_genres.json"],
};

writeJson(path.join(outDir, "manifest.json"), manifest);
console.log(JSON.stringify({ ok: true, out_dir: outDir, manifest }, null, 2));
