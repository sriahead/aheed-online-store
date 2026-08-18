# Local dev environment tier — per-developer Neon branch (build notes)

Written at the end of Build, before the Clear. Closes #226.

## What changed and why

Docs-only slice — no application code, no schema change, matching `plan.md`'s scope.

- **`docs/env-setup.md`** gained a new `## Local development (dev)` section, inserted right after
  the existing "Per-vendor branding/config/delivery" subsection and before "### Auth cookie
  scoping" — that placement keeps it grouped with the other DB/environment-topology material rather
  than the secrets-store mechanics above it. It covers: creating a personal Neon branch off
  **staging**'s default branch via the Neon Console (`dev-<you>` naming), where to find the branch's
  pooled/direct connection strings, reset by delete-and-recreate, applying a locally-authored,
  not-yet-merged Prisma migration to the branch, the fact that a fresh branch already carries
  staging's schema + seed/demo data (so no `db:seed`/`demo:accounts` run is needed for the common
  case), the shared `aheed-images-dev` R2 bucket, and an explicit "local-only" statement (no
  `wrangler.toml` env block / deploy / CI / GitHub environment / `configure-env.mjs`). Front-matter
  bumped `1.7.0` → `1.8.0`, `updated` → `2026-08-18`, `related` gained `dev-environment`.
- **`.env.example`** / **`.dev.vars.example`**: `S3_BUCKET`'s example value changed from
  `aheed-images-staging` to `aheed-images-dev`, plus a comment pointing at the new doc section. This
  is the concrete fix for the actual problem #226 exists to solve — these files are what a developer
  copies for local work, and their old placeholder value pointed straight at staging's own bucket.
- **`CHANGELOG.md`**: new `### Docs` entry under `[Unreleased]`, referencing #226.
- **`scripts/configure-env.mjs`** and **`wrangler.toml`** deliberately untouched — confirmed via
  `git diff --numstat` showing no lines changed in either file (satisfies R8's git-diff-emptiness
  check).

## Decisions taken during the build

- **Section placement in `docs/env-setup.md`** wasn't specified by the spec beyond "a new section" —
  placed it beside the other Neon-topology content (isolation, bootstrapping, per-vendor mapping,
  branding) rather than up near the secrets-store table at the top, since a reader looking for "how
  do environments relate to each other" is more likely scanning that neighbourhood than the
  GitHub/Cloudflare secrets-routing mechanics.
- **`docs/env-setup.md`'s `summary` front-matter field had to be rewritten**, not just extended — the
  first draft appended dev-tier language to the existing sentence and blew past the KMS validator's
  300-character cap (`npx tsx kms/schema/validate.ts` failed with `summary: String must contain at
  most 300 character(s)`). Rewrote it tighter rather than trimming word-by-word: dropped the
  itemised secrets-store/demo-accounts/host-mapping/branding list in favour of "per-vendor
  host/branding/auth-cookie setup", which still describes the file's scope without enumerating every
  subsection by name. Re-ran the validator after — `invalid front-matter (failing): 0`.

## Deviations from the spec

None. All of R1–R8, R11, R12 were built and verified as written in `requirements.md`; R9/R10 are not
deviations, they're the spec's own explicitly-anticipated deferral (see `validation.md`'s
precondition note and "Known-shaky areas" below) — not something Build silently skipped.

## Known-shaky areas

- **R9 and R10 are unvalidated.** They require a real personal Neon branch, which needs a human to
  actually create one via the Console (this session has no Neon account access). The user confirmed
  during this conversation that they've created the `aheed-images-dev` R2 bucket (one of the two
  `/propose`-time provisioning items), but has **not** yet confirmed creating a personal branch or
  having verified Neon Console/CLI access. `/validate` should treat R9/R10 as blocked-not-failed
  until that branch exists, per `validation.md`'s precondition note, and should re-check whether it's
  been created by the time validation runs.
- **Neon plan/branch-limit is still unverified** (carried from `plan.md`'s "Open items carried
  forward") — filed as its own follow-up issue, **#227**, so it doesn't get lost once this
  conversation's context is gone: check the account's actual Neon plan and branch cap before more
  than one or two developers adopt this workflow, since a low cap would be a real constraint on the
  "one branch per developer" design, not a documentation gap.
- **The Console-first instructions in `docs/env-setup.md` were written from Neon's general product
  behaviour, not exercised against the real staging project in this session** (no credentials
  available here) — if the actual Console UI differs in a way that makes the steps wrong (renamed
  buttons, a changed flow), that would only surface once someone follows them for real. The `neonctl`
  CLI mention is deliberately hedged ("see `neonctl branches create --help`") for the same reason —
  its exact flags were never run or verified.
- **`format:check` reports 182 files with style issues repo-wide** — none of them are files touched
  in this slice (confirmed via `grep` over the `format:check` output for this slice's filenames), and
  it matches `CLAUDE.md`'s documented `core.autocrlf` false-positive pattern rather than drift this
  slice introduced. Worth re-confirming at `/validate` if that guidance is ever found to be wrong.
