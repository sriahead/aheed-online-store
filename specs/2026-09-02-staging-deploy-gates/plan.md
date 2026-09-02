---
id: staging-deploy-gates
title: "The staging deploy path is gated, and its own comment becomes true (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-02
visibility: internal
summary: deploy-staging runs no checks, justified by a comment asserting that gates already ran on the PR — a premise nothing enforces, because no ruleset covers staging. This adds the ruleset that makes the claim true and the quality job that catches the case it misses.
tags: [ci, devops, rulesets, deployment]
related: [roadmap, sdd-workflow]
---

# The staging deploy path is gated, and its own comment becomes true (plan)

`.github/workflows/deploy-staging.yml` runs no lint, no typecheck, no tests, no format check and no
KMS check. On a push to `staging` it goes straight to build, migrate and deploy. That is not an
oversight — the file says so, and gives a reason:

> Deliberately NO quality job here (#435 scopes those to production): `gates` already ran
> lint/format/typecheck/test on the PR that produced this merge, so re-running them would slow the
> staging loop for no added signal.

The reasoning is sound. **The premise is unenforced.**

`gates` runs `on: pull_request`. A commit that reaches `staging` without a pull request never runs
it. Whether that can happen is a repository-settings question, and the answer is that it can: the
`protect-main` ruleset's condition is `~DEFAULT_BRANCH`, which resolves to `main` and nothing else.
There is no ruleset and no classic protection on `staging`. Confirmed 2026-09-02 via
`gh api repos/sriahead/aheed-online-store/rulesets` — the endpoint that can actually see rulesets,
as opposed to `/branches/staging/protection`, which returns `404 Branch not protected` whether or
not one exists.

So a direct push to `staging` deploys to `staging.aheedfoodcentre.nocaped.com` — running migrations
against the staging database along the way — having executed no check of any kind.

**Goal:** close the path by which a staging deploy can run with no checks having executed, and
replace `deploy-staging.yml`'s unenforced justification with one that names the mechanism enforcing
it.

## Why both halves, when the issue proposed one

#539 suggested the cheapest defensible fix: call `quality.yml` from `deploy-staging.yml`, matching
production. That was the right instinct, but it addresses the second half of the problem and not
the first. The two candidate fixes are not alternatives — they catch different failures:

| Failure | Ruleset on `staging` | `quality.yml` in `deploy-staging` |
|---|---|---|
| Commit pushed straight to `staging`, `gates` never runs | **caught** | caught |
| PR opened, `gates` runs red, merged anyway | not caught | **caught** |
| The file's own justifying comment is true | **made true** | still unenforced |

Only the ruleset makes the existing comment a checkable claim rather than an assumption. Only the
workflow job catches a red PR that someone merged regardless — which is not hypothetical here:
`CLAUDE.md` records that PRs #464, #465 and #466 all merged straight into `main` on 2026-08-30,
bypassing `staging` entirely, and that nothing constrained them.

## Why the ruleset half is affordable, and why that had to be checked

`CLAUDE.md` records that GitHub's required-reviewers protection "needs a paid plan for private
repos and was rejected with a 422 on this repo's current (free) plan." Read quickly, that reads as
"branch protection is unavailable here", which is how the ruleset half stayed off the table.

It is narrower than that. Reading `protect-main`'s actual rule payload
(`gh api repos/sriahead/aheed-online-store/rulesets/20494938`) shows it uses
**`required_approving_review_count: 0`**, carries **no `required_status_checks` rule**, and has **no
bypass actors** — and it is `active`. It relies on no paid feature. The 422 was about *required
reviewers* specifically, not about rulesets as such.

An exact mirror scoped to `refs/heads/staging` is therefore creatable on the current plan. This
slice creates one rather than deferring on a constraint that does not apply.

**Scope (this slice):**

- Create a repository ruleset **`protect-staging`**: `target: branch`, `enforcement: active`,
  `conditions.ref_name.include` of `refs/heads/staging`, rules `pull_request`
  (with `required_approving_review_count` of `0`), `non_fast_forward` and `deletion`, and no bypass
  actors. An exact mirror of `protect-main` apart from the ref condition.
- Add a `quality` job to `.github/workflows/deploy-staging.yml` calling
  `./.github/workflows/quality.yml` with `kms_blocking: false`, and make the existing `deploy` job
  declare `needs: quality`.
- Rewrite the comment that justified running no checks, so it names `protect-staging` and describes
  what now actually runs.
- Update `CLAUDE.md`'s "Branch strategy & CI/CD" section: `staging` is now covered, and the
  statement that the ruleset is `main`-only becomes false the moment this lands.
- Regenerate the KMS artefacts, because editing `CLAUDE.md`'s body stales
  `app/(admin)/staff/runbook/docs.ts` while leaving `ARTIFACT_INDEX.md` byte-identical — the exact
  asymmetry the previous slice (#537) existed to close, and which bit that slice during its own
  build.

## Why `kms_blocking: false`, matching production rather than the stricter option

The same argument `deploy-production.yml` already makes, and it transfers exactly: on a push to
`staging` the content has already merged. Failing the deploy cannot un-merge a stale generated
artefact — it only withholds whatever fix the push carries. The failure still surfaces as a red
`kms` job and as `::error::` annotations. The PR is the gate; on the branch the same check is a
drift tripwire.

The `quality` job itself stays blocking, so lint, format, typecheck and tests do gate the deploy.

**Deliberately excluded:**

- **No `required_status_checks` rule on either branch.** Whether that rule is available on this
  plan is unverified, and adding it is a different decision with a different blast radius — a
  required check that is misnamed or never reported blocks every merge. That is **#472**'s
  territory (nothing mechanically enforces the branch strategy), which stays open. This slice only
  closes the "no checks ran at all" gap; a PR with red checks remains mergeable into both branches,
  and `CLAUDE.md` must keep saying so.
- **No approval requirement.** `required_approving_review_count` stays `0`, matching `protect-main`.
  Requiring an approving review on a single-maintainer repo would block every merge, and the
  paid-plan 422 applies to *required reviewers* specifically.
- **No gating of `deploy-docs-internal.yml`.** It triggers on pushes to both `staging` and `main`
  and runs no checks either, so it shares this defect. The ruleset half removes its direct-push
  exposure on `staging` as a side effect; adding a `quality` job to it is a separate change to a
  separate deploy path and is not in this slice. Named here so it is not mistaken for an oversight.
- **No change to `gates.yml`, `quality.yml` or `deploy-production.yml`.** They were settled by #537
  and #473 one slice ago. This slice consumes `quality.yml`'s existing `kms_blocking` input; it does
  not modify it.
- **No change to the build-before-migrate ordering** inside `deploy-staging.yml`'s `deploy` job
  (#434). The new job is inserted ahead of `deploy`; the steps within `deploy` keep their order. A
  requirement guards this, because it is the kind of thing an edit to the surrounding file disturbs
  silently.

## If the ruleset cannot actually be created

The affordability argument above is an inference from `protect-main`'s payload, not an observation
of a successful `POST`. It is a strong inference — an active ruleset using none of the paid
features is sitting in this repo right now — but the 422 that `CLAUDE.md` records was also a
surprise at the time.

If `POST /repos/sriahead/aheed-online-store/rulesets` is rejected, **do not weaken the ruleset to
get it accepted** (dropping `pull_request`, or adding a bypass actor, would produce a ruleset that
exists and enforces nothing — worse than none, because R3 might still pass while the gap stays
open). Instead: record the exact status and response body in `build-notes.md`, ship the
`quality.yml` half alone, and leave the file comment honest about what does and does not enforce the
premise. R1–R5 then fail as written, which is the correct outcome — the requirement was not met.
That is a `/fix`-or-descope decision for the user, not something to paper over.

**Open items carried forward:**

- **#472** — nothing enforces that a PR's checks are green before merge, on either branch. Narrowed
  by this slice, not closed.
- **#541** — whether `continue-on-error` derived from `kms_blocking` actually resolves non-blocking
  is still unverified. The first post-promotion `deploy-production` run (`33606818256`, 2026-09-02)
  passed its `kms` job, and `continue-on-error` is inert on a passing job, so that run produced no
  evidence either way. This slice adds a **second** caller passing `false`, which widens where the
  answer matters without answering it.
- **#513** — the delivery board's `Phase` field has no `P9` option (confirmed: its options end at
  `P8`), so #539 cannot be filed with a correct Phase and sits with Phase unset.
