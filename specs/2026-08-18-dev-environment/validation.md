# Local dev environment tier — per-developer Neon branch (validation)

**Precondition for R9/R10**: confirm both human-provisioning items from #226 are complete — Neon
Console/CLI access to create a branch off the staging project, and the `aheed-images-dev` R2 bucket
exists with S3-compatible credentials available. If either is missing, R1–R8, R11, R12 can still be
validated; R9/R10 cannot and should be reported as blocked, not skipped silently.

| Req | How to verify |
|-----|---------------|
| R1  | `docs/env-setup.md` contains a `dev` section naming: Neon Console → Branches → Create Branch off staging's default branch; a `dev-<you>` naming example; where to find the branch's pooled/direct connection strings; delete-and-recreate as the reset method; and the exact command `DIRECT_URL=<branch-direct-url> npx prisma migrate deploy` for applying a pending local migration. |
| R2  | The same section states a fresh branch already has staging's schema and seed/demo data at creation time, and that `db:seed`/`demo:accounts` are not needed for the common case. |
| R3  | The same section names `aheed-images-dev` as the `dev` object storage bucket and states it is shared across all developers, not one per developer. |
| R4  | The same section contains an explicit "local-only" statement: no `wrangler.toml` env block, no Worker deploy, no custom domain, no CI workflow, no GitHub environment secrets, not configured via `scripts/configure-env.mjs`. |
| R5  | `git diff` (or `git show`) on `docs/env-setup.md`'s front-matter shows `version` greater than `1.7.0` and `updated` set to this slice's merge date. |
| R6  | `.env.example` shows `S3_BUCKET=` with example value `aheed-images-dev`, and a comment referencing `docs/env-setup.md`'s `dev` section. |
| R7  | `.dev.vars.example` shows `S3_BUCKET=` with example value `aheed-images-dev`, and the same pointer comment. |
| R8  | `git diff origin/staging...HEAD -- scripts/configure-env.mjs wrangler.toml` is empty for this slice's branch. |
| R9  | With a personal branch created per R1 and `.env`/`.dev.vars` pointed at its `DATABASE_URL`/`DIRECT_URL` and `S3_BUCKET=aheed-images-dev`: `npm run preview`, then load `http://localhost:8787/` (or the printed preview URL) — the storefront home page renders and at least one catalogue product is visible. Confirm no `npm run db:seed` was run against this branch. |
| R10 | Insert a uniquely-labelled `HealthCheck` row into the branch only, e.g.: `DIRECT_URL=<branch-direct-url> npx tsx -e "import {PrismaClient} from '@prisma/client'; import {PrismaNeon} from '@prisma/adapter-neon'; const p=new PrismaClient({adapter:new PrismaNeon({connectionString:process.env.DIRECT_URL})}); await p.healthCheck.create({data:{label:'dev-iso-check-2026-08-18'}}); process.exit(0)"`. Then, against the running local preview: `curl -s http://localhost:8787/api/health \| jq '.db.label'` → `"dev-iso-check-2026-08-18"`; and `curl -s https://staging.aheedfoodcentre.nocaped.com/api/health \| jq '.db.label'` → **not** `"dev-iso-check-2026-08-18"`. |
| R11 | `CHANGELOG.md` diff shows a new entry naming this slice and `#226`. |
| R12 | `npm run lint && npm run typecheck && npm run test && npm run format:check` all exit 0. |
