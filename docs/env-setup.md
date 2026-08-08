---
id: env-setup
title: "Environment Setup — Secrets & Config (staging / production)"
audience: [dev]
type: doc
status: approved
version: "1.2.0"
updated: 2026-08-08
visibility: internal
summary: How to configure all required secrets/env vars for an environment with one command (scripts/configure-env.mjs), routing each to the correct store and never exposing values, plus DB isolation and the demo-accounts tool.
tags: [runbook, secrets, config, cloudflare, github, ops]
related: [architecture, adr-003-storage-abstraction, adr-004-multi-tenancy, neon-db-separation, demo-accounts-tool]
---

# Environment Setup — Secrets & Config

Configure **every** required secret for an environment with a single command instead of setting
each by hand. The tool routes each variable to the store that actually consumes it, validates that
all values are present, and **never prints secret values**.

## Two stores (why some vars go to GitHub and some to Cloudflare)

| Store | Set by | Consumed by | Variables |
|---|---|---|---|
| **GitHub environment secrets** | `gh secret set … --env <env>` | CI deploy workflows (`.github/workflows/deploy-*.yml`) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DIRECT_URL` |
| **Cloudflare Worker secrets** | `wrangler secret put … --env <env>` | the running app at runtime (`lib/config`) | `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `CDN_BASE_URL` |

Two variables are required beyond the original list: **`BETTER_AUTH_URL`** (per-environment origin —
OAuth/session break without it) and **`S3_REGION`** (required by ADR-003's storage contract).
`DIRECT_URL` (direct, non-pooled) is a **GitHub** secret for CI migrations; `DATABASE_URL` (pooled)
is a **Worker** secret for runtime — never the reverse (see `CLAUDE.md`).

## One Neon project per environment (isolation)

Staging and production each have their **own, separate Neon project** — they no longer share one
database (ADR-004 slice 0, `neon-db-separation`, #56). This keeps **environment** isolation from
being conflated with **tenant** isolation: a staging test can never read or mutate live production
rows. Each environment's `DIRECT_URL`/`DATABASE_URL` (in `secrets/<env>.vars`) point at its own
project's direct/pooled endpoints; production stays on the original project, staging on its own.

**Bootstrapping a fresh environment database** (e.g. a brand-new staging project, or after any
reset): the CI deploy runs `prisma migrate deploy` against that environment's `DIRECT_URL`
automatically, then seed and demo accounts are a one-time manual step against the same direct URL:

```bash
# schema is applied by CI on deploy; then, once, against the fresh project's DIRECT_URL:
DIRECT_URL="<env-direct-url>" npm run db:seed                                   # catalogue data
DIRECT_URL="<env-direct-url>" DEMO_ACCOUNT_PASSWORD="<min-8>" npm run demo:accounts -- add
```

Never point staging at production's project (or vice versa) to "save setup" — that reintroduces the
exact shared-database problem this split removed.

## Prerequisites (one-time)

1. **Authenticate the GitHub CLI** — this is where GitHub issues the **one-time device code**:
   ```
   gh auth login
   ```
   Choose GitHub.com → HTTPS → "Login with a web browser", then enter the one-time code shown.
2. **Authenticate Wrangler** (Cloudflare):
   ```
   wrangler login
   ```
   (or export `CLOUDFLARE_API_TOKEN` in your shell instead).

The script checks both and stops with a clear message if either is missing.

## Run it (per environment)

1. Copy the template and fill in **real** values (the file is gitignored):
   ```
   cp secrets/example.vars secrets/staging.vars      # then edit
   cp secrets/example.vars secrets/production.vars    # then edit
   ```
2. Dry-run first — validates completeness and shows routing, sets nothing:
   ```
   node scripts/configure-env.mjs staging --dry-run
   ```
3. Apply:
   ```
   node scripts/configure-env.mjs staging
   node scripts/configure-env.mjs production
   ```
   (or `npm run configure-env -- staging`). Use `--file <path>` to point at a different input file.

Output is variable **names** with `✓`/`✗` only — values are piped to `gh`/`wrangler` via stdin, so
they never appear in argv, shell history, or logs.

## Security notes

- `secrets/*.vars` are **gitignored** (only `secrets/example.vars` is tracked). Never commit real
  values; keep the filled files out of shared drives.
- The script sets secrets **write-only** — it cannot read existing values back (neither store
  exposes them), so it can't leak them.
- Rotating a secret = edit `secrets/<env>.vars`, re-run the command; it overwrites in place.
- After a deploy that changed Worker secrets, the new values take effect on the next request; CI
  (GitHub) secrets take effect on the next workflow run.

## Demo accounts (`npm run demo:accounts`)

Standalone tool (`scripts/demo-accounts.ts`, spec `demo-accounts-tool`) to **add or remove** the
platform's demo login accounts on demand — deliberately separate from `prisma/seed.ts`. Per the
standing directive, keep these present in **both production and staging until all phases are
complete**, and re-run `add` after any DB reset (e.g. the staging Neon-project move, or the ADR-004
`vendorId` migration) so they aren't lost.

It manages three accounts, one per RBAC role: `demo-admin@example.com` (ADMIN),
`demo-staff@example.com` (STAFF), `demo-customer@example.com` (CUSTOMER). They are created **through
Better Auth** (hashed password, real sign-in) with `emailVerified` forced true and **no** verification
email sent.

```bash
# targets whichever environment's DIRECT_URL you provide (like db:seed); password never committed
DIRECT_URL=<env-direct-url> DEMO_ACCOUNT_PASSWORD=<min-8-chars> npm run demo:accounts -- add
DIRECT_URL=<env-direct-url> npm run demo:accounts -- remove
```

- `add` is idempotent — re-running reconciles roles/verification without creating duplicates.
- `<env-direct-url>` is the target environment's **direct** (non-pooled) Neon URL, from
  `secrets/<env>.vars`. Run against **both** staging and production to satisfy the directive.
- `remove` exists for later cleanup; do **not** run it until all phases are complete.

## Troubleshooting

- **"missing/empty required variables"** — a key is blank in `secrets/<env>.vars`; fill it and
  re-run. The script lists which names are missing (never the values).
- **"gh not authenticated" / "wrangler not authenticated"** — run the prerequisite login above.
- **A single `✗ NAME`** — that one secret failed (e.g. token lacks scope); the rest still applied.
  Fix and re-run; re-running is idempotent (it overwrites).
