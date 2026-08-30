---
id: p9-2-deployment-safety-plan
title: "P9.2 — Production deployment safety (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-30
visibility: internal
summary: "Stops a failed build from leaving production on a newly migrated schema, and makes the production deploy path run the same quality checks as a PR by extracting them into one reusable workflow both paths call."
tags: [devops, ci-cd, deployment, migrations, p9]
related: [roadmap]
---

# P9.2 — Production deployment safety (plan)

First slice of **P9.2 — Production infrastructure & reliability**, closing **#434** and **#435**.
Both edit the same workflow file and the fix for one determines where the other's step has to sit,
so they are one slice rather than two.

**Goal:** make it structurally impossible for (a) a failed build to leave production on a migrated
schema it isn't running, and (b) code to reach production without the lint/format/typecheck/test
checks a pull request already runs.

## What is actually wrong today

Read from the workflows, not from the issue text:

- `.github/workflows/deploy-production.yml` runs `npx prisma migrate deploy` **before**
  `npx opennextjs-cloudflare build`. A build failure therefore leaves the production database
  migrated while the Worker continues serving the previous bundle. The adapter build is not a
  formality — CLAUDE.md records a root `proxy.ts` that passed `next build`, `lint`, `typecheck` and
  every test, and failed *only* when `opennextjs-cloudflare build` ran.
- That workflow runs no `lint`, `format:check`, `typecheck` or `test` step at all. `gates.yml`
  triggers on `pull_request` only, so nothing quality-related runs on a push to `main`. Observed
  live on 2026-08-30: PR #471's `deploy-production` ran migrate-then-build with no checks.
- `.github/workflows/deploy-staging.yml` has the **identical** ordering defect. #434 names only
  production, but staging is the rehearsal environment — leaving it inverted means the place that
  would normally surface this problem can still end up migrated-but-not-built.
- `deploy-production.yml` carries the comment
  `environment: production # 'production' env has REQUIRED REVIEWERS -> manual approval gate`.
  **This is false.** Per CLAUDE.md, required-reviewer protection needs a paid plan for private
  repos and was rejected with a 422 on this repo. A comment asserting a safety control that does
  not exist is the same failure mode as the four repository docstrings that asserted an unenforced
  invariant (CLAUDE.md, repository layer) — it reads as a guarantee to the next person.

**Scope (this slice):**

- **New `.github/workflows/quality.yml`**, `on: workflow_call` only, holding the five checks that
  both paths need: `db:generate`, `lint`, `format:check`, `typecheck`, `test`.
- **`gates.yml`** stops defining those five itself and calls `quality.yml`. Its two PR-only steps —
  the KMS `ARTIFACT_INDEX.md` staleness check and the Gate 4 CHANGELOG diff — stay inline in a
  second job gated on `needs:`, because both need a `base_ref` that a `push` event does not have.
- **`deploy-production.yml`** gains a job calling `quality.yml`; its deploy job declares `needs:` on
  it, so a failing check stops the deploy before anything mutates.
- **`deploy-production.yml` and `deploy-staging.yml`** both reorder to **build → migrate → deploy**.
- The false `REQUIRED REVIEWERS` comment is corrected to state what is actually true.

## Why these choices

**One reusable workflow rather than duplicated steps.** Copying the five steps into
`deploy-production.yml` is the smaller diff, but it creates two definitions that drift the moment a
check is added to one and not the other — and the entire point of #435 is that the production path
must not be weaker than the PR path. Reuse-before-create is a CLAUDE.md rule. Adding
`workflow_call` to `gates.yml` itself and calling it whole was the third option, rejected because
its two PR-only steps would each need an event conditional; the conditionals end up more fragile
than the extraction.

**The cost, stated plainly:** a `uses:` at job level is a separate job, so `gates` becomes two jobs
and pays a second `actions/checkout` + `npm ci` (roughly 30–60s) for the docs half. That is accepted
in exchange for the two paths being provably identical. Neither `staging` nor `main` has branch
protection (verified via the API — both return `Branch not protected`), so no required-status-check
name is pinned to the current single-job shape and this restructure breaks nothing.

**Build before migrate.** The build touches no database: `npm run db:generate` is annotated in
`gates.yml` as "generate Prisma client (no DB connection)", and the schema is read from
`prisma/schema.prisma`, not from Postgres. So running the build first is safe, and it removes the
most likely failure mode — a build error — from the window in which the schema is already changed.

**Single job with reordered steps, not split jobs.** Splitting build and deploy into separate jobs
would require uploading and downloading `.open-next` between them. It is a large directory, and the
workspace already persists within a job, so splitting buys nothing here.

## Deliberately excluded

- **The remaining migrate/deploy window.** Reordering narrows the gap but does not close it: if
  `wrangler deploy` fails *after* `migrate deploy` succeeds, production is still migrated ahead of
  its code. Closing that needs expand-only migration discipline or an automated rollback, which is
  materially larger than either issue asks for. **#438** (tested production rollback) is its natural
  home. This slice's claim is therefore the narrower one, and `validation.md` asserts only that:
  *a failed build can no longer leave production migrated.*
- **Quality gates on `deploy-staging`.** #435 scopes them to production. Staging deploys on every
  merge to `staging`, and `gates` has already run those exact checks on the PR that produced the
  merge; re-running them would slow the rehearsal loop for no added signal. The ordering fix still
  applies to staging, because that is a correctness bug rather than a policy choice.
- **The missing approval gate itself.** Enforcing review on `production` needs a paid plan, a public
  repo, or an accepted limitation. That is a decision, not code.
- **Migration rollback / down-migrations.** Not introduced here.
- **Any application runtime code, schema change or migration.** This slice touches only workflow
  YAML and `CHANGELOG.md`.

## Open items carried forward

- **Neither `main` nor `staging` has *any* branch protection.** Verified this slice via
  `gh api repos/.../branches/{main,staging}/protection` — both return `404 Branch not protected`.
  CLAUDE.md's known-gap note says to "treat PR review discipline as the real gate until this is
  resolved (upgrade plan, make the repo public, or accept branch-protection-only review)", which
  reads as though branch-protection-only review is a fallback currently in place. It is not: nothing
  prevents a direct push to `main`, which is the mechanism by which PRs #464/#465/#466 bypassed
  `staging` on 2026-08-30. **This slice does not fix that** — it needs the same plan/visibility
  decision as the approval gate above — but the note should stop implying a control that is absent.
  **Filed as #472**, and CLAUDE.md's branch-strategy section was corrected on this branch to describe
  the actual state rather than an implied one.
- **#438** — tested production rollback procedure, which owns the residual window described above.
- **#434's live proof on the production workflow specifically** cannot be run before merge:
  `deploy-production` triggers only on push to `main`, so exercising it requires either deploying to
  production or temporarily repointing its trigger. `validation.md` proves the ordering live against
  `deploy-staging`, which receives the identical change, and verifies the production file
  structurally. The first real production deploy after promotion is the final confirmation. This is
  stated rather than glossed, because recording a green run that never exercised the changed path is
  exactly what #459 did (a `200 OK` on a healthy page offered as evidence for an error boundary).
