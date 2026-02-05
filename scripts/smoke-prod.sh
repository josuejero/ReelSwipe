#!/usr/bin/env bash
set -euo pipefail

API_BASE="${1:?Usage: ./scripts/smoke-prod.sh https://api.example.com}"

printf '[smoke] health\n'
curl -fsS "$API_BASE/health" >/dev/null

printf '[smoke] movies\n'
curl -fsS "$API_BASE/v1/movies?limit=3" | head

printf '[smoke] ok\n'
