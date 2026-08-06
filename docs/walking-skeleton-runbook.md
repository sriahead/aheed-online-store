# Walking-Skeleton Runbook (M0)

Follow once. When the health check is green on production, the infrastructure is trusted and P0+
feature work begins through the normal SDD gates.

## 0. Prerequisites (from the pivot guide, Step 0)
Cloudflare account + `nocaped.com` zone; R2 **enabled** (needs a payment method on file even on the
free tier) with two buckets created (`wrangler r2 bucket create <name>` or via dashboard); Cloudflare
API token. GitHub `staging` + `production` environments. Neon project with a `staging` branch
(and a separate branch/DB for `production` — don't reuse the staging DB); pooled + direct URLs for
each branch.

> **Known gap:** a required-reviewer approval gate on the `production` GitHub environment needs a
> paid GitHub plan (or a public repo) — `gh api ... environments/production` returns a 422 on this
> repo's plan. `deploy-production` currently runs straight through with no pause. Treat PR review as
> the real gate until this is resolved (see `CLAUDE.md`).

## 1. Create the repo and push `main`
```bash
git init -b main
git add .
git commit -m "chore(m0): walking skeleton — Cloudflare Workers + Neon end-to-end"
gh repo create aheed-online-store --private --source=. --remote=origin --push
# (or create the repo in the GitHub UI and: git remote add origin … ; git push -u origin main)
```

## 2. Generate the first migration (locally, once) and commit it
```bash
cp .env.example .env         # fill DATABASE_URL (pooled) + DIRECT_URL (direct) for the STAGING branch
npm install
npx prisma migrate dev --name init   # creates prisma/migrations/* and applies to the staging branch
npm run db:seed                      # inserts one HealthCheck row
git add prisma/migrations && git commit -m "chore(m0): initial migration + seed"
```

## 3. Set secrets
- **GitHub** (repo → Settings → Environments): for `staging` and `production` add
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `DIRECT_URL` (that env's Neon branch).
- **Cloudflare** (runtime, per env): `wrangler secret put DATABASE_URL --env staging` (pooled url),
  and the same for production. Add `S3_*` / `CDN_BASE_URL` when you start exercising storage.

## 4. Deploy staging
```bash
git switch -c staging && git push -u origin staging
```
Watch **Actions → deploy-staging**: migrate → build → deploy. Then:
```bash
curl -s https://staging.aheedfoodcentre.nocaped.com/api/health
```
Expect `200` and `"db":{"ok":true,…}`. Open the domain in a browser → "connected ✓".

## 5. Promote to production
Open a PR `staging → main`, review it, merge it. **Actions → deploy-production** runs immediately
(no approval pause — see the known gap above). It migrates the production Neon branch and deploys
to `aheedfoodcentre.nocaped.com`. Verify `/api/health` there.

Both `staging` and `production` need **two separate secret stores** populated, not one:
- **GitHub Actions secrets** (Settings → Environments → `staging`/`production`):
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DIRECT_URL` — used only for the CI job
  (`prisma migrate deploy`, `wrangler deploy` auth).
- **Cloudflare Worker runtime secrets** (`wrangler secret put NAME --env <env>`, or Worker →
  Settings → Variables and Secrets in the dashboard — **not** the account-wide "Secrets Store"
  product, which needs an explicit `wrangler.toml` binding to reach the Worker): `DATABASE_URL` at
  minimum. Setting the GitHub secrets does **not** populate these — forgetting this step is the
  most common way `/api/health` comes back `db.ok: false` with a Zod "DATABASE_URL required" error
  right after a deploy that otherwise looks green.

## 6. Done → start P0
Tick the M0 issue's gate checklist, move the card to **Done**. From here every change goes through
feature branch → Propose → Spec → Validate → Changelog → PR → staging → approved prod.

## Expected things to debug on first run (all normal for a skeleton)
- **`DATABASE_URL` undefined on the Worker** → confirm you ran `wrangler secret put … --env <env>`
  (the *Worker* secret, not just the GitHub Actions one — see the two-secret-stores note above);
  `lib/config` already falls back to `getCloudflareContext().env`.
- **`PrismaNeon` type/args error** (`Type 'Pool' has no properties in common with type 'PoolConfig'`)
  → `@prisma/adapter-neon` builds its own `Pool` internally; construct as
  `new PrismaNeon({ connectionString })`, not `new PrismaNeon(pool)`.
- **`driverAdapters` preview error** → you're on Prisma 6 (GA); remove the preview flag (already removed).
- **`[unenv] fs.readdir is not implemented yet!`** at query time → `prisma/schema.prisma`'s
  `generator client` needs `engineType = "client"`. The default `"library"` engine locates its
  native binary via `fs.readdir`, unsupported by workerd's `nodejs_compat` polyfill.
- **`[unenv] fs.readFileSync is not implemented yet!`** at query time, even with `engineType =
  "client"` set → `lib/db.ts` must import `PrismaClient` from **`@prisma/client/wasm`** explicitly,
  not the bare `@prisma/client` specifier. Next's build-time file tracer runs in real Node, so a bare
  specifier resolves via the package's `"node"` export condition (the `fs.readFileSync`-based
  loader) even though the code runs in workerd.
- **`next build` fails with `Module not found: Can't resolve '@prisma/client/wasm'`** (Next 16+) →
  Turbopack (Next 16's default bundler) can't resolve that subpath export even though webpack and
  the package's `exports` map both handle it fine. `dev`/`build` scripts pin `next ... --webpack`.
- **`nodejs_compat` errors** → keep the flag + a recent `compatibility_date` in `wrangler.toml`.
- **Static-render tried to hit the DB at build** → the pages already set `dynamic = "force-dynamic"`.
- **R2 bucket bind fails with `Please enable R2 through the Cloudflare Dashboard [code: 10042]`** →
  R2 needs enabling account-wide first (dash.cloudflare.com → R2), then the bucket(s) need creating
  — binding a bucket in `wrangler.toml` doesn't create it.
- **`npm ci` fails in CI with a lockfile mismatch you can't repro locally** → check for an
  "extraneous" (undeclared) transitive dependency via `npm ls <pkg>` — e.g. vitest 4/vite 8 can
  leave `esbuild` extraneous, which makes `npm install` write an incomplete cross-platform
  `package-lock.json` on some OSes. Pin the package as an explicit `devDependency` to fix it.
- **`curl`/automated health checks get an Cloudflare "Just a moment..." challenge page** → that's
  Bot Fight Mode / a Managed Challenge on the zone, not an app error. Check from a real browser, or
  `wrangler tail --env <env>` for live logs.
