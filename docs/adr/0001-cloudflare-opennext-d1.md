# ADR-0001: Cloudflare-first stack (Workers + OpenNext + D1)

- Status: Accepted
- Date: 2025-12-29

## Context
Need a $0/month demo that’s globally fast and easy to deploy.

## Decision
Use Next.js on Cloudflare Workers via @opennextjs/cloudflare, Workers for API, and D1 for persistence.

## Consequences
Pros: single-vendor deploy, fast demo, simple ops.
Cons: Worker size limits; Node compatibility constraints; some Next features require care.
