# Onboarding

Start here. This gets a new developer running, tested, and branching quickly.

## First: understand where the project is
The repo is currently the **Walking Skeleton (Milestone 0)** — a minimal app that proves the
Cloudflare Workers + Neon pipeline end-to-end. To run or deploy it, follow
**`docs/walking-skeleton-runbook.md`**. Feature work (P0+) starts only after M0 is green.

## Prerequisites
- Node.js **22 LTS** (Node 22+ ships a global `WebSocket`, which the Neon driver needs) and npm.
- Cloudflare account (Workers, R2, the `nocaped.com` zone) + `wrangler`.
- Neon project with a `staging` branch; pooled `DATABASE_URL` + direct `DIRECT_URL` per branch.
- Stripe test keys (later phases).

## Local run
```bash
bash scripts/bootstrap.sh     # installs SDD hooks + deps + generates Prisma client
cp .env.example .env          # fill DATABASE_URL (pooled) + DIRECT_URL (direct)
npm run db:migrate:dev        # create/apply migration to your Neon staging branch
npm run db:seed
npm run dev                   # http://localhost:3000
```
Real Workers runtime locally: `npm run preview` (reads `.dev.vars`).

## Environment variables
All config flows through `lib/config` (zod-validated). See `.env.example` / `.dev.vars.example`:
`DATABASE_URL` (pooled, runtime), `DIRECT_URL` (direct, migrations only), `S3_ENDPOINT`,
`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `CDN_BASE_URL`. Runtime secrets live in
Cloudflare (`wrangler secret put … --env <env>`); CI secrets live in GitHub environments.

## How we branch
- One feature per branch: `feature/<short-name>`.
- Spec **before** source: `specs/<YYYY-MM-DD-feature>/{plan,requirements,validation}.md`.
- Update `CHANGELOG.md` before opening the PR.
- PR into `staging` (auto-deploys); promote `staging → main` (manual-approved production).

## The four gates
1. **Propose before work** — 2. **Spec before code** — 3. **Validate before done** —
4. **Changelog before merge**. Enforced by git hooks locally and `gates.yml` in CI.

## Where to read next
`README.md` → `specs/mission.md` → `specs/tech-stack.md` → `specs/architecture.md` →
`specs/roadmap.md` → the ADRs. Repo layout: `docs/repo-structure.md`.
