# ADR-0002: Event-data quality gate for offline modeling

- Status: Accepted
- Date: 2026-01-23

## Context

Offline training and evaluation jobs (including the phased GitHub workflow and any scheduled retrains) currently assume the swipe + impression logs are well-formed. Bad data (missing keys, null critical fields, duplicate events) directly corrupts the item-item CF model that powers ReelSwipe metrics and release decisions. We need a very early gate so those jobs fail fast and stop shipping data that cannot be trusted.

## Decision

- Define a concise contract for each event type we ingest for modeling/metrics:
  - **Swipe event** (`swipe_events.json`): represents a user swipe with fields
    - `event_id` (string, global primary key, required)
    - `session_id` (string, required), serves as the “user” or anonymized session key
    - `deck_id` (string, required)
    - `movie_id` (string, required)
    - `action` (string, required, allowed values `like` or `skip`)
    - `ts_ms` (timestamp in milliseconds, required)
    - Optional helpers: `dwell_ms` (ms number), `request_id` (string), `anon_user_id` (string or null)
  - **Impression/deck-served event** (`recommendation_impressions.json`): carries delivery context
    - `impression_id` (string, global primary key, required)
    - `deck_id`, `session_id`, `movie_id` (strings, required)
    - `rank` (number, required)
    - `reason_code` (string, required)
    - `ts_ms` (timestamp, required)
    - Optional: `model_version`, `score`, `request_id` (`string | number | null` as appropriate)
  - These definitions cover the completeness (critical columns must exist) plus optional metadata that can be null when absent.
  - Uniqueness: the primary key field (`event_id` or `impression_id`) must never duplicate; missing PK rows are surfaced as completeness failures because the gate treats those columns as required.

- Implement the gate in `tools/ml/data-quality.mjs`, which can be invoked as `node tools/ml/data-quality.mjs --snapshot artifacts/ml/snapshots/<id>` or programmatically via `checkSnapshotEvents(snapshotDir)`. The script reads the per-snapshot JSON files and computes:
  - **Completeness**: counts of missing/empty values for every required field and invalid type/enum violations (e.g., non-numeric `ts_ms` or actions outside `like|skip`). Anything with a missing rate > 0% on a required column fails the gate.
  - **Uniqueness**: duplicate counts for the chosen key; samples of the worst offenders (top 20) are logged for debugging. Any duplicate (count > 0) also fails.
  - Outputs a concise log per file indicating row counts, missing/invalid summaries, duplicate rate, and sample keys.

- Wire the gate as the **first thing** offline modeling jobs execute:
  - `tools/ml/train_itemitem_cf.mjs` and `tools/ml/eval_offline.mjs` now call `checkSnapshotEvents(snapshotDir)` immediately after validating CLI flags and before reading any rows.
  - The GitHub `train-eval` workflow (and any scheduled reruns) use those entry points, so the gate implicitly runs on every job that builds or evaluates a model.
  - Teams regenerating metrics artifacts (`tools/eval/eval.mjs` or similar) are encouraged to run the CLI gate before pointing the metric pipeline at a real snapshot; the helper is already in place if extra data is supplied.

## Consequences

- Training/eval jobs now fail quickly when required fields are missing or duplicates exist, preventing stale or corrupt event data from tainting models or dashboards.
- The gate also doubles as documentation: the ADR plus `tools/ml/data-quality.mjs` spells out the critical schema, data types, and thresholds people need to hit when exporting snapshots from D1.
- Any future event-type additions can be accommodated by appending another spec to `EVENT_SPECS` so completeness/uniqueness stay enforced.
