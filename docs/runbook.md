# ReelSwipe Runbook

## Architecture (quick)

- Web: Next.js + OpenNext on Cloudflare Pages
- API: Cloudflare Workers (TypeScript)
- DB: D1 (SQLite)
- Data: TMDb sync

Copy `apps/web/.env.local.example` to `apps/web/.env.local` and set `API_ADMIN_TOKEN`, matching the API's `ADMIN_TOKEN` secret.

## “Is it up?”

### Local

- Web: http://localhost:3000
- API: http://localhost:8787/health

Commands:

```bash
pnpm dev
# or split into two shells
pnpm --dir apps/api wrangler dev
pnpm --dir apps/web dev
```

## Logs

### Tail API logs (Cloudflare)

```bash
pnpm --dir apps/api wrangler tail
```

What to look for:

- one JSON log line per request
- fields: `req_id`, `route`, `status`, `dur_ms`
- errors still include `req_id` and `error` details

## Metrics

### View /metrics

- Web: https://localhost:3000/metrics (or your Pages preview)

### Verify data is being written (local D1)

```bash
pnpm --dir apps/api wrangler d1 execute DB --local --command="SELECT COUNT(*) AS n FROM swipe_events;"

pnpm --dir apps/api wrangler d1 execute DB --local --command="SELECT COUNT(*) AS n FROM recommendation_impressions;"

pnpm --dir apps/api wrangler d1 execute DB --local --command="SELECT COUNT(*) AS n FROM request_logs;"
```

### Spot-check recent request logs

```bash
pnpm --dir apps/api wrangler d1 execute DB --local --command="SELECT route, status, dur_ms, ts_ms FROM request_logs ORDER BY ts_ms DESC LIMIT 10;"
```

## Common failures

### 401 admin required on /metrics

- Ensure `API_ADMIN_TOKEN` is set for the web app (e.g., `apps/web/.env.local` or Cloudflare Pages env)
- Confirm API has `ADMIN_TOKEN` secret and the header `x-admin-token` is sent

### Metrics still showing zeros

- Generate impressions/swipes in the last 24h (open the UI or seed events)
- Try a wider window: `/v1/metrics?window=72h`
- Query the DB directly (commands above)

### D1 migration errors

```bash
pnpm --dir apps/api wrangler d1 migrations list DB --local
pnpm --dir apps/api wrangler d1 migrations apply DB --local
```

### TMDb sync errors

- Ensure `TMDB_API_KEY` (or your chosen TMDb secret) is configured
- Review Worker logs for non-2xx responses

## Runbook sanity checklist

1. Confirm migrations applied locally (`wrangler d1 migrations apply DB --local`)
2. Start the API (`pnpm --dir apps/api wrangler dev --port 8787`)
3. Start the web (`NEXT_PUBLIC_API_BASE=http://localhost:8787 API_ADMIN_TOKEN=replace_me pnpm --dir apps/web dev --port 3000`)
4. Hit `http://localhost:8787/health` and `http://localhost:3000/metrics`
5. Tail logs (`pnpm --dir apps/api wrangler tail`) and watch for `req_id` + `dur_ms`

## Production release checklist

1. Push migrations to the prod D1 (`pnpm --dir apps/api wrangler d1 migrations apply reelswipe_prod --remote`) and verify tables exist; make sure `ADMIN_TOKEN` and (optionally) `TMDB_API_KEY` secrets are configured for the prod env.
2. Trigger `.github/workflows/deploy.yml` via `workflow_dispatch` (choose `prod`) so both Workers deploy with the `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `PROD_API_BASE` secrets; alternatively run `pnpm --dir apps/api wrangler deploy --env prod` followed by `pnpm --dir apps/web build` + `pnpm --dir apps/web deploy --env prod` while keeping `CORS_ORIGIN`/`NEXT_PUBLIC_API_BASE` aligned with the public domains.
3. For cautious rollouts, use `pnpm --dir apps/api wrangler versions upload --env prod` and `wrangler versions deploy --env prod --percentage <n>` to shift traffic up gradually while watching logs.
4. After deployments finish, run `./scripts/smoke-prod.sh https://<YOUR_API_PROD_DOMAIN>` to exercise `/health` and `/v1/movies`.
5. Load the prod web URL, swipe through a few cards, and visit `/metrics` (with the admin token) to confirm the UI renders and metrics respond.

## Post-release verification

- Tail the API worker logs (`pnpm --dir apps/api wrangler tail --env prod`) and look for `[scheduled]` messages so you know the cron sync and log pruning completed without errors.
- Check that the smoke script or manual curls still succeed, and watch `/metrics` to ensure request throughput/latency are reasonable given the sampled logs.
- Confirm the web app stays responsive, cards continue to load, and swipes are recorded (you can also inspect D1 tables or `/metrics` to double-check).
- Watch the prod `LOG_SAMPLE_RATE` and `REQUEST_LOG_RETENTION_DAYS` values so logging stays at the conservative levels configured in the env.
- Keep the `scripts/smoke-prod.sh` invocation handy for quick re-runs after any rollback or follow-up deploy.

## Rollback notes

- Use Cloudflare Versions to route traffic back to the previous release (both `reelswipe-api-prod` and `reelswipe-web-prod`) or redeploy a known-good git tag.
- If request logging is blocking the worker, set `LOG_SAMPLE_RATE=0` (or temporarily skip the log insert) in prod env vars, redeploy, and rerun `./scripts/smoke-prod.sh` to ensure the surface is still healthy.
- Restore data via `wrangler d1 time-travel restore reelswipe_prod --timestamp=...` if a migration/data change corrupted prod; rerun the smoke script afterward.
