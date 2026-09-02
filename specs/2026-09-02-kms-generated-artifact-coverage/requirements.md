# Every generated KMS artefact is checked, on both CI paths (requirements / acceptance criteria)

Closes #537 and #473. `kms/scripts/build-index.ts` writes two files — `ARTIFACT_INDEX.md` and
`app/(admin)/staff/runbook/docs.ts` — and every freshness check watched only the first, so a
content-only edit to a document (front-matter untouched) left `docs.ts` stale on `staging` and
`main` with CI green. This slice makes the generator's own output list the single source of truth
for what gets checked, moves both KMS checks into the shared `quality.yml` so the production deploy
path runs them too, and corrects the false `github.base_ref` rationale that kept them
pull-request-only. See `plan.md` for the reasoning behind the blocking/non-blocking split.

R1. `kms/scripts/build-index.ts` exports a `GENERATED_ARTIFACTS` array of repo-relative path
    strings containing exactly `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`, and its
    `main()` writes every path in that array and no other file.

R2. `kms/scripts/check-generated.ts` exists and is wired to the npm script `kms:check-generated`.
    It derives the files it checks from `GENERATED_ARTIFACTS` — it does not restate the list.

R3. `npm run kms:check-generated` exits 0 when every generated artefact on disk matches a fresh
    rebuild, and prints one result line naming each path it checked.

R4. `npm run kms:check-generated` exits non-zero when any generated artefact has drifted, prints a
    `::error::` line naming each drifted path, and reports **every** drifted path rather than
    stopping at the first.

R5. `npm run kms:check-generated` compares `ARTIFACT_INDEX.md` with its generated footer
    (`Last build:` timestamp and `commit` SHA) normalised away, and compares
    `app/(admin)/staff/runbook/docs.ts` exactly. Line endings are normalised to `\n` before
    comparing both.

R6. After `npm run kms:check-generated` exits 0, `git status --porcelain` reports no modification
    to any path in `GENERATED_ARTIFACTS` — a footer-only rebuild is restored, not left dirty.

R7. `scripts/sdd-check.ts` no longer contains its own rebuild-and-diff implementation; its preclear
    path invokes `kms:check-generated` and reports that result.

R8. `npm run sdd:preclear` leaves `app/(admin)/staff/runbook/docs.ts` unmodified in
    `git status --porcelain` when the generated artefacts are current.

R9. The committed `app/(admin)/staff/runbook/docs.ts` is current: running `npm run kms:build-index`
    on a clean tree produces no change to that path.

R10. `.github/workflows/quality.yml` declares a `workflow_call` input `kms_blocking` of type
     `boolean` with default `true`.

R11. `.github/workflows/quality.yml` contains a job named `kms`, distinct from the existing
     `quality` job, whose steps run `npm run kms:validate` and `npm run kms:check-generated`, and
     whose `continue-on-error` is derived from the `kms_blocking` input so the job is blocking when
     the input is true and non-blocking when it is false.

R12. `.github/workflows/deploy-production.yml` calls `quality.yml` with `kms_blocking: false`, and
     its `deploy` job still declares `needs: quality`.

R13. `.github/workflows/gates.yml` calls `quality.yml` without setting `kms_blocking` to `false`,
     and its `docs-gates` job no longer contains a `kms:validate` step or an `ARTIFACT_INDEX.md`
     staleness step. The Gate 4 CHANGELOG step remains in `docs-gates`.

R14. No repository file states that the `ARTIFACT_INDEX.md` staleness check requires
     `github.base_ref`. `gates.yml`, `quality.yml` and `CLAUDE.md` each state instead that only the
     Gate 4 CHANGELOG diff needs it.

R15. `CLAUDE.md`'s "Branch strategy & CI/CD" section states that `main` is covered by an active
     repository ruleset named `protect-main` which requires a pull request, allows zero approving
     reviews, requires no status checks, has no bypass actors, and does not cover `staging`; and
     records that `gh api repos/sriahead/aheed-online-store/branches/main/protection` cannot detect
     a ruleset and returns 404 regardless.

R16. `tests/kms-generated-artifacts.test.ts` asserts that `GENERATED_ARTIFACTS` contains both
     generated paths and that each named path exists on disk, so dropping an entry from the list
     fails the suite rather than silently narrowing coverage.

R17. `CHANGELOG.md` updated (Gate 4).

R18. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
