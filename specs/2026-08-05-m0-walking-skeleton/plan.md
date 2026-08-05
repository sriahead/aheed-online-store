# M0 — Walking Skeleton (plan)

**Goal:** de-risk the whole pivot by shipping the *smallest possible* app end-to-end, on real
infrastructure, before any feature work. Prove the pipeline, not the product.

**What it proves (and nothing more):**
- Next.js builds with `@opennextjs/cloudflare` and deploys to Cloudflare **Workers**.
- Custom domains resolve: `staging.aheedfoodcentre.nocaped.com` and `aheedfoodcentre.nocaped.com`.
- CI runs the SDD gate checks on PRs; push to `staging` auto-deploys; push to `main` waits for
  manual approval (GitHub `production` environment) then deploys.
- Prisma connects to **Neon** through the serverless driver adapter (pooled `DATABASE_URL`) at
  runtime, and `prisma migrate deploy` runs in CI against the **direct** `DIRECT_URL`.
- The full mandated flow works: `browser → Worker → service → repository → Prisma → Neon`.

**Deliberately excluded:** auth, catalogue, cart, checkout, real storage I/O, design system.
Storage is only *config-checked* (env presence), not exercised, so R2 permissions can't block the
first green deploy.

**Shape:** one `HealthCheck` model (one row), a `/` page and `/api/health` route that read it back.
