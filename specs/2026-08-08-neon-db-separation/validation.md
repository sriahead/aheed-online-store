# ADR-004 slice 0 — Separate staging/production Neon databases (validation)

Before starting, capture a production baseline for R5:
`curl -s https://aheedfoodcentre.nocaped.com/api/health | tee prod-health-before.json`
(note its `db.label`), and record the prod catalogue product count.

| Req | How to verify |
|-----|---------------|
| R1  | With `DIRECT_URL` set to the new staging project's direct URL: `npx prisma migrate deploy` exits 0 listing applied migrations; run it again → prints `No pending migrations to apply.` (Also runs automatically in the `deploy-staging.yml` "Apply migrations" step on merge to `staging`.) |
| R2  | `curl -s -o /dev/null -w "%{http_code}\n" https://staging.aheedfoodcentre.nocaped.com/api/health` prints `200`, and `curl -s https://staging.aheedfoodcentre.nocaped.com/api/health \| jq '.db.ok'` prints `true`. |
| R3  | After `DIRECT_URL=<staging-direct> npm run db:seed`: `curl -s https://staging.aheedfoodcentre.nocaped.com/api/health \| jq '.db.label'` is non-null; the staging catalogue/browse page lists ≥1 product (open it, or assert a product route returns 200). |
| R4  | After `DIRECT_URL=<staging-direct> DEMO_ACCOUNT_PASSWORD=… npm run demo:accounts -- add`: on staging, sign in as `demo-admin@example.com` and `demo-customer@example.com`. Loading `/dev` as demo-admin shows the diagnostics page; as demo-customer shows the "administrators only" message. (Mirrors the dev-view slice's R3/R4 checks; tool per #57.) |
| R5  | On production (no tool run needed — prod DB untouched by the split): sign in as `demo-admin@example.com` succeeds and `/dev` renders. |
| R6  | Insert a marker into **staging** only: `DIRECT_URL=<staging-direct> npx tsx -e "import {PrismaClient} from '@prisma/client'; import {PrismaNeon} from '@prisma/adapter-neon'; const p=new PrismaClient({adapter:new PrismaNeon({connectionString:process.env.DIRECT_URL})}); await p.healthCheck.create({data:{label:'iso-check-2026-08-08'}}); process.exit(0)"`. Then `curl -s https://staging.aheedfoodcentre.nocaped.com/api/health \| jq '.db.label'` → `"iso-check-2026-08-08"`; `curl -s https://aheedfoodcentre.nocaped.com/api/health \| jq '.db.label'` → **not** `"iso-check-2026-08-08"`. |
| R7  | `curl -s https://aheedfoodcentre.nocaped.com/api/health \| jq '.db.ok'` prints `true`; its `db.label` equals the value in `prod-health-before.json`; prod catalogue product count equals the pre-slice count. |
| R8  | `docs/env-setup.md` contains a "one Neon project per environment" statement and a fresh-DB `npm run db:seed` bootstrap step; `git diff` shows its front-matter `version`/`updated` bumped. |
| R9  | `CHANGELOG.md` diff shows a new entry naming this slice and `#56`. |
| R10 | `npm run lint && npm run typecheck && npm run test && npm run format:check` all exit 0. |
