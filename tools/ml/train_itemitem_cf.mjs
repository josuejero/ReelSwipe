import fs from "node:fs";
import path from "node:path";
import { checkSnapshotEvents } from "./data-quality.mjs";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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
const snapshotDir = String(args.snapshot || "");
const outDir = String(args.out || "");
const modelVersion = String(args["model-version"] || "");
const k = Number(args.k ?? 30);
const minCo = Number(args["min-co"] ?? 2);

if (!snapshotDir) throw new Error("--snapshot is required");
if (!outDir) throw new Error("--out is required");
if (!modelVersion) throw new Error("--model-version is required");

checkSnapshotEvents(snapshotDir);

const swipes = readJson(path.join(snapshotDir, "swipe_events.json"));
const manifest = readJson(path.join(snapshotDir, "manifest.json"));

// Build: session -> ordered likes
const likesBySession = new Map();
for (const s of swipes) {
  if (s.action !== "like") continue;
  const sid = String(s.session_id);
  const arr = likesBySession.get(sid) ?? [];
  arr.push({ movie_id: String(s.movie_id), ts_ms: Number(s.ts_ms ?? 0) });
  likesBySession.set(sid, arr);
}
for (const [sid, arr] of likesBySession.entries()) {
  arr.sort((a, b) => a.ts_ms - b.ts_ms);
  // de-dupe within session
  const seen = new Set();
  const dedup = [];
  for (const x of arr) {
    if (seen.has(x.movie_id)) continue;
    seen.add(x.movie_id);
    dedup.push(x);
  }
  likesBySession.set(sid, dedup);
}

// Count: movie -> #sessions liked
const sessionsPerMovie = new Map();
for (const arr of likesBySession.values()) {
  for (const x of arr)
    sessionsPerMovie.set(x.movie_id, (sessionsPerMovie.get(x.movie_id) ?? 0) + 1);
}

// Co-occurrence counts: movie -> (neighbor -> coCount)
const co = new Map();
function inc(a, b) {
  let m = co.get(a);
  if (!m) {
    m = new Map();
    co.set(a, m);
  }
  m.set(b, (m.get(b) ?? 0) + 1);
}

for (const arr of likesBySession.values()) {
  const ids = arr.map((x) => x.movie_id);
  // guard: avoid O(n^2) blowups
  const capped = ids.slice(0, 30);
  for (let i = 0; i < capped.length; i++) {
    for (let j = i + 1; j < capped.length; j++) {
      const a = capped[i];
      const b = capped[j];
      inc(a, b);
      inc(b, a);
    }
  }
}

// Similarity: cosine with shrinkage
const shrink = 10; // reduces noise from tiny co-counts

const neighbors = [];
for (const [a, m] of co.entries()) {
  const ca = sessionsPerMovie.get(a) ?? 1;
  const scored = [];
  for (const [b, coCount] of m.entries()) {
    if (coCount < minCo) continue;
    const cb = sessionsPerMovie.get(b) ?? 1;
    const cosine = coCount / Math.sqrt(ca * cb);
    const s = cosine * (coCount / (coCount + shrink));
    scored.push({ neighbor_movie_id: b, score: s, co: coCount });
  }
  scored.sort((x, y) => y.score - x.score);
  for (const x of scored.slice(0, k)) {
    neighbors.push({ movie_id: a, neighbor_movie_id: x.neighbor_movie_id, score: x.score });
  }
}

mkdirp(outDir);

const model = {
  model_version: modelVersion,
  snapshot_id: manifest.snapshot_id,
  algo: "item_item_cf_cosine_shrink",
  created_at_ms: Date.now(),
  params: { k, minCo, shrink, sessionLikeCap: 30 },
  stats: {
    sessions_with_likes: likesBySession.size,
    movies_with_neighbors: new Set(neighbors.map((r) => r.movie_id)).size,
    neighbor_rows: neighbors.length,
  },
};

writeJson(path.join(outDir, "model.json"), model);
writeJson(path.join(outDir, "neighbors.json"), neighbors);

console.log(JSON.stringify({ ok: true, out_dir: outDir, model }, null, 2));
