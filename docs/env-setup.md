---
id: env-setup
title: "Environment Setup — Secrets & Config (staging / production)"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: How to configure all required secrets/env vars for an environment with one command (scripts/configure-env.mjs), routing each to the correct store and never exposing values.
tags: [runbook, secrets, config, cloudflare, github, ops]
related: [architecture, adr-003-storage-abstraction]
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

## Troubleshooting

- **"missing/empty required variables"** — a key is blank in `secrets/<env>.vars`; fill it and
  re-run. The script lists which names are missing (never the values).
- **"gh not authenticated" / "wrangler not authenticated"** — run the prerequisite login above.
- **A single `✗ NAME`** — that one secret failed (e.g. token lacks scope); the rest still applied.
  Fix and re-run; re-running is idempotent (it overwrites).
