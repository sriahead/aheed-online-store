# P9.2 — Production deployment safety (build notes)

Written at the end of Build, before the Clear. Slice-local; no front-matter, no
`ARTIFACT_INDEX.md` entry. Closes **#434** and **#435**.

## What changed and why

Four workflow files. No application code, no schema change, no migration.

**`.github/workflows/quality.yml` (new)** — `on: workflow_call` only, one job, the five checks both
paths need: `db:generate`, `lint`, `format:check`, `typecheck`, `test`. This is the whole mechanism
of #435: the production deploy path previously ran none of them, because `gates.yml` triggers on
`pull_request` and nothing quality-related ran on a push to `main`.

**`gates.yml`** — split into two jobs. `quality` calls the reusable workflow; `docs-gates`
(`needs: quality`) keeps `kms:validate`, the `ARTIFACT_INDEX.md` staleness check and the Gate 4
CHANGELOG diff inline. Those three stay put because two of them need `github.base_ref` to diff
against, and a `push` event has no base ref — they cannot move into a workflow the production path
also calls.

**`deploy-production.yml`** — gains a `quality` job calling the reusable workflow, with the deploy
job declaring `needs: quality`, so a failing check now stops the deploy before anything mutates.
Reordered to **build → migrate → deploy**, which required splitting the old single "Build (OpenNext)
& deploy to Workers" step into separate `Build (OpenNext)` and `Deploy to Workers` steps with the
migration between them.

**`deploy-staging.yml`** — same reordering and the same step split. No `quality` job, deliberately.

The reasoning a diff won't show: **`prisma migrate deploy` ran first in both workflows**, so a build
failure left the database on a new schema while the Worker kept serving the previous bundle. The
build is not a formality and is the single most likely step to fail — CLAUDE.md records a root
`proxy.ts` that passed `next build`, `lint`, `typecheck` and every test and failed *only* at
`opennextjs-cloudflare build`. Building first removes that failure mode from the migrated window
entirely. It is safe to build first because the build touches no database: the Prisma client is
generated from `prisma/schema.prisma`, and `gates.yml` already annotated `db:generate` as
"generate Prisma client (no DB connection)".

## Decisions taken during the build

- **`kms:validate` stayed in `gates.yml` rather than moving into `quality.yml`.** It needs no
  `base_ref`, so it *could* have moved — but `requirements.md` R2 names exactly five checks for the
  reusable workflow, and moving a sixth would also mean a production deploy fails on a docs
  front-matter error. That may well be desirable; it is not what the spec says, so it is a
  `/propose` candidate rather than a build-time addition — filed as **#473**.
- **Dropping `db:generate` from the `docs-gates` job.** The original single job ran it before
  everything, so the KMS steps inherited a generated Prisma client. R3 forbids a `db:generate` `run:`
  step anywhere in `gates.yml`, so the question was whether the KMS scripts need one. Checked rather
  than assumed: `kms/scripts/build-index.ts`, `kms/schema/validate.ts` and `kms/schema/repo.ts`
  import only `node:fs`, `node:path`, `gray-matter` and the local zod schema — no Prisma anywhere.
  Safe.
- **`fetch-depth: 0` kept on the `docs-gates` checkout.** Needed by the Gate 4 diff and by
  `build-index.ts`'s `execSync` git call for the index footer. The `quality` job uses a default
  shallow checkout since nothing in it reads history.
- **Single job with reordered steps in the deploy workflows, not split jobs.** Splitting build from
  deploy would mean uploading and downloading `.open-next` between jobs; it is a large directory and
  the workspace already persists within a job.
- **Job named `quality` in all three places.** Makes the reusable workflow's identity obvious in the
  Actions UI, where it renders as `quality / quality`.

## Deviations from the spec

**One, and it changed the artifact rather than the spec.** R9 requires that no line in
`deploy-production.yml` claims required reviewers, and `validation.md` implements that as
`grep -in 'required reviewer'` producing no output. The first version of the corrected comment
*explained* the correction using the literal phrase — "This comment previously claimed REQUIRED
REVIEWERS were configured — they never were" — which is truthful but still matches the grep, so R9
failed against my own fix. Reworded to "previously asserted an approval gate that was never actually
configured", which keeps the correction's meaning and passes the row as written. The spec was not
loosened; a check that only passes if the reader already knows what was meant is not a check.

No other deviations. Scope held: no application code, no schema change, no migration, and
`deploy-staging` did not acquire quality gates.

## Known-shaky areas

- **R10 is the only row that proves the ordering change does anything**, and it has not been run.
  Every other ordering check is static — it proves the YAML was edited, not that behaviour changed.
  Do not accept the static rows as a substitute; that substitution is exactly what #459 did when a
  `200 OK` on a healthy page was recorded as evidence for an error boundary that page never
  exercises. The scratch-branch recipe is in `validation.md`, along with a cleanup checklist — the
  experiment leaves a branch, a deliberate `lib/config.ts` build break and a temporary `branches:`
  edit behind, and all three must be gone before the PR opens.
- **`deploy-production.yml`'s ordering cannot be exercised before merge.** It triggers only on push
  to `main`. R6 is static-only by necessity; R10 proves the identical change on `deploy-staging`, and
  the first real production deploy after promotion is the final confirmation. Stated in `plan.md`
  rather than papered over.
- **The reusable-workflow call itself is unproven until CI actually runs it.** A local `js-yaml`
  parse confirms all four files are valid YAML with the intended job graph, but it cannot confirm
  GitHub resolves `uses: ./.github/workflows/quality.yml` from a `pull_request` on a feature branch,
  nor that `needs:` wires up as expected. R11 is the row that settles it — this slice's own `gates`
  run is the first real execution of the new structure. **If it fails, the likely causes in order
  are:** the reusable workflow not existing on the *base* branch (GitHub resolves local `uses:` paths
  from the PR head for `pull_request`, so this should be fine, but it is the classic first failure),
  a permissions block needing to be declared on the caller, or the `docs-gates` job failing for the
  dropped-`db:generate` reason above.
- **A second `npm ci` now runs in `gates`** (once per job). Expected cost 30–60s. If `gates` wall
  time roughly doubles, that is why — it is the accepted price of the two paths sharing one
  definition, not a regression.
- **Nothing was verified about `deploy-production`'s `quality` job blocking a real deploy**, because
  doing so requires a push to `main`. The `needs:` edge is structural and visible in the YAML; its
  first live exercise is the promotion PR.
