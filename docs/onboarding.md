---
id: onboarding
title: Onboarding
audience: [dev]
type: doc
status: approved
version: "1.1.0"
updated: 2026-08-06
visibility: internal
summary: 5-minute start-here guide — where the project actually is, prerequisites, local setup, and how to get a new developer running, tested, and branching independently.
tags: [onboarding, setup]
---

# Onboarding

Start here. This gets a new developer running, tested, and branching quickly — independently, not
needing anyone else's context to get going.

## First: understand where the project is
Past the walking skeleton. **M0** (infrastructure proof) and **P0** (foundation + design-system
tokens) are both closed. The **KMS** (this docs system — schema, index, internal site, CI gate
wiring, front-matter backfill) is built and self-serving. **P1a** (Better Auth email/password,
RBAC, account shell) is in flight; **P1b** (Google Sign-In) is blocked on a Google Cloud Console
OAuth client only a human can create. Check `specs/roadmap.md`'s change log for the exact current
state — it's the one doc updated every time a phase closes, this one isn't.

## Prerequisites
- Node.js **22 LTS** (Node 22+ ships a global `WebSocket`, which the Neon driver needs) and npm.
- Cloudflare account (Workers, R2, the `nocaped.com` zone) + `wrangler`.
- Neon project with a `staging` branch; pooled `DATABASE_URL` + direct `DIRECT_URL` per branch.
- Stripe test keys (later phases).
- For auth work (P1+): a `BETTER_AUTH_SECRET` (generate locally — `openssl rand -base64 32`, not a
  third-party credential) and, if you're touching verification/reset emails, a Resend account/key.

## Local run
```bash
bash scripts/bootstrap.sh     # installs SDD hooks + deps + generates Prisma client
cp .env.example .env          # fill DATABASE_URL (pooled) + DIRECT_URL (direct), plus whatever
                               # else .env.example currently lists — it grows with each feature
cp .dev.vars.example .dev.vars  # same values again — wrangler/OpenNext reads this file, not .env
npm run db:migrate:dev        # create/apply migration to your Neon staging branch
npm run db:seed
npm run dev                   # http://localhost:3000 — UI iteration only, see note below
```
**Anything that touches Prisma needs `npm run preview`, not `npm run dev`.** `next dev` runs in
plain Node, which can't load `@prisma/client/wasm`'s WASM query engine — DB-touching routes
silently show an error state, no crash, no obvious signal. `npm run preview` (OpenNext + local
Workers/Miniflare runtime, reads `.dev.vars`) is the only local runtime that behaves like the real
deploy. See `CLAUDE.md`'s Database section for why.

## Environment variables
All config flows through `lib/config` (zod-validated), read from `.env` (Node-side tooling —
`next dev`, Prisma CLI) **and separately** `.dev.vars` (the local Workers runtime — `npm run
preview`) — the two aren't automatically in sync, keep both updated. See `.env.example` /
`.dev.vars.example` for the full current list (Neon URLs, S3/R2, Better Auth, Resend). Runtime
secrets in real environments live in Cloudflare (`wrangler secret put … --env <env>`); CI secrets
live in GitHub environments — two different stores, neither populates the other.

## How we branch
- One feature per branch: `feature/<short-name>`.
- Spec **before** source: `specs/<YYYY-MM-DD-feature>/{plan,requirements,validation}.md` — copy
  the three files from `specs/templates/feature-spec/`, all three are required for every slice.
- Update `CHANGELOG.md` before opening the PR.
- PR into `staging` (auto-deploys); promote `staging → main` (manual-approved production).

## The SDD workflow
Four non-negotiable gates — **Propose → Spec → Validate → Changelog** — expanded into seven
stages in `specs/sdd-workflow.md`: **Orient → Propose → Spec → Build → Validate → Document →
Ship**. Each stage is also a Claude Code slash command (`/orient`, `/propose`, `/spec`, `/build`,
`/validate`, `/document`, `/ship`) — use them; that doc carries lessons (stale-doc traps, Windows
CRLF-vs-CI drift, PR merge races) that are cheap to read and expensive to relearn.

## Where to read next
`README.md` → `specs/mission.md` → `specs/tech-stack.md` → `specs/architecture.md` →
`specs/roadmap.md` → the ADRs (`specs/decisions/`) → `specs/design-system.md`. Repo layout:
`docs/repo-structure.md`. Or browse the internal docs site (once deployed —
`kms/site-internal/README.md` for local setup): it serves all of the above assembled under `/dev`,
generated from these same source files, never hand-edited separately.
