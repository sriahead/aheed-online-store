# Living stakeholder business case as a milestone-reviewed KMS artifact (build notes)

Closes `#777`. Branch `feature/business-case-kms`.

## What changed and why

**The artifact.** `docs/business-analysis/business-case.md` — twelve sections covering the executive
pitch, delivered capabilities and their business value, a Shopify comparison specific to this
business model, modelled savings, projected operating costs, monetisation including the multi-vendor
licensing opportunity, planned work and expected impact, the operating model, growth strategy, risks
and required investment, a 12–24 month horizon plan, and a stakeholder summary. It ends with an
append-only **Milestone revision history** whose first entry is the baseline.

`audience: [product, platform-admin]`, `visibility: internal`. That routes it to the `internal-eng`
track (`ARTIFACT_INDEX.md` line 26, Track 1) and into `app/(admin)/staff/runbook/docs.ts`, where
`lib/runbook-audiences.ts` shows it only to a viewer whose `auth.via === "platform-admin"`. A vendor
store admin cannot read it, which is the point: it discusses their own commercials.

**The process step.** `specs/sdd-workflow.md` (2.33.0 → 2.34.0) gains a **Business case review**
section and a step in *Milestone close*, sequenced after `/learn`. The loop diagram now shows three
milestone stages rather than two. Mirrored into `.claude/commands/document.md` and
`.claude/commands/learn.md`, and summarised in `CLAUDE.md` — four places, deliberately, because this
repo's own record says a ruling living in one document is a ruling nobody applies.

**The enforcement.** `scripts/sdd-business-case.ts` (pure, importable) plus a `reportBusinessCase()`
call inside `scripts/sdd-check.ts`'s `audit()`. It compares the document's own visible
`| **Last reviewed** |` row against the newest phase-closure row in `specs/roadmap.md`'s change log
and reports a gap when a milestone closed afterwards, when the file is missing, or when the marker
cannot be parsed. 26 tests in `tests/sdd-business-case.test.ts`.

**Housekeeping.** `CLAUDE.md`'s vitest baseline moved 139/1842 → **140/1868**.

## Decisions taken during the build

**Location and audience were approved at `/propose` before any file was written**, along with the
enforcement mechanism and the decision to model costs from published pricing rather than invoices.
Alternatives and why they lost are recorded in `plan.md` rather than repeated here.

**The status marker is a visible table row, not an HTML comment.** `#777` requires a reader to see
which milestone an assessment represents. Making the machine read the same row the human does means
the two cannot disagree — a hidden marker could drift from the visible heading silently.

**Same-day closure passes.** A milestone close writes the roadmap row and performs the review within
one sequence, so requiring a strictly later review date would make a correctly-followed close
impossible to satisfy.

**`audit()`, not a vitest check.** A test would run on every pull request and block unrelated work
the moment a milestone closed. The review belongs after Ship. This also matches where the `#207`
promotion audit lives, and for the same stated reason.

**Mid-close red is accepted and documented rather than engineered around.** Between `/document`
writing the closure row and the review landing, `sdd:audit` reports a gap. Suppressing that would
require the check to know which stage it is in, and would hide a close abandoned halfway. It is
called out in the workflow doc, `document.md` and `CLAUDE.md`.

## Deviations from the spec

1. **Test file named `tests/sdd-business-case.test.ts`, not `tests/business-case-review.test.ts`**
   (R22). The repo's convention pairs `scripts/sdd-<topic>.ts` with `tests/sdd-<topic>.test.ts` —
   `sdd-promotions` is the precedent. Matching the convention beat matching the spec's wording.

2. **The closure detector was rewritten mid-build after it produced a wrong answer on real data.**
   R17 specified "phase name followed by closed/CLOSED, optionally via `is now`". Implemented first
   with an 80-character window between the two, it matched narrative prose in `specs/roadmap.md` —
   `P10, two closed`, `P10 (#426), milestone closed`, `P10 and their milestones closed` — and the
   live run reported a phase closure on **2026-09-15**, a date when no phase closed. Rewritten to
   require adjacency (optionally via an em-dash phase title) plus a negation guard, because the lazy
   title segment could otherwise swallow `... is not` and leave `closed` to match. Verified by
   printing every row the detector matches against the real roadmap: exactly the 19 genuine closure
   rows, newest 2026-09-05 (P2.6). All three false positives are pinned as tests.

3. **R22 listed seven cases; the file carries 26 tests.** The extra coverage is the false positives
   above, the negation case, the `is now` spelling, and the "no closure at all" case.

4. **`CLAUDE.md` was edited**, which `plan.md`'s scope table did not list. Two reasons, both
   required by rules already in that file: its vitest baseline goes stale on any test-count change,
   and a milestone-close stage that does not appear there is a stage a fresh session will not run.

## Known-shaky areas

**The closure detector is a regex over prose, and prose changes.** It is pinned against the five
real spellings and three real false positives, and `tests/sdd-business-case.test.ts`'s final block
asserts the live roadmap still yields a parseable closure date — so a future change to the
change-log's shape fails a test rather than silently returning `null`. But a genuinely novel closure
wording (say `**P9 wrapped up**`) would be missed, and a miss is the unsafe direction. Mitigation is
convention: every closure row for fifteen milestones has used `**P<n> closed**`.

**Section 4 of the artifact is the part most likely to be wrong, and it is wrong in a knowable
way.** Every saving is modelled at an assumed £45 basket and an assumed order volume, with an
assumed app-stack cost for the Shopify side. The assumptions are stated at the point of use, but
nobody has checked them against a real basket, because there are no real baskets.

**Shopify app pricing is the weakest external figure.** Delivery-slot app pricing was researched
($7–$30/month); loyalty app pricing was **not** individually verified and is folded into the same
range. The comparison would survive that range doubling, but the figure should be researched
properly at the next review.

**Nothing checks that a documented capability actually exists.** This is the same class `CLAUDE.md`
already records for the operator guides: the parity and coverage tests pin structure, and no test
can pin truth. Every capability row was traced to a file, model or route by hand during the build.
The next review must do the same rather than trusting these rows.

## Validation evidence

| Check | Result |
| --- | --- |
| `npx vitest run tests/sdd-business-case.test.ts` | 26 passed |
| `npx vitest run` (alone) | **140 files / 1868 tests**, all passed — exactly 139+1 and 1842+26 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format:check` | exit 0 (after formatting the two new files) |
| `npm run kms:validate` | 0 invalid front-matter |
| `npm run kms:build-index` | 192 artifacts; business case at `ARTIFACT_INDEX.md:26`, Track 1; 4 hits in `docs.ts` |
| `npm run kms:assemble:internal` + `next build --webpack` in `kms/site-internal` | **exit 0**, 191 doc pages — no MDX trap |
| `npm run sdd:audit` | exit 0, zero gaps |
| Live: review date set to `2020-01-01` | exit 1, `✘ ... last reviewed 2020-01-01, but a milestone closed on 2026-09-05`. Restored |
| Live: file moved away | exit 1, `✘ ... is MISSING`. Restored |

The `summary` field overran the 300-character cap on the first `kms:validate` after the
`sdd-workflow.md` front-matter edit — caught by the check, trimmed, re-validated clean.
