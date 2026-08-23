---
id: env-setup
title: "Environment Setup — Secrets & Config (staging / production / dev)"
audience: [dev]
type: doc
status: approved
version: "1.8.0"
updated: 2026-08-18
visibility: internal
summary: How to configure all required secrets/env vars for an environment with one command (scripts/configure-env.mjs), routing each to the correct store and never exposing values, plus DB isolation, per-vendor host/branding/auth-cookie setup, and the local-only per-developer dev tier.
tags: [runbook, secrets, config, cloudflare, github, ops]
related: [architecture, adr-003-storage-abstraction, adr-004-multi-tenancy, neon-db-separation, demo-accounts-tool, multitenancy-slice3b-host-resolver, multitenancy-slice3c-auth-cookie-scoping, dev-environment]
---

# Environment Setup — Secrets & Config

Configure **every** required secret for an environment with a single command instead of setting
each by hand. The tool routes each variable to the store that actually consumes it, validates that
all values are present, and **never prints secret values**.

## Two stores (why some vars go to GitHub and some to Cloudflare)

| Store | Set by | Consumed by | Variables |
|---|---|---|---|
| **GitHub environment secrets** | `gh secret set … --env <env>` | CI deploy workflows (`.github/workflows/deploy-*.yml`) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DIRECT_URL` |
| **Cloudflare Worker secrets** | `wrangler secret put … --env <env>` | the running app at runtime (`lib/config`) | `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `CDN_BASE_URL`, `AUTH_COOKIE_FAMILY_DOMAIN` *(optional — see slice 3c)*, `STRIPE_SECRET_KEY` *(optional)*, `STRIPE_WEBHOOK_SECRET` *(optional)* |

Beyond the original list: **`S3_REGION`** is required by ADR-003's storage contract, and
**`BETTER_AUTH_URL`** is now only a **fallback** origin — since ADR-004 slice 3c, `getAuth()` derives
`baseURL` per request from the host, so a single hardcoded origin no longer pins the app to one vendor
(keep it set as a safe default; it's used only when a request has no host header).
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

### Per-vendor host mapping (ADR-004 slice 3b)

Multi-tenancy resolves the vendor from the **request host** via the `VendorDomain` table. Because
staging and production are separate DBs, each environment's host rows are seeded from **per-run env
vars** when you run `npm run db:seed` against that env's `DIRECT_URL`:

```bash
# staging
SEED_AHEED_HOST="staging.aheedfoodcentre.nocaped.com" \
SEED_SRIMART_HOST="srimart-staging.nocaped.com" \
DIRECT_URL="<staging-direct>" npm run db:seed

# production
SEED_AHEED_HOST="aheedfoodcentre.nocaped.com" \
SEED_SRIMART_HOST="srimart.nocaped.com" \
DIRECT_URL="<prod-direct>" npm run db:seed
```

- The SriMart demo vendor + its catalogue + its `VendorDomain` are seeded **only when both** vars are
  set — otherwise the DB could end up with 2 vendors but a missing host, which would send Aheed's own
  host to `/coming-soon`.
- A request host with no `VendorDomain` (and 2+ vendors) renders the `/coming-soon` page. With a
  single vendor, an unmatched host falls back to it (transition safety).
- The SriMart Worker custom domains (`srimart.nocaped.com`, `srimart-staging.nocaped.com`) are
  declared in `wrangler.toml` so `wrangler deploy` doesn't tear them down.

### Per-vendor branding/config/delivery (ADR-004 slice 4)

`npm run db:seed` also fills each vendor's `VendorBranding` / `VendorConfig` / `VendorDeliveryArea`
(colours, name, tagline, locality, delivery prefixes, email sender). **No new env vars** — these are
seed data, read per request via `lib/repositories/vendor.ts` and injected as CSS custom properties.

**One-time logo upload (Aheed).** The header renders the logo from `VendorBranding.logoStorageKey`
via `${CDN_BASE_URL}/${key}`, else a text wordmark. Aheed's key is seeded as
`vendors/<aheed-vendor-id>/logo.png`; upload the asset once per environment's object storage
(e.g. the existing `public/images/brand/logo.png`) so the CDN serves it:

```bash
# example — use your S3-compatible client against the env's bucket
aws s3 cp public/images/brand/logo.png "s3://<bucket>/vendors/<aheed-vendor-id>/logo.png" \
  --content-type image/png
```

Until the object exists (or where `CDN_BASE_URL` is unset, e.g. local `preview`), the header falls
back to the Aheed wordmark — never a broken image. SriMart has no logo yet (`logoStorageKey` null →
wordmark); setting a real one later is data-only, no deploy.

## Local development (`dev`)

A third environment tier, alongside staging and production — but **local-only**: no `wrangler.toml`
`[env.dev]` block, no Cloudflare Worker deploy, no custom domain, no CI workflow, and no GitHub
environment. It's not configured through `scripts/configure-env.mjs` either — that script routes
values to GitHub/Cloudflare secret stores, and `dev` has nothing deployed for either store to reach.
It exists purely so `next dev` / `npm run preview` on your own machine stop pointing at the shared
**staging** database and bucket (their default before this section existed — every local run either
risked staging data or needed scratch infra stood up by hand). Ref: #226.

**Isolation model:** one **personal Neon branch per developer**, not one shared database. Two
developers fixing different bugs at once would otherwise collide on the same test data if `dev` were
a single shared DB — a branch each avoids that, and branching is free and instant, unlike the
separate-project isolation staging/production use (see "One Neon project per environment" above;
that rationale is about real vendor data under shared compute limits, which doesn't apply to a
disposable personal branch — see `specs/2026-08-18-dev-environment/plan.md`).

**Create your branch** (Neon Console → the **staging** project → *Branches* → *Create Branch* →
parent = staging's default branch): name it `dev-<you>` (e.g. `dev-sri`). A new branch is a
copy-on-write snapshot of its parent at creation time, so it starts with staging's **current schema
and seed/demo data already loaded** — no `npm run db:seed` or `npm run demo:accounts` needed for the
common case of just wanting a working local database.

Open the branch's *Connection Details* panel for its two URLs, same pooled/direct split every other
environment uses:

```bash
# .env / .dev.vars — from YOUR branch's Connection Details panel
DATABASE_URL="<branch pooled URL, host contains -pooler>"   # runtime
DIRECT_URL="<branch direct URL, no -pooler>"                 # migrations/seed, local Node only
```

**Reset**: delete the branch and recreate it from staging's current tip — no migration or re-seed
step, that's the point of branching instead of a from-scratch project.

**Testing a locally-authored, not-yet-merged Prisma migration** against your branch before opening a
PR:

```bash
DIRECT_URL="<branch-direct-url>" npx prisma migrate deploy   # or `migrate dev` while iterating
```

This runs from your machine via the Node Prisma CLI, not the Worker — consistent with `CLAUDE.md`'s
"migrations never run on the Worker, never at request time."

**Object storage**: one **shared** R2 bucket, `aheed-images-dev` — used by *every* developer, not one
per developer. Object storage isn't where concurrent local test writes actually collide; the worst
case is a stale test image, not corrupted state, so a per-developer bucket isn't worth provisioning.

```bash
S3_BUCKET="aheed-images-dev"
```

**Integration is unchanged**: a bug fix built and validated against your personal branch still goes
out as `feature/<slug>` → PR into `staging` per `CLAUDE.md`'s branch strategy. System integration
testing happens on `staging` against the shared staging database, exactly as it does today — `dev`
only replaces what your *local* loop was pointed at before that PR exists.

**Neon plan/branch limits**: not verified against this account as of this writing — if you hit a
branch-limit error creating your personal branch, that's a real constraint on this design, not a bug
in these instructions.

### Auth cookie scoping (ADR-004 slice 3c)

`getAuth()` derives `baseURL` / `trustedOrigins` / cookie domain **per request** from the host alone
(no DB call) — so each vendor host gets a **host-only session that trusts only its own origin**, with
no configuration. A sibling vendor's origin is rejected by Better Auth's origin/CSRF check exactly
like an unknown origin — trusting every vendor's origin on every other vendor's auth endpoints was
considered and rejected as reopening cross-tenant CSRF surface (#83).

- **`AUTH_COOKIE_FAMILY_DOMAIN`** — *optional*, **leave unset** in staging and production today
  (there is no shared subdomain family: Aheed and SriMart are on distinct hosts). It exists only to
  arm parent-domain **family SSO** in the future: set it to a family suffix
  (e.g. `.aheedfoodcentre.nocaped.com`) once real `{slug}.<family>` subdomain vendors exist, and any
  host under that suffix shares one session cookie. A custom-domain vendor never matches it and stays
  isolated. No code change — one Cloudflare Worker secret.
- **Per-host Google OAuth redirect URIs (onboarding step).** Because `baseURL` is per host, Google
  sign-in calls back to `https://<vendor-host>/api/auth/callback/google`. Each vendor host must be
  added to the Google OAuth client's *Authorized redirect URIs*. Aheed and SriMart are registered;
  do this for every **new** vendor host (email/password needs nothing).

### Stripe payments (P3c)

Two Cloudflare **Worker** secrets per environment. Both optional — with neither set the app falls
back to the stub payment adapter, so local dev and CI work with no Stripe setup at all.

- **`STRIPE_SECRET_KEY`** — server-side API calls. **Both staging and production run `sk_test_…`
  today**, deliberately: production shipped before the storefront was opened to customers, so no
  real money can move. Switching production to a live key is a separate decision, taken when
  checkout is actually reachable — not a default of promoting the code.
- **`STRIPE_WEBHOOK_SECRET`** — the signing secret for that environment's webhook endpoint
  (`whsec_…`).

`scripts/configure-env.mjs` pushes both as **optional** Worker secrets: present and non-empty → set,
absent → reported as skipped and *not* an error (an environment without Stripe is a supported state,
since the app falls back to the stub). Until 2026-08-10 the script didn't know these two keys at all
and silently listed them as "unrecognized", which is why production ran with no Stripe credentials
until they were set by hand.

There is deliberately **no `STRIPE_PUBLISHABLE_KEY`**: hosted Checkout is a server-created session
plus a redirect, so nothing Stripe-related runs in the browser.

**Register exactly ONE webhook endpoint per environment — not one per vendor host.** The same
Worker serves every vendor domain and the handler is vendor-agnostic (it finds the order by the
`orderNumber` in session metadata), so one endpoint is enough. Registering per-host endpoints would
produce several signing secrets, and `STRIPE_WEBHOOK_SECRET` holds exactly one.

| Environment | Endpoint URL |
|---|---|
| staging | `https://staging.aheedfoodcentre.nocaped.com/api/webhooks/stripe` |
| production | `https://aheedfoodcentre.nocaped.com/api/webhooks/stripe` |

Subscribe it to: `checkout.session.completed`, `checkout.session.expired`,
`checkout.session.async_payment_failed`.

> ⚠️ **`STRIPE_WEBHOOK_SECRET` is per-ENDPOINT, not per-account.** Each endpoint above has its own
> `whsec_…`, so staging's value cannot verify deliveries to production's endpoint. Copying it across
> produces a webhook that fails signature verification on **every** delivery — and because the
> handler returns before doing anything, the symptom is silent: orders simply never leave
> `PENDING_PAYMENT` and their stock is never released. Each `secrets/<env>.vars` must carry the
> secret belonging to **that** environment's endpoint. The secret is readable only from the Stripe
> dashboard; the API does not return it for an already-created endpoint.

**Setting a Worker secret can fail with "the latest version of your Worker isn't currently
deployed."** Cloudflare refuses a secret edit while an undeployed version is pending. Deploy first
(for production that means promoting to `main` and letting `deploy-production` run), then set the
secret — or set it from the Cloudflare dashboard, which is not subject to the same restriction.

**Local testing needs the Stripe CLI** — Stripe cannot reach `localhost`:

```bash
stripe listen --forward-to http://localhost:8787/api/webhooks/stripe
# use the whsec_… it prints as STRIPE_WEBHOOK_SECRET for that session
stripe trigger checkout.session.completed
```

Use **test mode** (card `4242 4242 4242 4242`) everywhere — including production, until the
storefront is opened to real customers and a live key is deliberately installed.

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

