# ADR-004 slice 0 — Separate staging/production Neon databases (requirements)

Closes out the environment-isolation prerequisite of ADR-004 (`adr-004-multi-tenancy`, issue #56,
parent #49): staging and production no longer share one Neon database. Production stays on the
existing project untouched; staging moves to a fresh Neon project, is migrated and seeded, and is
proven to be a different database from production. Builds on `env-setup` and the existing
`deploy-staging.yml` migrate step. No application code or schema change in this slice.

R1. `prisma migrate deploy` run against the new staging project's `DIRECT_URL` reports every
    migration applied and none pending (a second immediate run prints "No pending migrations to
    apply.").

R2. Staging `/api/health` (`https://staging.aheedfoodcentre.nocaped.com/api/health`) returns HTTP
    200 with `db.ok: true`.

R3. The new staging project is seeded: staging `/api/health` returns a non-null `db.label`, and the
    staging catalogue page renders at least one product.

R4. Demo accounts exist on the new staging project, provisioned by the demo-accounts tool (#57,
    `npm run demo:accounts -- add`) rather than by hand: `demo-admin@example.com` (role ADMIN) and
    `demo-customer@example.com` (role CUSTOMER) can sign in on staging, and loading `/dev` as
    `demo-admin@example.com` renders the diagnostics page (not the "administrators only" message).

R5. Production demo accounts remain functional after the split (prod DB is untouched, so its
    pre-existing accounts are unaffected): signing in as `demo-admin@example.com` on production still
    succeeds and `/dev` renders there. (Codifying/reconciling prod demo accounts via the tool is the
    #57 slice's rollout, not this slice.)

R6. Isolation is proven: after inserting a `HealthCheck` row with a unique marker label
    (e.g. `iso-check-2026-08-08`) into the **staging** project, staging `/api/health` returns that
    exact label in `db.label`, and production `/api/health` returns a `db.label` that is **not** the
    marker — demonstrating the two environments query different databases.

R7. Production is untouched: production `/api/health`
    (`https://aheedfoodcentre.nocaped.com/api/health`) returns HTTP 200 `db.ok: true`, and its
    `db.label` and catalogue product count are unchanged from a snapshot taken before this slice.

R8. `docs/env-setup.md` documents the one-Neon-project-per-environment topology (staging project is
    distinct from production; the shared-database arrangement has ended) and the one-time
    `npm run db:seed` bootstrap step for a fresh environment database, with its `version`/`updated`
    front-matter bumped.

R9. `CHANGELOG.md` updated (Gate 4), referencing #56.

R10. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice (Gate 3).
