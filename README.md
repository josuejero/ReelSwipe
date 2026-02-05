# ReelSwipe

Phase 0 lays a reproducible Cloudflare-first monorepo foundation where local dev with `pnpm dev` gets you running in under five minutes.

## Quickstart

```bash
pnpm install
pnpm dev
```

This boots `apps/api` (Workers) and `apps/web` (Next/OpenNext) simultaneously.

## Structure

- `apps/api`: Cloudflare Worker + D1 access for the HTTP API.
- `apps/web`: Next.js 15 running via OpenNext on Workers.
- `docs/`: Architecture decisions and reference materials.
- `.github/`: Issue/PR templates and CI workflow.

## Cloudflare checklist

1. Run `pnpm wrangler login` if you haven't already.
2. Create a dev D1 database: `pnpm wrangler d1 create reelswipe_dev` and copy the returned `database_id` into `apps/api/wrangler.jsonc`.
3. Apply the initial migration locally (`pnpm --dir apps/api wrangler d1 migrations apply reelswipe_dev --local`) and on Cloudflare (`pnpm --dir apps/api wrangler d1 migrations apply reelswipe_dev`).
4. Optionally deploy `apps/api` and `apps/web` once the database exists (`pnpm --dir apps/api deploy`, `pnpm --dir apps/web deploy`) and record the `.workers.dev` URLs for future reference.

## Phase 2 data logging

1. Copy `apps/api/.dev.vars.example` to `.dev.vars` and fill in `TMDB_API_KEY` plus a long `ADMIN_TOKEN`; `CORS_ORIGIN` can stay set to your web dev origin.
2. Apply the new Phase 2 migration so D1 has the impressions, swipes, and sync tables (`cd apps/api && npx wrangler d1 migrations apply DB --local` for local dev).
3. Sync from TMDb by POSTing to the new admin endpoint:

   ```bash
   cd apps/api
   curl -X POST \
     -H "Authorization: Bearer $(grep '^ADMIN_TOKEN=' .dev.vars | cut -d= -f2)" \
     "http://localhost:8787/v1/admin/tmdb/sync?force=1"
   ```

4. Export the new tables when you want offline metrics:

   ```bash
   cd apps/api
   mkdir -p ../../data
   npx wrangler d1 execute DB --local --json --command "SELECT * FROM swipe_events ORDER BY ts_ms ASC" > ../../data/swipe_events.json
   npx wrangler d1 execute DB --local --json --command "SELECT * FROM recommendation_impressions ORDER BY ts_ms ASC" > ../../data/impressions.json
   node tools/metrics/summary.mjs
   ```

   The script prints totals and top likes so you can sanity-check engagement without a dashboard.
