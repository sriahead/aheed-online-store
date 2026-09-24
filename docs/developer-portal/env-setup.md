---
id: env-setup
title: "Environment Setup — Secrets & Config (staging / production / dev)"
audience: [dev]
type: doc
status: approved
version: "1.12.0"
updated: 2026-09-24
visibility: internal
summary: How to configure all required secrets/env vars for an environment with one command (scripts/configure-env.mjs), plus DB isolation, the reference-database bootstrap, per-vendor host/branding/auth-cookie setup, and the local-only per-developer dev tier.
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
| **Cloudflare Worker secrets** | `wrangler secret put … --env <env>` | the running app at runtime (`lib/config`) | `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `CDN_BASE_URL`, `AUTH_COOKIE_FAMILY_DOMAIN` *(optional — see slice 3c)*, `STRIPE_SECRET_KEY` *(optional)*, `STRIPE_WEBHOOK_SECRET` *(optional)*, `JOB_INVOCATION_TOKEN` |

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

### Bootstrapping the reference database (`uk-location-reference`, #764)

A **second**, separate Neon project holds shared UK postcode/place reference data — its own schema
(`prisma/reference/schema.prisma`), its own migrations and its own generated client. See
`specs/architecture.md` §3.0 and `docs/developer-portal/runtime-pitfalls.md` for why it exists
and how it's reached (`lib/reference/` only). To populate it from empty in a new environment, in
this order, against that environment's `UK_LOCATION_REF_DIRECT_URL`:

```bash
npx prisma migrate deploy --schema prisma/reference/schema.prisma
npx prisma generate --schema prisma/reference/schema.prisma
npx tsx scripts/sync-reference-data.ts --env-file .env --source code-point-open
npx tsx scripts/sync-reference-data.ts --env-file .env --source os-open-names
```

Coverage defaults to `UK_LOCATION_REF_POSTCODE_AREAS`; pass `--areas` to override for a single run.
`.github/workflows/sync-reference-data.yml` runs the same script monthly and is also
`workflow_dispatch`-able per environment, so a fresh staging/production project does not strictly
need a manual first run — but nothing else in either deploy workflow does this for you.

That workflow needs **two differently-stored values** in the GitHub environment it targets, and
they are not interchangeable: `UK_LOCATION_REF_DIRECT_URL` as a **secret**, and
`UK_LOCATION_REF_POSTCODE_AREAS` as a **variable** (`vars.`, not `secrets.` — a coverage list is
not a credential, and a variable's value is readable, which makes it verifiable). Check both:

```bash
gh api repos/sriahead/aheed-online-store/environments/<env>/variables --jq '.variables[] | "\(.name)=\(.value)"'
gh api repos/sriahead/aheed-online-store/environments/<env>/secrets   --jq '.secrets[].name'
```

### Removing a postcode area, and checking coverage matches configuration

Configuration drives coverage in both directions, but **only the additive direction is automatic**.
A scheduled sync imports a newly configured area; nothing in it ever retires one that has been
removed, because every stage is scoped to the areas being imported. An unconfigured area therefore
sits frozen at whatever release imported it while its coverage row still claims authority over it —
so a postcode issued there afterwards is answered `INVALID` rather than `UNVERIFIED`.

```bash
# Always rehearse first — this is the only destructive mode in the project.
npx tsx scripts/sync-reference-data.ts --env-file .env --decommission --dry-run
npx tsx scripts/sync-reference-data.ts --env-file .env --decommission
```

It removes each unsupported area's coverage row **before** its data rows (so the area degrades to
`UNVERIFIED`, never through a window where it reads as `INVALID`), refuses outright when no areas
are configured, and is never passed by the scheduled workflow.

To check any environment's database against its configuration, including one that has never been
migrated:

```bash
npx tsx scripts/verify-reference-coverage.ts --env-file secrets/production.vars
```

Read-only, safe against production, and exits non-zero on drift in either direction. The deployed
equivalent is `/api/health`'s `reference` block, which reports the same comparison plus whether the
running Worker has a reference binding at all.

**An environment that has not yet run this bootstrap is not broken — it serves `UNVERIFIED` for
every postcode.** `lib/reference/postcode-reference-service.ts` treats an unconfigured, unreachable,
or never-synced reference database identically to an uncovered postcode area: the answer degrades to
"could not check," which the checkout and address-lookup surfaces render as manual entry being
available, never as a validation error.

**Production's reference branch (`ep-summer-boat-zapzp2t9`) had exactly this status from `#764`
until 2026-09-16**, when `#767` bootstrapped it: migrations applied, then `MK` and `RG` imported for
both sources — 16,215 and 23,816 postcodes, 9,989 and 13,483 places, four coverage rows and nothing
else. It matches the dev/staging branch row for row. Note the bootstrap was run **by hand against
`secrets/production.vars`, not by dispatching the workflow**: `sync-reference-data.yml` has never
existed on `main`, and GitHub resolves both `workflow_dispatch` and `schedule` from the default
branch, so neither the dispatch nor the monthly cron can fire until `#764` is promoted (**#772**).
Until then, every refresh of every environment is a manual run.

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

For a **dev** database there is no deployed host, so use the local preview origin and a distinct
subdomain for SriMart (reachable under `npm run preview` with a `Host:` header, the same way
`CLAUDE.md` checks SriMart's branding):

```bash
# dev
SEED_AHEED_HOST="localhost:8787" \
SEED_SRIMART_HOST="srimart.localhost:8787" \
npm run db:seed
```

- The SriMart demo vendor + its catalogue + its `VendorDomain` are seeded **only when both** vars are
  set — otherwise the DB could end up with 2 vendors but a missing host, which would send Aheed's own
  host to `/coming-soon`.
- A request host with no `VendorDomain` (and 2+ vendors) renders the `/coming-soon` page. With a
  single vendor, an unmatched host falls back to it (transition safety).
- The SriMart Worker custom domains (`srimart.nocaped.com`, `srimart-staging.nocaped.com`) are
  declared in `wrangler.toml` so `wrangler deploy` doesn't tear them down.

### Generated catalogue for scale testing (#489)

Two optional vars control a synthetic catalogue used to exercise the app at realistic row counts.
**Both are opt-in and Aheed-only** — SriMart deliberately stays small so a slow query measured
against Aheed is provably about row count rather than about multi-tenancy.

```bash
# add ~2,000 generated products to Aheed (dev databases only)
SEED_AHEED_HOST="localhost:8787" SEED_SRIMART_HOST="srimart.localhost:8787" \
SEED_SCALE_PRODUCTS=2000 npm run db:seed

# undo it — removes exactly the generated set, leaving curated products and all categories
SEED_AHEED_HOST="localhost:8787" SEED_SRIMART_HOST="srimart.localhost:8787" \
SEED_REMOVE_GENERATED=1 npm run db:seed
```

- Generated products carry a `gen-` slug prefix; that prefix is what both the idempotency check and
  the removal path key on. No curated fixture slug uses it.
- Re-running with the same `SEED_SCALE_PRODUCTS` creates no rows, so it is safe in a loop. The one
  write it can still make is the **net-content backfill** (`#877`): generated weight and volume packs
  carry net content (`250g`–`10kg`, `1L`/`2L`; `Pack of N` stays empty), and a re-run fills it on
  generated rows that predate it, then updates nothing on the run after. It only runs when
  `SEED_SCALE_PRODUCTS` is set — a plain `npm run db:seed` leaves generated rows untouched.
- Rows are **deterministic** — the same value always produces the same products — because the
  figures in `nfr-baseline.md` are only meaningful if the catalogue behind them is reproducible.
- Image objects are shared one-per-subcategory rather than one-per-product, so 2,000 products cost
  27 uploads, not 2,000. The seed prints its total `putObject` count on completion.
- **Use a dev database.** The seed prints the resolved host before the first generated write so it
  can be eyeballed; making it *refuse* a staging/production host outright is tracked as **#490**.

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

**Pair it with the DEV CDN host, not staging's.** `aheed-images-dev` is served by
`images.dev.aheedfoodcentre.nocaped.com`, which is the only one of the three CDN hostnames with **no
hotlink/referer rule** — that is what lets an image load under `npm run preview`, where the referer
is `http://localhost:3000`. The three hosts and their buckets are strictly paired:

| Environment | `S3_BUCKET` | `CDN_BASE_URL` | Hotlink rule |
|---|---|---|---|
| local dev | `aheed-images-dev` | `https://images.dev.aheedfoodcentre.nocaped.com` | none |
| staging | `aheed-images-staging` | `https://images.staging.aheedfoodcentre.nocaped.com` | yes |
| production | `aheed-images-production` | `https://images.aheedfoodcentre.nocaped.com` | yes |

```bash
S3_BUCKET="aheed-images-dev"
CDN_BASE_URL="https://images.dev.aheedfoodcentre.nocaped.com"
```

Mixing a row — the state `.env` and `.dev.vars` shipped in until P8.1b (#277) — gives you a bucket
whose objects the configured CDN host does not serve, so anything you seed or upload locally is
unreachable from the URL the app composes for it. Because the app only ever stores a **relative
key** and composes `${CDN_BASE_URL}/${key}` at read time, the symptom is a broken image with a
correct-looking key in the DB, not an error anywhere. Separately, pointing local dev at a
hotlink-protected host returns **403 for every image including the header logo** (#235), which looks
identical to a missing object.

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

### Scheduled jobs (P9.2, #618)

**`JOB_INVOCATION_TOKEN`** — one shared secret, held on **two different Workers**, which is the
part that is easy to get wrong.

The stranded-payment sweep runs on a Cron Trigger. The application Worker's entry is generated by
`opennextjs-cloudflare build` and exports only `fetch`, so there is nothing for a trigger to attach
to; the schedule therefore lives in a second, minimal Worker (`workers/scheduler/`) that calls back
into the app over HTTP. A cron has no session, so `requireVendorRole` cannot gate the route it
calls — this token stands in its place.

Set the **same value** on both Workers, per environment:

```bash
# the application Worker (verifies the header)
wrangler secret put JOB_INVOCATION_TOKEN --env <env>
# the scheduler Worker (sends the header)
wrangler secret put JOB_INVOCATION_TOKEN --config workers/scheduler/wrangler.toml --env <env>
```

Generate one with `openssl rand -hex 32`. It is a Cloudflare **Worker** secret in both cases, not a
GitHub environment secret: CI never sends it, and `.github/workflows/deploy-*.yml` deliberately do
not set it, so rotating it is a `wrangler` operation that needs no deploy.

> ⚠️ **A mismatch between the two is silent from the outside.** The scheduler's tick still runs, the
> route still answers, and every invocation simply returns `401` — so the symptom is that orders
> quietly stop being reconciled, with nothing failing anywhere a dashboard would show. If payment
> recovery appears to have stopped, compare the two secrets before looking anywhere else. The
> scheduler logs a `scheduled job … returned 401` line for exactly this case; `wrangler tail
> aheed-scheduler-<env>` is the fastest way to see it.

**In production the app refuses to start a sweep without it.** `getJobsEnv()` fails validation when
the token is absent under `NODE_ENV=production`, and the route returns `503` rather than running an
unauthenticated sweep. Locally, leaving it unset is fine and the route simply refuses.

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


---

## Config precedence, and the traps in it

Moved here from `CLAUDE.md` in #786, which now carries only the one-line rule and a pointer to this
section. All config goes through validated `lib/config` (zod); nothing reads `process.env` directly.

- All config through validated **`lib/config`** (zod). Precedence is the **Cloudflare request context
  first**, then `process.env` — `readEnv()` tries `getCloudflareContext()` and only falls through to
  `process.env` when there is no Worker request context. So under `npm run preview` (and on a real
  Worker) **`.dev.vars` wins**; `.env` wins only where no Cloudflare context exists — `next dev` and
  plain Node scripts (`prisma/seed.ts`, `scripts/*`, migrations). This line previously claimed the
  reverse ("`process.env` first … a stray `.dev.vars` can't shadow it"); it was wrong from the day
  `lib/config.ts` was written and was corrected during P4a's validation, where it mattered — see
  **#119**, where `.env` and `.dev.vars` point at *different Neon projects*, so a fixture script and
  the app under `preview` silently read different databases. Check both before trusting a live result.
- **The precedence above is per-key, not per-environment, and that distinction matters when you're
  deliberately trying to simulate a secret being unset.** `readEnv(key)`'s actual body falls through
  to `process.env[key]` whenever the Cloudflare-context value for *that key* isn't a non-empty
  string — not only when `getCloudflareContext()` itself throws. So commenting a secret out of
  `.dev.vars` alone does **not** simulate "unset" if `.env` still carries a real value for the same
  key: `next build` bakes `.env` into the built Worker's own `process.env` regardless of Cloudflare
  context, and `readEnv` silently prefers that leftover value the moment `.dev.vars`'s copy goes
  missing. Confirmed live at `#618`'s `/validate` (2026-09-06): commenting out `STRIPE_SECRET_KEY`
  in `.dev.vars` only, restarting `npm run preview`, and calling a route gated on
  `getPaymentEnv().STRIPE_SECRET_KEY` still ran as if the key were set — because `.env` still had
  it. The fix is to comment the secret out of **both** files before restarting; a single-file edit
  proves nothing here. This is a real deployed environment's behaviour too, not a local-only quirk —
  staging and production have no `.env` file at all, so this fallback path is dormant there, but
  local preview always has one and will use it the moment `.dev.vars` stops naming a key.
- **A `lib/config.ts` accessor that THROWS when its field is required-in-production (the
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`JOB_INVOCATION_TOKEN` pattern: a zod `superRefine`
  that adds an issue when `process.env.NODE_ENV === "production"` and the value is absent) makes
  that condition UNREACHABLE as a plain falsy check in any caller, because `NODE_ENV` is
  unconditionally `"production"` in every BUILT Worker this app ever runs in** — `npm run preview`
  included, not just staging/production — since `next build` sets it regardless of deploy target.
  A route written as `const { X } = getXEnv(); if (!X) { ...graceful handling... }` never reaches
  its own `if`: the accessor throws first, and the graceful branch is dead code that only "works"
  under `next dev` or a plain Node script, neither of which this class of route actually runs under.
  Found live at `#618`'s `/validate` (2026-09-06): `app/api/jobs/reconcile-payments/route.ts`'s own
  documented 503-on-missing-secret behaviour (R10, R23) was unreachable this way, reproducing as an
  uncaught `ZodError` (a bare 500) instead — and `app/api/webhooks/stripe/route.ts` has the
  identical latent defect for `STRIPE_WEBHOOK_SECRET`, pre-existing and unfixed (**#621**). **Any
  route that wants to treat "this required-in-production secret happens to be absent right now" as
  its own recoverable case — rather than the hard failure the accessor is designed to be — must
  catch the accessor's throw itself**, e.g. a small `readOptional(() => getXEnv())` wrapper, rather
  than assuming the accessor can hand back an empty value to check. Verify any such route's
  fail-closed branch live, under `npm run preview` with the secret genuinely unset in both `.env`
  and `.dev.vars` (see the bullet above) — a unit test against the schema alone proves the schema
  throws, never that the route calling it actually survives the throw.
- **Checking `.env` against `.dev.vars` is necessary but NOT sufficient — diff both against
  `secrets/staging.vars` and `secrets/production.vars` before any live-DB work.** Two files drift
  into agreement on the *wrong* target as easily as they drift apart from each other. At P5a's
  validation they agreed perfectly and both pointed at **production** (`ep-young-glitter-…`), while
  the surrounding config in the same file (`S3_BUCKET`, `CDN_BASE_URL`) correctly said *staging* —
  so nothing about the file looked wrong, and P5a's migration reached the production database ahead
  of its promotion PR. It was additive and provably harmless (row counts unchanged, no drift), but
  the same mistake against a destructive migration would not have been. **A "staging-sounding" file
  is not evidence the DB host is staging; only the host is.** `secrets/*.vars` are gitignored but
  present in a working checkout, which is what makes this a two-second check.
- `.env` format: no spaces around `=`, **quote values**, comments on their own line (a trailing
  `# comment` or leading space has silently broken connection strings here).
- Runtime secrets live in Cloudflare (`wrangler secret put NAME --env <env>`); CI secrets in GitHub
  environments. Never commit secrets; never read `DIRECT_URL` at runtime.
- **`wrangler secret list --env <env>` reports the SCRIPT's secrets, not the RUNNING version's
  bindings — so a secret can be listed there while the deployed Worker has no such binding at all,
  and every feature gated on it degrades silently.** Found 2026-09-16 (`#767`/`#771`): both
  `UK_LOCATION_REF_DATABASE_URL` and `UK_LOCATION_REF_POSTCODE_AREAS` appeared in
  `wrangler secret list --env staging`, while the Cloudflare API showed the *deployed* version
  (`f7e5c0ca…`, the CI deploy at `2026-09-16T06:55:51Z`) carrying 19 bindings with **neither among
  them** and no deployment event after that timestamp. Staging therefore answered `UNVERIFIED` for
  every postcode for a day while its reference database was perfectly healthy — the same two
  postcodes returned real data from `npm run preview` against that identical database. **Nothing
  logged**, because `lib/reference/`'s guard returns before it constructs a client, which is correct
  behaviour and exactly why the silence is total. **A secret added after the last deploy is not
  live until something deploys**; a `wrangler secret put` normally triggers that itself, but a
  dashboard edit or a `wrangler versions secret put` need not, and the listing looks identical
  either way. **To answer "does the running Worker actually have this binding?", read the deployed
  version**: `GET /accounts/<acct>/workers/scripts/<script>/deployments` →
  `result.deployments[0].versions[0].version_id` → `GET …/versions/<id>` and inspect
  `result.resources.bindings`. `npx wrangler deployments list` and `npx wrangler tail` both failed
  here with `fetch failed` from Git Bash while `wrangler secret list` and plain `curl` worked, so
  reach for the REST API rather than assuming the account is unreachable.
- **The SAME undeployed-version state has a second, LOUDER consequence the bullet above does not
  describe: it wedges CI outright, and the error blames secrets rather than deployment state.**
  A secret edited through the Cloudflare **dashboard** creates a new Worker version and does **not**
  deploy it. Every subsequent `wrangler secret put` against that Worker then fails:
  ```
  Secret edit failed. You attempted to modify a secret, but the latest version of your
  Worker isn't currently deployed.
  ```
  **Both `deploy-staging.yml` and `deploy-production.yml` OPEN their deploy step with
  `wrangler secret put`** (`CLOUDFLARE_ACCOUNT_ID`, then `CLOUDFLARE_API_TOKEN`, before
  `wrangler deploy` is reached), so a single dashboard edit fails **every future deploy on that
  environment** — including deploys carrying unrelated fixes — until the pending version is
  deployed. Found live 2026-09-16 (`#781`) during `#755`'s credential rotation: both deploy reruns
  failed this way, and because the message names *secrets*, the natural reading is "the token is
  wrong" rather than "an undeployed version exists". Nothing in the repository hinted otherwise.
  **Recover by deploying the pending version** — wrangler's own option (2):
  `npx wrangler versions deploy <version-id>@100 --env <staging|production>`, taking the newest
  version id from the REST API call in the bullet above. After that the workflow rerun succeeds
  normally. **Avoid the problem by not editing secrets in the dashboard at all**: use
  `node scripts/configure-env.mjs <staging|production>`, which writes through `wrangler secret put`
  and therefore deploys as it goes, updating the GitHub environment secrets in the same pass.
  `npx tsx scripts/verify-storage-credentials.ts` now reports this state (`STALE`) for both
  Workers, so it is detectable before the next deploy discovers it the hard way.
- **A GitHub Actions workflow reading `vars.X` sees nothing when the value was stored as a *secret*
  named `X`, and vice versa — they are two separate stores with no fallback between them.**
  `.github/workflows/sync-reference-data.yml` reads `secrets.UK_LOCATION_REF_DIRECT_URL` and
  `vars.UK_LOCATION_REF_POSTCODE_AREAS`; a first attempt at provisioning added *both* as secrets,
  and `UK_LOCATION_REF_DATABASE_URL` rather than `_DIRECT_URL` besides. The workflow would have
  materialised an env file with two empty values and failed closed at `npm run ref:migrate` on the
  next scheduled production run, which is the right direction but looks like a broken workflow
  rather than a missing variable. **Check both endpoints, not one**:
  `gh api repos/sriahead/aheed-online-store/environments/<env>/variables --jq '.variables[] | "\(.name)=\(.value)"'`
  and `… /environments/<env>/secrets --jq '.secrets[].name'`. Variable *values* are readable, which
  makes `UK_LOCATION_REF_POSTCODE_AREAS=MK,RG` verifiable rather than merely present — a reason to
  prefer a variable for anything that is not actually a credential.
- **A THIRD, related trap: a plain-text var added to a Worker only through the Cloudflare
  dashboard — never declared in `wrangler.toml`'s `[vars]`, never set via `wrangler secret put` —
  does NOT survive the next `wrangler deploy`, even though a genuine SECRET added the same way
  does.** `wrangler deploy` rebuilds a Worker version's `vars` set entirely from `wrangler.toml`;
  secrets are stored and reattached independently and are untouched by a deploy that doesn't
  explicitly change them. Found at this same slice's own `/validate` (2026-09-16, `#767`/`#771`):
  the fix for the `wrangler secret list` trap above (redeploying the dashboard-created version that
  carried both `UK_LOCATION_REF_DATABASE_URL` and `UK_LOCATION_REF_POSTCODE_AREAS`) worked, but a
  *routine* `deploy-staging` CI run afterward silently dropped `UK_LOCATION_REF_POSTCODE_AREAS`
  again — confirmed by reading the newly-deployed version's bindings via the Cloudflare API
  (`GET …/versions/<id>`, per the bullet above): `UK_LOCATION_REF_DATABASE_URL` (a real secret)
  was still there; `UK_LOCATION_REF_POSTCODE_AREAS` (converted to a plain-text variable during the
  original fix) was gone, and neither `wrangler.toml` nor either deploy workflow ever named it.
  This would have recurred on every future deploy. **The fix is to declare any non-secret,
  environment-wide config value in `wrangler.toml`'s `[env.<env>.vars]` block** (see
  `UK_LOCATION_REF_POSTCODE_AREAS` there) so it's part of committed config and rebuilt correctly on
  every deploy, rather than a fragile one-time dashboard edit — reserve `wrangler secret put` (or a
  dashboard-added secret) for values that are actually credentials.
- **`instrumentation.ts`'s `onRequestError` DOES have a working Cloudflare Workers request context
  under this app's Next 16 / OpenNext / Workers stack** — `getCloudflareContext()`/`readEnv()`
  resolve normally there, confirmed live in `#508` (2026-09-01): a forced throw under `npm run
  preview` reached a plain, uncached `PrismaClient` constructed inside the hook, and it resolved
  `DATABASE_URL` and wrote a real row on the first try. This was flagged as a genuinely unconfirmed
  risk at that slice's `/propose` (this repo has a documented history of Next-on-Workers behaviour
  not matching framework-documented semantics — `proxy.ts`, `edge` runtime, `@prisma/client/wasm`
  resolution, all elsewhere in this file), so `getPrismaUncached()` was built deliberately *not*
  wrapped in React's `cache()` to sidestep the question rather than gamble on it. The mitigation
  turned out not to be needed for context availability itself, but keep using an uncached client
  for any future `onRequestError` work anyway — `cache()`'s per-request de-dupe still isn't needed
  for a handler that only ever runs once per throw, and reaching for it would reopen a question
  that's now moot rather than genuinely require re-answering it.


### Local Stripe webhook testing — what actually goes wrong

The setup steps are in the "Stripe payments (P3c)" section above. What follows is the set of
failures that section does not prevent, moved here from `CLAUDE.md` in #786.

- **This repo's `.dev.vars` and `.env` both carry a real `STRIPE_SECRET_KEY` (test-mode) by
  default, so `npm run preview` does NOT run the stub payment adapter** — `lib/payments.ts` picks
  the stub only when the key is unset, and here it never is. Any spec's `validation.md` that writes
  "with no `STRIPE_SECRET_KEY` set, the stub adapter is active" (a reasonable-sounding default) is
  describing a hypothetical, not this environment: checking out in local preview redirects to real
  hosted Stripe Checkout, same as staging/production. Confirmed at P9.1's `/validate` (#427/#428,
  2026-08-29) — the guest-order-authorization slice's own `validation.md` assumed the stub path for
  its live rows; the actual redirect went to `checkout.stripe.com`. Where a live row needs the order
  a real checkout produced but not the payment itself, resolve the order directly against the dev
  database instead of relying on the stub's synchronous redirect — it exercises the same
  post-checkout code either way. Where a row genuinely needs the stub adapter (e.g. asserting the
  *fallback* URL shape itself, as opposed to what it leads to), that requires temporarily unsetting
  `STRIPE_SECRET_KEY` and restarting `npm run preview` — `.dev.vars` is read at Worker boot.
- **`stripe listen`'s webhook signing secret is per-invocation, not fixed** — it will differ from
  whatever is already sitting in `.dev.vars`'s `STRIPE_WEBHOOK_SECRET` (itself likely written down
  from a previous, different `stripe listen` session). A mismatch fails the webhook route's
  signature check silently from the outside: the Stripe test-card payment itself succeeds, the
  order sits forever in `PENDING_PAYMENT`, and nothing in the browser or `npm run preview` console
  says why. Before relying on a live checkout→webhook round-trip, start
  `stripe listen --forward-to <preview-url>/api/webhooks/stripe`, copy the secret it prints into
  `.dev.vars`, and **restart `npm run preview`** — `.dev.vars` is read at Worker boot, so editing it
  with the preview server already running has no effect until it restarts.
- **`stripe listen` only forwards events that occur while it is running.** A payment completed
  *before* starting the listener is not retroactively forwarded — `stripe events resend <id>`
  resends to a registered webhook **endpoint** in the Stripe dashboard, not to an ad-hoc CLI
  listener, so it doesn't help here either. Place a fresh order after `stripe listen` is confirmed
  ready (`Ready! ... webhook signing secret is whsec_...` in its output) rather than trying to
  recover an already-completed payment's event.
- **Resend's API rejects `to` addresses on unverified domains (`example.com` included) even in test
  mode**, so a live checkout using a demo account's `@example.com` address will genuinely fail to
  send — `lib/email.ts`'s try/catch swallows it correctly (this is what R20-style requirements are
  for), but it also means the actual outbound HTML is never observable this way. Confirmed in
  P7.5b's `/validate` (#262): the full webhook→confirm→email pipeline was proven live up to the
  point of the real Resend call; the literal HTML bytes still have to come from a unit test that
  parses the outbound request body, not from watching a real send succeed.
- **`npm run preview`'s local Worker exposes a queryable log of its own `console.*` output — use it
  instead of trying to read `npm run preview`'s own terminal, which interleaves the dev server's own
  noise with application logs and scrolls past whatever a webhook call just printed.** `wrangler dev`
  captures every request/console line into a local SQLite-backed store, queryable via
  `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with a body of
  `{"sql": "..."}` against a `logs` table (`ts_ms`, `level`, `message`, plus `trace_id`/`span_id`).
  This is what actually proves a `console.error` line's exact wording, that it fired exactly once,
  and that it did **not** fire on an adjacent case — filter on `level = 'error'` and a substring of
  the order number or session id. Used to confirm R23/R24/R31–R33 live for #429's webhook-binding
  slice (2026-08-29): a `binding-mismatch` refusal logs exactly the reason/event-type/order/session
  line the route promises, a duplicate delivery (`already-processed`) logs nothing, and no unrelated
  error fires alongside either. `GET .../cdn-cgi/local/explorer/api/local/workers` lists the other
  endpoints the same Explorer API exposes (KV, D1, R2, Durable Objects, Workflows).

