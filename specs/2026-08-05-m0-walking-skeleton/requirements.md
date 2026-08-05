# M0 — Walking Skeleton (requirements / acceptance criteria)

R1. `npm ci && npm run typecheck && npm test` pass locally and in CI.
R2. A PR into `staging` or `main` triggers `gates.yml`; a red check blocks merge.
R3. `CHANGELOG.md` must be updated on the branch (Gate 4 check enforces this).
R4. Pushing to `staging` deploys the Worker to `staging.aheedfoodcentre.nocaped.com`.
R5. Merging to `main` pauses for manual approval, then deploys to `aheedfoodcentre.nocaped.com`.
R6. `GET /api/health` returns HTTP 200 with `db.ok = true` on both environments.
R7. The `/` page shows "Database: connected ✓" (browser → Worker → Prisma → Neon).
R8. Migrations run in CI against the environment's Neon branch via `DIRECT_URL`; runtime uses the
    pooled `DATABASE_URL`. No plain `pg`/TCP anywhere at runtime.
R9. No secrets are committed; runtime secrets live in Cloudflare, CI secrets in GitHub envs.
