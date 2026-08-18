# Local dev environment tier — per-developer Neon branch (requirements)

Closes #226: adds a local-only "dev" environment tier so local validation stops reading/writing the
staging Neon database directly. Builds on `env-setup` (the existing staging/production runbook) and
`neon-db-separation` (#56, which established one-Neon-project-per-environment for staging/prod — this
slice adds a per-*developer* branch underneath that, not a third project). No application code
change; no deployment surface.

R1. `docs/env-setup.md` contains a new section documenting the `dev` tier that covers: creating a
    personal Neon branch off the **staging** project's default branch (Console: Branches → Create
    Branch), naming it `dev-<you>`; retrieving that branch's pooled (`DATABASE_URL`) and direct
    (`DIRECT_URL`) connection strings; resetting via delete-and-recreate; and applying a
    locally-authored, not-yet-merged Prisma migration to the branch with
    `DIRECT_URL=<branch-direct-url> npx prisma migrate deploy`.

R2. The same `docs/env-setup.md` section states that a fresh branch inherits staging's schema and
    seed/demo data at creation time (Neon's copy-on-branch behaviour), so no `db:seed` or
    `demo:accounts` step is needed for the common case of just wanting a working local database.

R3. The same section documents the shared `aheed-images-dev` R2 bucket as the local `dev` object
    storage target, explicitly stating it is **one bucket shared by every developer**, not
    per-developer.

R4. The same section explicitly states `dev` is **local-only**: no `wrangler.toml` `[env.dev]`
    block, no Cloudflare Worker deploy, no custom domain, no CI workflow, no GitHub environment
    secrets, and it is not configured through `scripts/configure-env.mjs`.

R5. `docs/env-setup.md`'s front-matter `version` is bumped above its current `1.7.0` and `updated`
    is set to the date of this change.

R6. `.env.example`'s `S3_BUCKET=` example value is `aheed-images-dev` (was
    `aheed-images-staging`), and the file contains a comment pointing to `docs/env-setup.md`'s new
    `dev` section for how to obtain a personal branch's `DATABASE_URL`/`DIRECT_URL`.

R7. `.dev.vars.example`'s `S3_BUCKET=` example value is `aheed-images-dev` (was
    `aheed-images-staging`), with the same pointer comment as R6.

R8. `git diff` for this slice shows no changes to `scripts/configure-env.mjs` (its `VALID_ENVS`
    stays exactly `["staging", "production"]`) and no changes to `wrangler.toml` (no `[env.dev]`
    block, no new routes or `r2_buckets` entries).

R9. A personal Neon branch created per R1's documented steps boots the app via `npm run preview`
    (local `.env`/`.dev.vars` pointed at that branch's connection strings and the `aheed-images-dev`
    bucket) and renders the storefront home page with at least one catalogue product visible — no
    `db:seed` run against the branch.

R10. The personal branch is a database distinct from staging: a `HealthCheck` row with a unique
     marker label inserted only into the branch (via a local script against the branch's
     `DIRECT_URL`) is returned by a local request's `/api/health` (`db.label` equals the marker), and
     staging's own `/api/health` (`https://staging.aheedfoodcentre.nocaped.com/api/health`) does
     **not** return that marker.

R11. `CHANGELOG.md` updated (Gate 4), referencing #226.

R12. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.

<!--
  R9 and R10 depend on the two human-only provisioning items tracked in #226 (Neon branch-creation
  access; the aheed-images-dev bucket) — they cannot be validated until both exist. See plan.md's
  "Open items carried forward".
-->
