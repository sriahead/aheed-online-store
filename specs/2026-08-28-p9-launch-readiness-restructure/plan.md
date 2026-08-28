---
id: p9-launch-readiness-restructure-plan
title: "P8 closeout and the P9 / P10 restructure (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-28
visibility: internal
summary: "Closes P8 as a historical record, moves the unresolved production-launch work hidden inside it into a new P9 with four sub-phases, folds P8.3/P8.6/P8.7 into a new P10, and files the launch-readiness issues P9 needs. Sequencing and decision work only — no application code."
tags: [roadmap, sequencing, launch, planning, security]
related: [roadmap, adr-005-payments-money-flow, adr-006-store-locations, nfr-baseline]
---

# P8 closeout and the P9 / P10 restructure (plan)

**Goal:** make P8 an accurate historical record, and put the work that actually stands between this
repo and a defensible production launch somewhere a reader can see it. Shipping this slice means the
next `/orient` reads a roadmap where "what is left before launch" is a bounded, enumerated list
rather than a 39-issue bucket that mixes shipped history, post-launch enhancements and an
unpatched cross-tenant write path.

This is documentation and decision work. **No application code is built here.** Every security,
infrastructure and validation item named below is filed as its own issue and built by a later slice
under its own spec. The precedent is **#420**, which sequenced the #408 brief and deliberately built
nothing from it.

## Why this slice exists

`specs/roadmap.md` v1.52.0 describes **P8 — Deployment & launch** as the phase that carries "all
remaining open items", decomposed into P8.1 (closed), P8.2 (launch & operations), P8.3 (post-launch
catch-all), P8.5 (closed), P8.6 and P8.7. The GitHub milestone `P8 — Deployment & launch` holds
**39 open issues**.

Those 39 are not one kind of thing. They are at least four:

1. **Genuine launch gates** — Stripe live keys (#113), a verified sending domain (#104), persisted
   logs (#246), the reconciliation sweep (#101).
2. **Post-launch enhancements** — the discount-engine expansion (#146–#149), saved lists (#116),
   the wishlist (#232), the theme catalogue (#75).
3. **Unresolved security work that nothing marks as such** — most sharply **#340**, where
   `lib/repositories/reviews.ts` resolves `vendorId` from whatever `Product` a caller names rather
   than from the current vendor.
4. **Bookkeeping** — the P8 epic itself (#91), and #408, whose fourteen issues #420 already
   sequenced.

A phase holding all four cannot answer the only question that matters before go-live. Worse, the
launch-critical items are indistinguishable, on the board and in the milestone, from a wishlist
link. This slice separates them.

## What the verification pass changed

Every load-bearing claim in the restructure brief was checked against the code before this plan was
written, in the same spirit as #420's pass. **Six came back confirmed:**

| Claim | Evidence |
|---|---|
| Guest order PII reachable by order number alone | `app/(storefront)/checkout/[orderNumber]/page.tsx:34` passes a null viewer id for guests into `getByOrderNumber`, then renders `OrderAddressCard`. The docstring at :20 already names it "a capability URL" and defers stronger access to P4 |
| Destructive `GET` cancellation | `app/api/checkout/cancel/route.ts:9` cancels the order and releases inventory from a `GET`. The comment at :23 reasons that an unguessable order number is "safe enough" |
| Webhook not bound to the expected payment | `app/api/webhooks/stripe/route.ts:56` confirms on `metadata.orderNumber` alone. Nothing compares the Stripe session id to `Payment.providerReference`; no amount or currency check exists |
| Payments not fail-closed | `lib/payments.ts:134-138` returns the stub whenever `STRIPE_SECRET_KEY` is unset, with no production guard |
| Auth rate limiting disabled | `lib/auth.ts:102` sets `rateLimit: { enabled: false }` with a comment explaining the Workers constraint |
| Migration precedes build in the production deploy | `.github/workflows/deploy-production.yml:17` runs `prisma migrate deploy`; the OpenNext build is at :24. That workflow contains no lint, typecheck, format or test step at all |

**Two came back false, and are handled as false rather than filed as written.** This matters more
than the six, because filing them anyway is exactly the failure this slice exists to stop.

- **#243 is CLOSED.** The brief lists it as existing open work. It is **not reopened**. A fresh P9.3
  issue measures LCP against the release candidate instead, because a measurement taken on a
  candidate that does not exist yet is not the same task as the one #243 closed.
- **`/staff/bundles/new` is not a broken journey.**
  `app/(admin)/staff/bundles/[bundleId]/page.tsx:47` reads `const isNew = bundleId === "new"` and
  branches on it; the dynamic segment matches `/new`, the docstring at :22 names it the create
  route, and the CTA at `app/(admin)/staff/bundles/page.tsx:42` resolves to it. The human ruled that
  a live check decides this, so the route is loaded under `npm run preview` and an issue is filed
  only if it genuinely fails.

The general lesson, and the reason both are written down: **a register is not evidence.** The brief
that prompted this slice was itself assembled from earlier registers, and two of its items had gone
stale in exactly the way the brief's own rule ("do not reopen issues merely because an older gap
register says they were outstanding") warns about.

## Structure

Three buckets, replacing one.

**P8 — Deployment & launch** becomes a **historical record**. Its subdivisions keep their numbers
and meanings — renumbering them would falsify `specs/2026-08-23-p8.1b-closeout/plan.md` and the
change-log rows that cite them, the same reasoning that kept P8.5 out of sequence. P8.1 and P8.5
are already closed and stay closed. P8.2's launch-operations items move to P9.2. P8.3, P8.6 and P8.7
fold into P10.

**P9 — Production launch readiness** is new, with four sub-phases and an exit gate each:

- **P9.1 Security & transaction safety** — customer PII authorization, cancellation authorization,
  Stripe event binding, payment fail-closed, auth abuse control, cross-tenant DB integrity,
  commercial invariants.
- **P9.2 Production infrastructure & reliability** — deployable, recoverable, observable.
- **P9.3 Launch quality validation** — test the actual candidate.
- **P9.4 Launch certification** — game day, exact release verification, GO/NO-GO.

**P10 — Post-launch improvements** absorbs the former P8.3 catch-all, P8.6 and P8.7.

### Why P8.6 and P8.7 fold rather than survive

Both were created on 2026-08-28 by #420, one day before this slice. Keeping them alongside P10 would
give the roadmap four post-launch buckets whose boundaries are drawn by when they happened to be
filed rather than by anything a reader could use. They fold — but **#420's analysis is preserved,
not discarded**: the gate relationships it established (#363's hardcoded timezone gating #401 and
#402; ADR-006 gating #402 and #400's per-store half; #398's variant model gating #399 and #397's
Pack Size facet; #399 additionally needing a payments-capture decision amending ADR-005) all move
into the P10 prose. That analysis cost a slice to produce and none of it has expired.

### The three dispositions the human ruled

Recorded so they are not silently re-derived by a later reader:

1. **P8.6 and P8.7 fold into P10.** Alternative considered: keep them as named post-launch phases.
2. **#421's pre-launch set goes to P10 — except #398's unit-price half.** #420 judged all four items
   (#407 social links, #397's origin facet, #403 wallet check, #398's unit-price derivation) small
   enough to cross in front of launch. P9's rule is narrower: work required to launch *safely*.
   Social links and a filter facet are product scope. **#398's unit-price half is the exception**
   and stays pre-launch in P9.3, because `Product.unitLabel` is free text with no computed relation
   to `basePrice`, which is a UK Price Marking Order drift exposure rather than a feature gap.
3. **#221 goes to P10.** P7b shipped Art. 16 rectification as a name-change control and recorded the
   email half as a known gap; #104 landing in P9.2 removes its blocker, making it buildable
   immediately post-launch.

## Disposition of all 39 open P8 issues

| Destination | Issues | Count |
|---|---|---|
| P9.1 | #340 | 1 |
| P9.2 | #113, #104, #227, #246, #175, #219, #101, #94, #236 | 9 |
| P9.3 | #174, #350, #351, #398 | 4 |
| P10 | #390, #416, #421, #397, #403, #407, #221, #75, #100, #116, #137, #146, #147, #148, #149, #151, #232, #280, #286, #288, #372, #373, #423 | 23 |
| Closed as historical | #91, #408 | 2 |
| Left alone | #420 | 1 |

#390 is currently unmilestoned; it acquires P10. #243 is closed and is not touched.

**#91 and #408 are closed with `gh issue close`, never by a PR closing keyword.** #174 and #214 were
once closed by accident this way, and a PR body naming 39 issue numbers is precisely the shape that
repeats it. This slice's PR carries exactly one closing keyword: `Closes #426`.

## New issues this slice files

Nineteen, plus one conditional on the live bundles check.

**P9.1 (7).** Guest PII authorization; cancellation authorization; Stripe session binding; payments
fail-closed; auth rate limiting; cross-tenant DB integrity; commercial CHECK constraints.

**P9.2 (5).** Migration-safe deployment; release quality gates; backup/PITR and restore test;
critical alerting; rollback procedure.

**P9.3 (4).** LCP re-measurement; Playwright launch smoke suite; customer and staff UAT;
accessibility launch validation.

**P9.4 (3).** Production game day; exact release-candidate verification; final GO/NO-GO.

**P10 (1).** CSP hardening.

The remaining P10 themes — broader E2E coverage, loading and error-state polish, database and index
optimization, search evolution, caching, background-processing evolution, analytics separation — are
recorded as **roadmap prose and deliberately not filed as issues**. The brief rules out a generic
"optimize database" project by name, and the reasoning generalises: an issue that cannot state what
evidence would close it is a placeholder, and placeholders in a milestone are what produced the
39-issue P8 this slice is unwinding.

### The Playwright suite is a new harness, not an extension

There is no `playwright.config.ts`, no `e2e/` directory and no Playwright dependency in this repo —
checked, not assumed. The P9.3 smoke-suite issue therefore carries harness setup (dependency, config,
CI wiring, an authenticated-session fixture, and a decision about which environment it runs against)
before the first of its five journeys is written. Sizing it as "add five tests" would be wrong.

## Known limitation, recorded so it is not re-derived

**Project #2's Phase field cannot express P9 or P10.** Its options stop at P8, Projects V2 offers no
API to add field options, and the roadmap already records the identical problem for P7.5, P8.5, P8.6
and P8.7 under open **#267**. Board items for P9 and P10 issues stay on Phase `P8`; the milestone and
this roadmap carry the real phase. There is no application-code fix and this slice does not attempt
one — it extends #267's note to cover P9 and P10 so the next reader does not re-investigate.

## Deliberately not in this slice

- **Any fix for any item filed.** Not the guest PII authorization, not the cancel route, not the
  webhook binding. Each is a security change deserving its own spec, live validation and adversarial
  review; batching them into a sequencing slice would give all seven the review depth of a roadmap edit.
- **Promoting the outstanding `staging -> main` gap.** Six commits (#420's sequencing work) sit on
  `staging` unpromoted. That promotion is its own `/ship` and stacking this restructure underneath it
  would put two unrelated bodies of work in one production release.
- **Reopening #243, or filing a bundles fix without live evidence.** See above.
- **Renumbering P8.1, P8.2, P8.3, P8.5, P8.6 or P8.7.** Their numbers are cited by shipped specs and
  change-log rows.
