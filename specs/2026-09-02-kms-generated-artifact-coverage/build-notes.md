# Every generated KMS artefact is checked, on both CI paths (build notes)

## What changed and why

`kms/scripts/build-index.ts` now exports `GENERATED_ARTIFACTS` (the paths it writes) and
`NEEDS_FOOTER_NORMALISATION` (the subset carrying a volatile footer — the index only). Its two
`writeFileSync` calls use those constants, so the list and the writes cannot disagree.

`kms/scripts/check-generated.ts` is new (`npm run kms:check-generated`). It snapshots every path in
`GENERATED_ARTIFACTS`, rebuilds, compares each, reports **all** drifted paths rather than the first,
and exits non-zero if any drifted. It exports `checkGeneratedArtefacts()` returning
`{ path, drifted }[]` so a caller reports in its own voice instead of parsing stdout.

The shape matters more than the file count. The obvious fix — add `docs.ts` to the two existing
checks — reproduces the defect one level up: two lists that must be remembered together. Deriving
coverage from the generator's own export means a third output is covered the moment it is added.
This is the same move #411/#412 made when they unscoped `tests/repository-client-injection.test.ts`
from a hardcoded four-file list to filesystem discovery.

`scripts/sdd-check.ts` lost `checkArtifactIndexStale()` and `normaliseIndexFooter()` and now calls
the shared checker via `staleGeneratedArtefacts()`. That fixes a second, live defect: the old
function ran `kms:build-index` (rewriting **both** files) and restored only the index, so a stale
`docs.ts` was silently regenerated and **left modified**, with no message tying it to the index.
That is where this branch's inherited dirty `docs.ts` came from.

`.github/workflows/quality.yml` gained a `kms_blocking` `workflow_call` input and a `kms` job
running `kms:validate` and `kms:check-generated`. `gates.yml` lost both KMS steps (keeping Gate 4)
and `deploy-production.yml` calls `quality.yml` with `kms_blocking: false`.

`tests/kms-generated-artifacts.test.ts` guards the list itself — dropping an entry silently narrows
every check at once, and nothing else would notice.

Documentation: the false `base_ref` rationale corrected in `gates.yml`, `quality.yml` and
`CLAUDE.md`; CLAUDE.md's branch-protection claim corrected; new CLAUDE.md text on the two-output
generator; `specs/sdd-workflow.md`'s pre-clear checklist item and
`docs/developer-portal/sdd/operator-runbook.md`'s `sdd:preclear` and CI sections updated to describe
what now actually runs.

## Decisions taken during the build

**`main()` guarded with `require.main === module`.** Not in the spec, and unavoidable: without it,
importing `GENERATED_ARTIFACTS` executes `main()`, so the checker (and the test, and `sdd-check.ts`)
would rewrite both artefacts as a side effect of the import and could never report drift. Rejected
the alternative of moving the constants to a third module — that would have satisfied R1 only by
re-reading it loosely, and the constants belong beside the writes they describe.

**Two jobs in `quality.yml`, not extra steps in the existing one.** `continue-on-error` is per-job,
so folding the KMS steps into `quality` would make `lint`, `typecheck` and `test` non-blocking on
the production path too. The cost is a second `npm ci` on the PR path; the jobs run in parallel.

**`::error::` annotations rather than a plain non-zero exit.** Under `continue-on-error` the job's
failure does not fail the workflow, so the annotation is what keeps a non-blocking failure visible
in the run summary rather than buried in a log.

**The checker restores normalised-away differences but leaves real drift on disk.** Inherited from
the old `sdd-check.ts` behaviour and deliberately kept: the index footer is rewritten on every
rebuild, so without the restore every check would dirty the tree; but leaving genuine drift
regenerated *is* the fix the error message asks for.

**Removed a now-orphaned `writeFileSync` import from `scripts/sdd-check.ts` by hand.** `eslint`
enables no `no-unused-vars` rule here (#416), so nothing in `lint`/`typecheck`/`test` reports an
assigned-and-never-read binding. Checked the other `node:fs` imports the same way; the rest are
still used.

## Deviations from the spec

**One, and it is a correction to the spec rather than to the code: R2's verification step in
`validation.md`.** As written it grepped the whole of `check-generated.ts` for the two artefact
paths and expected `0`, to prove the list is not restated. The file's doc comment legitimately names
both paths while explaining the defect, so a correct implementation returns `3` and the step fails.
The step now strips comment lines first and expects `0` among code lines (verified: `0`, with
`GENERATED_ARTIFACTS` used 5 times).

This is worth naming because amending a requirement to match the code is normally the wrong
direction. Here the requirement's *intent* — coverage is derived, not restated — is unchanged and
satisfied; only its chosen proxy was wrong, and wrong in a way this repo has already paid for:
`tests/repository-client-injection.test.ts` is AST-based precisely "because these files legitimately
name both functions in prose and in `ReturnType<typeof getPrisma>` type positions" (CLAUDE.md).
Committed separately as `b870e6e` so the change is reviewable on its own.

No other deviation. Every other requirement is built as specified.

## Known-shaky areas

**1. `continue-on-error: ${{ !inputs.kms_blocking }}` is unproven.** Whether GitHub evaluates the
`inputs` context in a job-level `continue-on-error` inside a reusable workflow is documented but not
verified here, and this repo has a history of framework-documented semantics not holding (`proxy.ts`,
the `edge` runtime, `@prisma/client/wasm` resolution). **It can only be exercised on the production
path, which first runs at promotion** — the PR path uses the `true` default. **The failure direction
is safe**: if the expression does not resolve as intended the job stays *blocking*, so a stale
artefact would block a production deploy rather than silently pass. Loud and wrong, not quiet and
wrong. Watch the first `deploy-production` run after promotion.

**2. A pre-existing test failure that is not this slice's, proven by measurement.**
`tests/repository-transaction-safety.test.ts` times out at its 5000ms `testTimeout` under full-suite
load on this Windows machine — 1.0s in isolation, 9.5s under load. Verified against the untouched
base by stashing the whole branch: **the base fails identically** (73 files / 871 tests, same single
failure) versus this branch's 74 / 874, where the extra file and three tests are this slice's and
all pass. CI's Linux runners have been green on it throughout. Filed as **#538**. If validation sees
this locally, it is the machine, not the change — but confirm against CI, which is the authority.

**3. `CLAUDE.md` is itself an indexed artefact, and editing its prose stales `docs.ts`.** This bit
during the build: the implementation commit edited CLAUDE.md's body without touching its
front-matter, so `ARTIFACT_INDEX.md` rebuilt byte-identically while `docs.ts` drifted — the exact
asymmetry this slice exists to close, reproduced by accident, and caught by the new check from a
clean checkout (index `✓`, `docs.ts` `::error::`). The old check would have passed that PR.
**Anything that edits a front-mattered document's body must re-run `kms:build-index` afterwards**,
and the ordering rule in `specs/sdd-workflow.md` ("run it LAST") is why.

**4. R4's negative case is the row most worth running.** A checker observed only passing has not
been tested. R4 induces real drift in both files and asserts both are named in one run. Run R9
before R4, per the ordering note in `validation.md` — R4 deliberately dirties the tree.

**5. Nothing exercises `kms:check-generated` against a *third* generated artefact**, since none
exists. The structural claim (a new output is covered automatically) rests on the code deriving from
`GENERATED_ARTIFACTS`, which R2 and `tests/kms-generated-artifacts.test.ts` check, not on an
observed third file.
