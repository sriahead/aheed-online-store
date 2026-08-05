# Walking-Skeleton Runbook (M0)

Follow once. When the health check is green on production, the infrastructure is trusted and P0+
feature work begins through the normal SDD gates.

## 0. Prerequisites (from the pivot guide, Step 0)
Cloudflare account + `nocaped.com` zone; two R2 buckets + S3 API token; Cloudflare API token.
GitHub `staging` + `production` environments (production has a **required reviewer**). Neon project
with a `staging` branch; pooled + direct URLs for each branch.

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

## 5. Promote to production (proves the approval gate)
Open a PR `staging → main`, merge it. **Actions → deploy-production** will show **Waiting** —
approve it (you're the required reviewer). It migrates the production Neon branch and deploys to
`aheedfoodcentre.nocaped.com`. Verify `/api/health` there.

## 6. Done → start P0
Tick the M0 issue's gate checklist, move the card to **Done**. From here every change goes through
feature branch → Propose → Spec → Validate → Changelog → PR → staging → approved prod.

## Expected things to debug on first run (all normal for a skeleton)
- **`DATABASE_URL` undefined on the Worker** → confirm you ran `wrangler secret put … --env <env>`;
  `lib/config` already falls back to `getCloudflareContext().env`.
- **`PrismaNeon` type/args error** → adjust the constructor to your adapter version (see `lib/db.ts`).
- **`driverAdapters` preview error** → you're on Prisma 6 (GA); remove the preview flag (already removed).
- **`nodejs_compat` errors** → keep the flag + a recent `compatibility_date` in `wrangler.toml`.
- **Static-render tried to hit the DB at build** → the pages already set `dynamic = "force-dynamic"`.
