---
id: p6-5-residual-validation-plan
title: "P6.5 residual validation & gap-register reconciliation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-17
visibility: internal
summary: "Closes issue #192's uncovered validation debt by auditing both gap registers against the code, consolidating them into one master, verifying and closing #176, and replacing P6.5's self-certifying exit gate."
tags: [p6-5, p7, validation, gap-register, audit, sdd]
related: [gap-register-audit, gap-register, self-review-report, p6-5-self-review-hardening-plan]
---

# P6.5 residual validation & gap-register reconciliation (plan)

**Goal:** make the gap registers trustworthy enough to plan P7 from, and remove the mechanism that
let a gap be recorded as handled while the feature was never built.

## Why this slice exists

Issue **#192** records that four of the five slices in the P6.5–P7a catch-up promotion got a smoke
pass only, and names P6.5 as the largest uncovered gap. Read at face value that sounds like missing
test coverage. It isn't — the problem is one level up.

**P6.5's exit gate certifies a document rather than the code.** Its `validation.md` R1/R2 ask only
that `docs/sdd/self-review/GAP-REGISTER.md` exists and *claims* zero unresolved Critical/High gaps;
R3–R6 are `typecheck`/`test`/`lint`/`kms:validate`. Not one row compares a register claim to the
artifact it describes. Re-walking those six rows exactly as written would pass again today and would
prove nothing new.

That is not a hypothetical weakness. It is the same mechanism that produced P7a's three defects:
GAP-010 (staff bulk order transitions) sat in `docs/gap-register.md` as a tracked, accounted-for
`Deferred` row, `specs/roadmap.md` reported the feature as shipped, and nobody discovered it had
never been built until P7a's first real `/validate` in PR #204 — by which point the same slice was
also carrying a live data-disclosure hole in the guest order lookup.

The registers are currently wrong in at least **five** rows, all verified against `gh` and the
filesystem while writing this plan:

| Row | Says | Actually |
|---|---|---|
| GAP-007 | cites `#167` | #167 is the *closed* P6b2 upload issue; the production-CORS issue is **#180** (open) |
| GAP-008 | `Deferred` | guest order lookup shipped in P7a and was corrected in PR #204; #123 closed |
| GAP-009 | `Deferred` | the slide-over cart drawer shipped in P7a |
| GAP-010 | `Deferred` | bulk transitions built in PR #204; #162 closed |
| GAP-013 | `Deferred` | homepage featured-products rail shipped; #45 closed |

There is also a structural defect underneath them: **two registers share one GAP-ID space.**
`docs/sdd/self-review/GAP-REGISTER.md` holds GAP-001..004 and `docs/gap-register.md` holds
GAP-005..015. Both carry `status: approved`, and neither references the other. A reader who finds
one has no way to know the other exists.

## Scope (this slice)

**1. Consolidate to one master register.** `docs/gap-register.md` becomes the single master holding
all fifteen rows; `docs/sdd/self-review/GAP-REGISTER.md` keeps its P6.5 narrative but its table is
replaced by a relative link to the master. The master was chosen because P7a's `requirements.md`
already cites it, so the cross-references that exist today keep resolving.

**2. Re-derive every row's Status from the artifact.** Each of GAP-001..015 gets checked against
code, `gh` issue state, or a merged PR — not against what the row says about itself. The five rows
above are known-wrong going in; the audit is expected to find more, and finding more is the point
rather than a surprise. Each row must end up citing something a reader can check.

**3. Verify and close #176 — or prove it isn't fixed.** `lib/auth-origin.ts:43-68` has both
`splitHostPort` (IPv6-literal aware) and `inferProto` (loopback → `http`), and `buildAuthOrigin:82`
preserves a non-default port. GAP-002 records this as `Fixed`. But `docs/sdd/self-review/VALIDATION-RESULTS.md`
shows its validation was **26 unit tests** — the originally reported symptom, a real browser sign-in
against `npm run preview` on `:8787`, was never re-exercised, and #176 is still open. Until someone
fires the actual symptom this is an unproven claim, which is exactly the class of thing this slice
exists to stop accepting.

Whatever the live check shows, `docs/sdd/self-review/SELF-REVIEW.md` and
`docs/sdd/self-review/VALIDATION-RESULTS.md` both need correcting too — they each restate GAP-002 as
`Fixed`, so the register is not the only place the claim lives, and fixing one file while leaving
two others asserting the opposite would reproduce the problem this slice is here to end.

**4. Delete the stale instruction #176 left in the workflow doc.** `specs/sdd-workflow.md`'s Validate
section currently tells a future session that local-preview browser sign-in 403s and that driving one
"needs a temporary, **uncommitted** local patch to `lib/auth-origin.ts`." If step 3 passes, that
paragraph is actively harmful guidance sitting in the file a validator is told to read.

**5. Replace P6.5's self-certifying exit gate.** Renumber
`specs/2026-08-13-p6.5-self-review-hardening/requirements.md` into the repo's `R1..Rn` convention
(it currently uses prose Objectives/Exit Criteria, and its `validation.md` rows cite `R1..R6` that
correspond to no numbered requirement anywhere), and rewrite `validation.md` so every row checks an
artifact rather than a document's claim about itself.

**6. #192's two cheap live items.** Fire a real staff order status transition against a synthetic
recipient — the read path is verified, the write path and its email side effect are not — and
re-exercise the first-visit cookie consent banner from a cleared `aheed_cookie_consent` cookie.

**7. Carry-forward.** The missing `specs/roadmap.md` change-log row for **PR #206** (`staging → main`,
merge `081f618`), which could not have been written on the branch that preceded it.

## Deliberately excluded

- **Full per-slice `validation.md` re-walks of P6.6 and P6.6c** (#192 item 4). P7a's was effectively
  performed by PR #204. These two get targeted spot-checks only where the register audit flags a
  discrepancy; anything left unchecked stays recorded on #192 rather than being quietly dropped or
  reported as walked.
- **Teaching `sdd:audit` to catch a missing promotion row.** Tracked as **#207** — the fifth
  consecutive recurrence is what prompted filing it. This slice writes the PR #206 row by hand.
- **Any new P7 feature surface** — accessibility, GDPR data-subject rights. Those are the next
  loop's work, deliberately sequenced after the registers can be trusted.
- **Acting on newly-discovered gaps.** If the audit turns up another GAP-010 — recorded as handled,
  never built — it is triaged into a tracked issue and a corrected register row. Building the missing
  feature inside this slice would be exactly the scope creep this repo keeps paying for.

## Open items carried forward

- **#192** stays open if any of its item-4 spot-checks are left unperformed; the closing comment
  must name which.
- **#207** — the `sdd:audit` promotion-row check.
- **#176** — closed by this slice only if the live check in scope item 3 actually passes. If it
  fails, #176 stays open, the workflow paragraph stays, and the failure becomes a finding rather
  than something this slice fixes under a validation mindset.
