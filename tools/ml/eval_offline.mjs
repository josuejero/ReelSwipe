import fs from "node:fs";
import path from "node:path";
import { checkSnapshotEvents } from "./data-quality.mjs";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeFile(p, s) {
  mkdirp(path.dirname(p));
  fs.writeFileSync(p, s);
}

function writeJson(p, v) {
  writeFile(p, JSON.stringify(v, null, 2));
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

function dcg(rels) {
  let s = 0;
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const denom = Math.log2(i + 2);
    s += rel / denom;
  }
  return s;
}

function ndcgAtK(rankedIds, truthSet, k) {
  const rels = rankedIds.slice(0, k).map((id) => (truthSet.has(id) ? 1 : 0));
  const ideal = Array.from({ length: Math.min(k, truthSet.size) }, () => 1);
  const denom = dcg(ideal);
  if (denom <= 0) return 0;
  return dcg(rels) / denom;
}

function apAtK(rankedIds, truthSet, k) {
  let hits = 0;
  let sumPrec = 0;
  const top = rankedIds.slice(0, k);
  for (let i = 0; i < top.length; i++) {
    if (truthSet.has(top[i])) {
      hits += 1;
      sumPrec += hits / (i + 1);
    }
  }
  const denom = Math.min(truthSet.size, k);
  return denom ? sumPrec / denom : 0;
}

const args = parseArgs(process.argv);
const snapshotDir = String(args.snapshot || "");
const modelDir = String(args.model || "");
const outDir = String(args.out || modelDir || "");

if (!snapshotDir) throw new Error("--snapshot is required");
if (!modelDir) throw new Error("--model is required");
if (!outDir) throw new Error("--out is required");

checkSnapshotEvents(snapshotDir);
const swipes = readJson(path.join(snapshotDir, "swipe_events.json"));
const model = readJson(path.join(modelDir, "model.json"));
const neighbors = readJson(path.join(modelDir, "neighbors.json"));

// Build neighbor map
const neighMap = new Map();
for (const r of neighbors) {
  const a = String(r.movie_id);
  const arr = neighMap.get(a) ?? [];
  arr.push({ id: String(r.neighbor_movie_id), score: Number(r.score) });
  neighMap.set(a, arr);
}

// Build ordered likes per session
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
  const seen = new Set();
  const dedup = [];
  for (const x of arr) {
    if (seen.has(x.movie_id)) continue;
    seen.add(x.movie_id);
    dedup.push(x);
  }
  likesBySession.set(sid, dedup);
}

// Offline split + eval
const K = 10;
let nSessions = 0;
let sumNdcg = 0;
let sumMap = 0;
let sumRecall = 0;

for (const arr of likesBySession.values()) {
  if (arr.length < 3) continue;

  const cut = Math.max(1, Math.floor(arr.length * 0.6));
  const history = arr.slice(0, cut).map((x) => x.movie_id);
  const holdout = arr.slice(cut).map((x) => x.movie_id);
  if (!holdout.length) continue;

  // Score candidates by summing neighbor scores from history
  const scores = new Map();
  for (const h of history) {
    const ns = neighMap.get(h) ?? [];
    for (const n of ns) {
      if (history.includes(n.id)) continue;
      scores.set(n.id, (scores.get(n.id) ?? 0) + n.score);
    }
  }

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map((x) => x[0]);

  const truth = new Set(holdout);

  const ndcg = ndcgAtK(ranked, truth, K);
  const map = apAtK(ranked, truth, K);

  let hits = 0;
  for (const id of ranked.slice(0, K)) if (truth.has(id)) hits++;
  const recall = truth.size ? hits / truth.size : 0;

  nSessions++;
  sumNdcg += ndcg;
  sumMap += map;
  sumRecall += recall;
}

const metrics = {
  model_version: model.model_version,
  snapshot_id: model.snapshot_id,
  evaluated_at_ms: Date.now(),
  eval: {
    k: K,
    sessions: nSessions,
    ndcg_at_10: nSessions ? sumNdcg / nSessions : 0,
    map_at_10: nSessions ? sumMap / nSessions : 0,
    recall_at_10: nSessions ? sumRecall / nSessions : 0,
  },
};

// Tiny ASCII bar chart
function bar(x) {
  const n = Math.max(0, Math.min(20, Math.round(x * 20)));
  return "█".repeat(n) + "░".repeat(20 - n);
}

const report =
  `# Phase 6 Offline Evaluation Report\n\n` +
  `**Model:** ${metrics.model_version}  \n` +
  `**Snapshot:** ${metrics.snapshot_id}  \n` +
  `**Sessions evaluated:** ${metrics.eval.sessions}  \n\n` +
  `## Metrics (k=${metrics.eval.k})\n\n` +
  `| Metric | Value | Plot |\n` +
  `|---|---:|---|\n` +
  `| NDCG@10 | ${metrics.eval.ndcg_at_10.toFixed(4)} | ${bar(metrics.eval.ndcg_at_10)} |\n` +
  `| MAP@10 | ${metrics.eval.map_at_10.toFixed(4)} | ${bar(metrics.eval.map_at_10)} |\n` +
  `| Recall@10 | ${metrics.eval.recall_at_10.toFixed(4)} | ${bar(metrics.eval.recall_at_10)} |\n\n` +
  `## Notes\n` +
  `- This is an offline split inside each demo session.\n` +
  `- Scores are based on summed neighbor similarities from historical likes.\n` +
  `- If metrics are unstable, collect more sessions with 5+ likes each.\n`;

mkdirp(outDir);
writeJson(path.join(outDir, "metrics.json"), metrics);
writeFile(path.join(outDir, "report.md"), report);

console.log(JSON.stringify({ ok: true, out_dir: outDir, metrics }, null, 2));
