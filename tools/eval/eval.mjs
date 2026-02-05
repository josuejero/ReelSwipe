import fs from "node:fs";
import path from "node:path";

function writeFile(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
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

function dcg(labels) {
  let s = 0;
  for (let i = 0; i < labels.length; i++) {
    const rel = labels[i];
    const denom = Math.log2(i + 2);
    s += (Math.pow(2, rel) - 1) / denom;
  }
  return s;
}

function ndcgAtK(labels, k) {
  const top = labels.slice(0, k);
  const ideal = [...labels].sort((a, b) => b - a).slice(0, k);
  const idcg = dcg(ideal);
  if (idcg <= 0) return 0;
  return dcg(top) / idcg;
}

function averagePrecisionAtK(labels, k) {
  let hits = 0;
  let sumPrec = 0;
  const top = labels.slice(0, k);
  for (let i = 0; i < top.length; i++) {
    if (top[i] > 0) {
      hits += 1;
      sumPrec += hits / (i + 1);
    }
  }
  const denom = Math.max(1, labels.filter((x) => x > 0).length);
  return sumPrec / denom;
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function computeReport(rows, k = 10) {
  const decks = groupBy(rows, (r) => `${r.model_version ?? "unknown"}::${r.deck_id}`);

  const perDeck = [];
  const seenMovies = new Set();

  for (const [deckKey, items] of decks.entries()) {
    items.sort((a, b) => a.rank - b.rank);
    const labels = items.map((x) => Number(x.label ?? 0));

    perDeck.push({
      deckKey,
      modelVersion: items[0]?.model_version ?? "unknown",
      ndcg: ndcgAtK(labels, k),
      map: averagePrecisionAtK(labels, k),
      impressions: items.length,
      positives: labels.filter((x) => x > 0).length,
    });

    for (const it of items) seenMovies.add(it.movie_id);
  }

  const byModel = groupBy(perDeck, (d) => d.modelVersion);

  const models = [];
  for (const [mv, ds] of byModel.entries()) {
    const ndcgs = ds.map((d) => d.ndcg);
    const maps = ds.map((d) => d.map);
    const imps = ds.reduce((s, d) => s + d.impressions, 0);
    models.push({
      model_version: mv,
      decks: ds.length,
      impressions: imps,
      ndcg_at_10: mean(ndcgs),
      map_at_10: mean(maps),
    });
  }

  const coverage = {
    unique_movies: seenMovies.size,
    total_impressions: rows.length,
    unique_movie_rate: rows.length ? seenMovies.size / rows.length : 0,
  };

  models.sort((a, b) => b.ndcg_at_10 - a.ndcg_at_10);

  return { k, models, coverage, perDeckSample: perDeck.slice(0, 10) };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# ReelSwipe Offline Evaluation`);
  lines.push(`Interpret these as sanity metrics. Use them to compare model versions, not to claim truth.`);
  lines.push("");

  lines.push(`## Summary (k=${report.k})`);
  lines.push("");
  lines.push(`| model_version | decks | impressions | NDCG@10 | MAP@10 |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const m of report.models) {
    lines.push(`| ${m.model_version} | ${m.decks} | ${m.impressions} | ${m.ndcg_at_10.toFixed(4)} | ${m.map_at_10.toFixed(4)} |`);
  }
  lines.push("");

  lines.push(`## Coverage`);
  lines.push("");
  lines.push(`- unique movies: ${report.coverage.unique_movies}`);
  lines.push(`- total impressions: ${report.coverage.total_impressions}`);
  lines.push(`- unique-movie rate: ${report.coverage.unique_movie_rate.toFixed(4)}`);
  lines.push("");

  lines.push(`## Per-deck sample (first 10)`);
  lines.push("");
  lines.push(`| deckKey | model | impressions | positives | NDCG@10 | MAP@10 |`);
  lines.push(`|---|---|---:|---:|---:|---:|`);
  for (const d of report.perDeckSample) {
    lines.push(`| ${d.deckKey} | ${d.modelVersion} | ${d.impressions} | ${d.positives} | ${d.ndcg.toFixed(4)} | ${d.map.toFixed(4)} |`);
  }

  lines.push("");
  return lines.join("\n");
}

// -------- main --------
const args = process.argv.slice(2);
const input = args.includes("--input") ? args[args.indexOf("--input") + 1] : null;
const outMd = args.includes("--out-md") ? args[args.indexOf("--out-md") + 1] : "artifacts/eval/report.md";
const outJson = args.includes("--out-json") ? args[args.indexOf("--out-json") + 1] : "artifacts/eval/report.json";

let rows;
if (input) {
  rows = readWranglerJson(input);
} else {
  rows = [
    { deck_id: "d1", rank: 1, label: 1, movie_id: "m1", model_version: "two_stage_v2" },
    { deck_id: "d1", rank: 2, label: 0, movie_id: "m2", model_version: "two_stage_v2" },
    { deck_id: "d1", rank: 3, label: 1, movie_id: "m3", model_version: "two_stage_v2" },
    { deck_id: "d2", rank: 1, label: 0, movie_id: "m4", model_version: "two_stage_v2" },
    { deck_id: "d2", rank: 2, label: 1, movie_id: "m5", model_version: "two_stage_v2" },
    { deck_id: "d2", rank: 3, label: 0, movie_id: "m6", model_version: "two_stage_v2" },

    { deck_id: "d3", rank: 1, label: 0, movie_id: "m1", model_version: "baseline_v1" },
    { deck_id: "d3", rank: 2, label: 1, movie_id: "m3", model_version: "baseline_v1" },
    { deck_id: "d3", rank: 3, label: 0, movie_id: "m2", model_version: "baseline_v1" },
  ];
}

const report = computeReport(rows, 10);
writeFile(outJson, JSON.stringify(report, null, 2));
writeFile(outMd, renderMarkdown(report));

console.log(`wrote ${outMd}`);
console.log(`wrote ${outJson}`);
