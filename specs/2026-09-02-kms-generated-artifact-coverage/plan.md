---
id: kms-generated-artifact-coverage
title: "Every generated KMS artefact is checked, on both CI paths (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-02
visibility: internal
summary: kms:build-index writes two files but every staleness check watched only one, so a stale staff runbook reached production while CI stayed green. The output list becomes the single source of truth, and both KMS checks move to the shared quality workflow.
tags: [kms, ci, tooling, docs]
related: [roadmap, sdd-workflow]
---

# Every generated KMS artefact is checked, on both CI paths (plan)

`kms/scripts/build-index.ts` ends with two `writeFileSync` calls, two lines apart. One writes
`ARTIFACT_INDEX.md`; the other writes `app/(admin)/staff/runbook/docs.ts`. Every mechanism that
enforces their freshness — the `gates` workflow step and `scripts/sdd-check.ts`'s
`checkArtifactIndexStale()` — reads back only the first.

The two files go stale under *different* conditions, which is what made the gap invisible rather
than merely narrow. `ARTIFACT_INDEX.md` renders front-matter only. `docs.ts` embeds each
document's full body. So an edit that changes a document's content without touching its
front-matter regenerates `ARTIFACT_INDEX.md` byte-identically and `docs.ts` differently — the check
passes, and the artefact nobody checks is the one that drifted.

That is what happened in commit `122609c`, the previous loop's Document-final pass: five rows
appended to `specs/roadmap.md`'s change log, front-matter untouched (`version: "1.61.0"`,
`updated: 2026-08-31`). `gates` passed on PR #536, it merged to `staging`, and the same content
sits on `main`. `app/(admin)/staff/runbook/page.tsx` line 6 imports `DOC_ARTICLES` from that file,
so `/staff/runbook` is serving a Roadmap article five change-log rows out of date, in production.

**Goal:** make it structurally impossible for a future output of the generator to go unwatched, and
run the KMS checks on the production deploy path as well as the pull-request path.

**Scope (this slice):**

- **One list, one checker.** `kms/scripts/build-index.ts` exports `GENERATED_ARTIFACTS`, the
  repo-relative paths it writes, and writes exactly those. A new `kms/scripts/check-generated.ts`
  (`npm run kms:check-generated`) snapshots every path in that list, runs the build, and diffs each
  one. Adding a third output to the generator puts it under the check the moment it is added —
  nobody has to remember a second place.
- **Per-file comparison rules.** `ARTIFACT_INDEX.md` carries a generated timestamp and commit SHA
  in its footer, so it is compared with that footer normalised away — the existing `sed` pattern in
  `gates.yml` and the existing `normaliseIndexFooter()` in `sdd-check.ts` already agree on this.
  `docs.ts` is a plain `JSON.stringify` with no timestamp and no SHA, so it is compared exactly.
  Line endings are normalised for both, matching the Windows reasoning already recorded in
  `sdd-check.ts`.
- **Report every file, then exit.** The checker does not stop at the first drifted file. One run
  says everything that is stale.
- **`scripts/sdd-check.ts` calls the shared checker** instead of carrying its own copy, which also
  fixes a live defect: `checkArtifactIndexStale()` runs `npm run kms:build-index` (rewriting *both*
  files) and restores only `ARTIFACT_INDEX.md`. A stale `docs.ts` is therefore silently regenerated
  and left modified, with no message tying it to the index. That is almost certainly the origin of
  the uncommitted `docs.ts` this slice inherited. The shared checker restores any file whose only
  difference is normalised away, and leaves genuinely drifted files in place — leaving them is the
  fix, since the instruction is "commit the result".
- **Both KMS checks move into `.github/workflows/quality.yml`** as a new `kms` job, resolving #473.
- **The pending `docs.ts` regeneration is committed**, repairing the live stale runbook article.
- **Four documentation corrections** (below).

## Resolving #473: blocking on the pull-request path, not on the production path

#473 asked whether `npm run kms:validate` belongs in the shared workflow. It deferred the decision,
scoping itself around "the two steps that genuinely cannot move (the `ARTIFACT_INDEX.md` staleness
check and the Gate 4 CHANGELOG diff both need `github.base_ref`, which a push event does not have)".

**That premise is false for the staleness check.** Reading `gates.yml`, it copies a file,
regenerates, and diffs. It reads no `base_ref` at all. Only the Gate 4 CHANGELOG diff does. Two
checks are movable, not one — and `deploy-production.yml` calls `quality.yml` and nothing else, so
the production path today runs **zero** KMS checks.

The decision: **one definition, in `quality.yml`, as a `kms` job that is blocking on the
pull-request path and non-blocking on the production path**, selected by a `workflow_call` input.

The rationale #473 lacked: **the pull request is the gate; on `main` the same check is a drift
tripwire, and failing a deploy cannot un-merge drift that has already landed.** It is worth running
on the production path because a PR into `main` can be merged by its author with zero approvals and
no required status checks (see the branch-protection correction below), so content genuinely does
reach `main` without the PR gate having meaningfully passed. But once it is there, failing the
deploy does not remove it — it only withholds the fix. Loud, and non-blocking.

A separate job is not stylistic: `continue-on-error` is per-job, so folding the KMS steps into the
existing `quality` job would make `lint`, `typecheck` and `test` non-blocking on the production
path too. Job-level `continue-on-error` still surfaces `::error::` annotations in the run summary,
so a non-blocking failure stays visible.

This also avoids #473's own suggested shape — a duplicated job inside `deploy-production.yml` —
which would rebuild precisely the two-copies drift that #435 created `quality.yml` to end.

## The documentation corrections

The false `base_ref` claim is written in three repository files, plus #473's body (handled by a
comment on that issue, which this slice closes):

- `.github/workflows/gates.yml` — the `docs-gates` job comment
- `.github/workflows/quality.yml` — the header comment explaining what it deliberately omits
- `CLAUDE.md` — "Branch strategy & CI/CD"

**A fourth correction, in that same CLAUDE.md section**, is included because this slice is editing
the section anyway, and leaving a known falsehood two paragraphs above the one being fixed would be
worse than either. CLAUDE.md states there is "**No branch protection at all**, on either branch",
citing `gh api repos/sriahead/aheed-online-store/branches/main/protection` returning
`404 Branch not protected`. That command cannot detect a **repository ruleset**, and `main` carries
an active one named `protect-main`: a pull request is required (so direct pushes to `main` are
blocked), force-pushes and deletion are blocked, `required_approving_review_count` is `0`, there is
no `required_status_checks` rule, there are no bypass actors, and the condition is
`~DEFAULT_BRANCH`, so **`staging` is not covered**.

The substance of CLAUDE.md's warning survives, which is why this is a correction rather than a
deletion: a PR into `main` can still be opened and self-merged with every check red, and nothing
constrains its source branch, so the #464/#465/#466 pattern remains available. The failure shape is
the same one this whole slice is about — a documented check that is structurally blind to the
mechanism actually in use, reporting a confident answer anyway.

**Deliberately excluded:**

- **Adding `quality.yml` to `deploy-staging.yml`.** That workflow calls no checks at all today, and
  `staging` is not covered by the ruleset, so direct pushes there are possible. Real, and out of
  scope — it changes what gates staging deploys, which is #472's territory, not a KMS question.
- **Making the production path blocking.** Explicitly decided against above.
- **Requiring status checks on the `protect-main` ruleset.** A repository-settings change, not a
  code change, and it belongs to #472 with the rest of the enforcement question.
- **Updating #472's title**, which says "no branch protection on main or staging" — correct for
  `staging`, wrong for `main`. Flagged in a comment on #537; left for whoever picks up #472.
- **`kms:assemble:internal` and the Nextra MDX build.** A different pipeline with a different
  failure mode. Not a generated-artefact staleness question.
- **Bumping `specs/roadmap.md`'s front-matter when only its change log grows.** Doing so would have
  made `ARTIFACT_INDEX.md` drift too and caught this incidentally — but relying on that is relying
  on a habit, which is what this slice replaces with a check.

**Open items carried forward:**

- **#472** — nothing requires a passing status check or an approving review before a merge to
  `main`. This slice makes the KMS checks run on that path; it does not make them, or anything
  else, mandatory.
- **#423** — `kms/site-internal/next-env.d.ts` is dirtied by docs-site builds, tripping
  `sdd:preclear`'s clean-tree check. A different `sdd:preclear` dirty-tree defect from the one
  fixed here; untouched.
