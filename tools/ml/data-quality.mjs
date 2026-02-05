import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const swipeActionSet = new Set(["like", "skip"]);

const EVENT_SPECS = [
  {
    name: "swipe",
    file: "swipe_events.json",
    description: "User swipe actions (likes/skips) that feed training + eval.",
    required: true,
    uniqueKey: (row) => row.event_id,
    fields: {
      event_id: { required: true, type: "string" },
      session_id: { required: true, type: "string" },
      deck_id: { required: true, type: "string" },
      movie_id: { required: true, type: "string" },
      action: { required: true, type: "string", allowed: swipeActionSet },
      ts_ms: { required: true, type: "timestamp" },
      dwell_ms: { required: false, type: "number_or_null" },
      request_id: { required: false, type: "string_or_null" },
      anon_user_id: { required: false, type: "string_or_null" },
    },
  },
  {
    name: "impression",
    file: "recommendation_impressions.json",
    description: "Deck-served impressions for labeled eval + metrics.",
    required: false,
    uniqueKey: (row) => row.impression_id,
    fields: {
      impression_id: { required: true, type: "string" },
      deck_id: { required: true, type: "string" },
      session_id: { required: true, type: "string" },
      movie_id: { required: true, type: "string" },
      rank: { required: true, type: "number" },
      reason_code: { required: true, type: "string" },
      ts_ms: { required: true, type: "timestamp" },
      model_version: { required: false, type: "string_or_null" },
      score: { required: false, type: "number_or_null" },
      request_id: { required: false, type: "string_or_null" },
    },
  },
];

const TYPE_CHECKS = {
  number(value) {
    if (typeof value === "number" && Number.isFinite(value)) return true;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      return Number.isFinite(n);
    }
    return false;
  },
  number_or_null(value) {
    return value === null || TYPE_CHECKS.number(value);
  },
  string(value) {
    if (typeof value === "string" && value.trim() !== "") return true;
    if (typeof value === "number") return true;
    return false;
  },
  string_or_null(value) {
    return value === null || TYPE_CHECKS.string(value);
  },
  timestamp(value) {
    return TYPE_CHECKS.number(value);
  },
};

function isMissing(value) {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function summarizeFields(rows, spec) {
  const fieldStats = Object.fromEntries(
    Object.keys(spec.fields).map((field) => [
      field,
      { missing: 0, invalid: 0, invalidExamples: [] },
    ]),
  );

  const uniqueSeen = new Map();
  const duplicateSamples = new Map();
  let duplicateTotal = 0;
  let missingKey = 0;

  for (const row of rows) {
    for (const [field, meta] of Object.entries(spec.fields)) {
      const value = row[field];
      if (meta.required && isMissing(value)) {
        fieldStats[field].missing += 1;
        continue;
      }
      if (!isMissing(value) && meta.type) {
        const check = TYPE_CHECKS[meta.type];
        if (check && !check(value)) {
          fieldStats[field].invalid += 1;
          if (fieldStats[field].invalidExamples.length < 3) {
            fieldStats[field].invalidExamples.push(value);
          }
        }
      }
      if (!isMissing(value) && meta.allowed && !meta.allowed.has(String(value))) {
        fieldStats[field].invalid += 1;
        if (fieldStats[field].invalidExamples.length < 3) {
          fieldStats[field].invalidExamples.push(value);
        }
      }
    }

    if (typeof spec.uniqueKey === "function") {
      const key = spec.uniqueKey(row);
      if (isMissing(key)) {
        missingKey += 1;
      } else {
        const normalized = String(key);
        const count = (uniqueSeen.get(normalized) ?? 0) + 1;
        uniqueSeen.set(normalized, count);
        if (count >= 2) {
          duplicateTotal += 1;
          duplicateSamples.set(normalized, count);
        }
      }
    }
  }

  return {
    total: rows.length,
    fieldStats,
    duplicateTotal,
    duplicateSamples: Array.from(duplicateSamples.entries()),
    missingKey,
  };
}

function formatRate(count, total) {
  if (total === 0) return "0.00%";
  return `${((count / total) * 100).toFixed(2)}%`;
}

function logSpecResult(spec, stats) {
  console.log(`[DQ] ${spec.file} (${stats.total} rows)`);
  for (const [field, meta] of Object.entries(spec.fields)) {
    const { missing, invalid, invalidExamples } = stats.fieldStats[field];
    const messages = [];
    if (missing > 0) {
      messages.push(`missing ${missing} (${formatRate(missing, stats.total)})`);
    }
    if (invalid > 0) {
      const example = invalidExamples.length ? ` e.g. ${JSON.stringify(invalidExamples[0])}` : "";
      messages.push(`invalid ${invalid}${example}`);
    }
    if (messages.length) {
      console.log(`[DQ]   ${field}: ${messages.join("; ")}`);
    } else {
      console.log(`[DQ]   ${field}: ok`);
    }
  }
  const dupRate = formatRate(stats.duplicateTotal, stats.total);
  if (stats.duplicateTotal > 0) {
    const samples = stats.duplicateSamples
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([key, count]) => `${key} (${count})`)
      .join(", ");
    console.log(
      `[DQ]   duplicates: ${stats.duplicateTotal} rows (${dupRate}); samples: ${samples}`,
    );
  } else {
    console.log(`[DQ]   duplicates: 0 rows`);
  }
}

export function checkSnapshotEvents(snapshotDir) {
  const errors = [];
  const summary = [];

  for (const spec of EVENT_SPECS) {
    const filePath = path.join(snapshotDir, spec.file);
    if (!fs.existsSync(filePath)) {
      const message = `[DQ] missing file ${spec.file}`;
      if (spec.required) {
        errors.push(message);
        console.error(`${message} (required)`);
      } else {
        console.warn(`${message}; skipping optional spec`);
      }
      continue;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    let rows;
    try {
      rows = JSON.parse(raw);
    } catch (err) {
      errors.push(`${spec.file}: invalid JSON`);
      continue;
    }

    if (!Array.isArray(rows)) {
      errors.push(`${spec.file}: expected an array of events`);
      continue;
    }

    if (!rows.length && spec.required) {
      console.warn(`[DQ] ${spec.file} is empty; required spec may not return useful metrics`);
    }

    const stats = summarizeFields(rows, spec);
    logSpecResult(spec, stats);

    for (const [field, meta] of Object.entries(spec.fields)) {
      if (meta.required && stats.fieldStats[field].missing > 0) {
        errors.push(`${spec.file}: ${field} missing in ${stats.fieldStats[field].missing} rows`);
      }
      if (stats.fieldStats[field].invalid > 0) {
        errors.push(`${spec.file}: ${field} invalid in ${stats.fieldStats[field].invalid} rows`);
      }
    }

    if (spec.uniqueKey && stats.duplicateTotal > 0) {
      errors.push(`${spec.file}: ${stats.duplicateTotal} duplicate keys`);
    }

    summary.push({ spec: spec.name, stats });
  }

  if (errors.length) {
    const message = `Data-quality gate failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(message);
  }

  return summary;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    out[key] = value;
  }
  return out;
}

function runCli() {
  const args = parseArgs(process.argv);
  const snapshotDir = String(args.snapshot ?? "").trim();
  if (!snapshotDir) {
    console.error("--snapshot is required");
    process.exit(1);
  }
  try {
    checkSnapshotEvents(snapshotDir);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  runCli();
}
