# P9.2 — Production deployment safety (requirements / acceptance criteria)

Closes **#434** (production deployment is not migration-safe: `prisma migrate deploy` runs before
`opennextjs-cloudflare build`, so a build failure leaves production on a migrated schema running the
previous bundle) and **#435** (the production deploy path runs no lint, format, typecheck or test
step, because `gates.yml` triggers on `pull_request` only). The five shared checks move into one
reusable `workflow_call` workflow that both `gates.yml` and `deploy-production.yml` invoke, so the
production path cannot be weaker than the pull-request path. Narrative and rejected alternatives:
`plan.md`. This slice touches only workflow YAML and `CHANGELOG.md` — no application code, no schema
change, no migration.

R1. `.github/workflows/quality.yml` exists, and its `on:` block contains `workflow_call` and no
    other trigger.

R2. `quality.yml` runs all five of `npm run db:generate`, `npm run lint`, `npm run format:check`,
    `npm run typecheck` and `npm test` as `run:` steps within a single job.

R3. `.github/workflows/gates.yml` contains no `run:` step that invokes `lint`, `format:check`,
    `typecheck`, `test` or `db:generate`; it reaches those checks only through a job whose `uses:`
    value is `./.github/workflows/quality.yml`.

R4. `gates.yml` still performs both the KMS `ARTIFACT_INDEX.md` staleness check and the Gate 4
    CHANGELOG diff, and the job containing them declares a `needs:` dependency on the job that calls
    `quality.yml`.

R5. `.github/workflows/deploy-production.yml` contains a job whose `uses:` value is
    `./.github/workflows/quality.yml`, and its deploying job declares a `needs:` dependency on that
    job.

R6. In `deploy-production.yml`, the step running `opennextjs-cloudflare build` appears before the
    step running `prisma migrate deploy`.

R7. In `.github/workflows/deploy-staging.yml`, the step running `opennextjs-cloudflare build`
    appears before the step running `prisma migrate deploy`.

R8. `deploy-staging.yml` contains no `uses:` reference to `./.github/workflows/quality.yml` (the
    scope boundary from `plan.md`: staging keeps its fast deploy loop).

R9. No line in `deploy-production.yml` claims that the `production` environment has required
    reviewers or an enforced manual approval gate; the `environment: production` line's comment
    instead records that no approval gate is enforced on the repository's current plan.

R10. On a scratch branch whose `deploy-staging.yml` trigger is temporarily pointed at that branch
     and which carries a deliberate build-breaking change, the resulting workflow run concludes
     `failure` at the build step, and the "Apply migrations" step reports a status of `skipped` —
     i.e. it never started. (This is the live proof of R7's ordering; see `plan.md` for why the
     production workflow's own trigger cannot be exercised before merge.)

R11. The `gates` workflow run on this slice's own pull request concludes `success`, with the
     reusable `quality.yml` job visible as a separate completed job in that run.

R12. `CHANGELOG.md` updated (Gate 4).

R13. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
