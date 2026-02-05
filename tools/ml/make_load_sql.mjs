import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function esc(s) {
  return String(s).replaceAll("'", "''");
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
const modelDir = String(args.model || "");
const outFile = String(args.out || "");
const setCurrent = Boolean(args["set-current"]);

if (!modelDir) throw new Error("--model is required");
if (!outFile) throw new Error("--out is required");

const model = readJson(path.join(modelDir, "model.json"));
const neighbors = readJson(path.join(modelDir, "neighbors.json"));
const metrics = fs.existsSync(path.join(modelDir, "metrics.json"))
  ? readJson(path.join(modelDir, "metrics.json"))
  : null;

const mv = model.model_version;
const snapshotId = model.snapshot_id;
const algo = model.algo;
const paramsJson = JSON.stringify(model.params ?? {});
const metricsJson = metrics ? JSON.stringify(metrics.eval ?? metrics) : null;

let sql = "BEGIN;\n";

// Upsert model registry
sql += `INSERT OR REPLACE INTO model_versions(model_version, created_at_ms, snapshot_id, algo, params_json, metrics_json, notes) VALUES (`;
sql += `'${esc(mv)}', ${Number(model.created_at_ms ?? Date.now())}, '${esc(snapshotId)}', '${esc(algo)}', '${esc(paramsJson)}', `;
sql += metricsJson == null ? "NULL" : `'${esc(metricsJson)}'`;
sql += `, 'loaded_by_tools_ml_make_load_sql');\n`;

// Replace neighbor rows for this model version
sql += `DELETE FROM cf_item_neighbors WHERE model_version='${esc(mv)}';\n`;

// Insert neighbors
for (const r of neighbors) {
  const a = esc(r.movie_id);
  const b = esc(r.neighbor_movie_id);
  const score = Number(r.score);
  if (!Number.isFinite(score)) continue;
  sql += `INSERT INTO cf_item_neighbors(model_version, movie_id, neighbor_movie_id, score) VALUES ('${esc(mv)}','${a}','${b}',${score});\n`;
}

if (setCurrent) {
  sql += `INSERT OR REPLACE INTO app_meta(key,value) VALUES ('current_model_version','${esc(mv)}');\n`;
}

sql += "COMMIT;\n";

mkdirp(path.dirname(outFile));
fs.writeFileSync(outFile, sql);
console.log(
  JSON.stringify(
    { ok: true, out_file: outFile, rows: neighbors.length, set_current: setCurrent },
    null,
    2,
  ),
);
