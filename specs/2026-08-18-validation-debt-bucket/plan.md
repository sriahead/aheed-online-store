---
id: validation-debt-bucket-plan
title: "Validation debt bucket (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-18
visibility: internal
summary: "Closes #192, #103, #207 and #224 as one block: rewrites P6.6's and P6.6c's unwalkable exit gates and walks them, live-verifies P3c's never-proven payment-failure path, teaches sdd:audit to see a missing promotion row, and covers reverseRedemption's null-owner path."
tags: [p7, validation, sdd, audit, stripe, debt]
related: [roadmap, sdd-workflow, gap-register, p6-5-residual-validation-plan, 2026-08-13-p6-6-p0-ui-overhaul, p6-6c-operations-completion, p3c-stripe-payments]
---

# Validation debt bucket (plan)

**Goal:** close the last four open instances of *a requirement that shipped without ever being
checked against the artifact*, and remove the tooling blind spot that lets that class of miss go
unnoticed after Ship.

## Why this slice exists

Issue **#231** groups four issues that look unrelated on the board and are in fact the same defect:

| Issue | The unchecked thing |
|---|---|
| **#192** (item 4) | P6.6 and P6.6c shipped by direct push during the ungated period; their acceptance criteria have never been compared to the artifact |
| **#103** | P3c's R7 payment-failure path was proven by unit tests and code review only |
| **#207** | `sdd:audit` has no notion of a promotion, so a missing roadmap row for a `staging → main` PR is structurally invisible — five consecutive recurrences |
| **#224** | `reverseRedemption`'s null-owner branch, P7b's highest-risk edit, is verified by reading only |

This is the third slice in a row to pay down this debt (`specs/2026-08-17-p6.7-closeout-promotion/`,
then `specs/2026-08-17-p6.5-residual-validation/`), and it is intended to be the last one.

### Neither legacy spec can be walked as written

This is the finding that shapes the slice, and it is one level up from "P6.6 and P6.6c weren't
tested":

- **`specs/2026-08-13-p6.6-p0-ui-overhaul/validation.md`** — six of eight rows read "visually verify
  … **matches the prototype**". Unfalsifiable. Two readers can reach opposite verdicts and neither
  can be shown wrong.
- **`specs/2026-08-13-p6.6c-operations-completion/`** — never used the Gate-2 format at all.
  `requirements.md` is checkbox bullets rather than numbered `R1..Rn`; `validation.md` is a
  checklist rather than a `| Req | How to verify |` table. There is no numbering to map rows onto.

That is the same shape as P6.5's exit gate, which asked only that a document *claim* zero unresolved
gaps — the mechanism that let GAP-010 sit as an accounted-for `Deferred` row while staff bulk
transitions were never built, undiscovered until PR #204. **A gate that reads a document instead of
the code passes forever.** Both specs are therefore rewritten to checkable rows *before* being
walked, per the decision taken at `/propose`.

### Two defects are already confirmed, before the walk starts

Found while grounding this spec against the code. Recorded here so the walk is not credited with
discovering what was already known, and so neither can quietly evaporate:

**1. The homepage hero image is blocked by this project's own CSP — live in production.**
`app/(storefront)/page.tsx:103` renders
`<img src="https://images.unsplash.com/photo-1542838132-…">`, the only external image URL in
`app/`, `components/`, `features/` or `lib/`. P7a's `Content-Security-Policy`
(`next.config.mjs:47`) sets `img-src 'self' data: https://*.nocaped.com`, which does not include
`images.unsplash.com`. The image has been failing its CSP check since PR #206 promoted the CSP to
production on 2026-08-17. It independently violates P6.6's own **R6** ("dynamically respect the
active tenant's `VendorConfig` … rather than hardcoded global assets") — a hardcoded stock photo is
the definition of a hardcoded global asset.

**2. P6.6's R1 requires a wishlist link in the header that was never built.** The string `wishlist`
appears nowhere in `app/`, `components/`, `features/` or `lib/` — only in P6.6's own `plan.md` and
`requirements.md`, and in P3a's `plan.md`. `components/layout/Header.tsx` has the logo, locality
indicator, search, account link and cart trigger; there is no wishlist control. **This is a second
GAP-010** — a requirement recorded as delivered against code that does not implement it.

### How each of those two is handled — and why differently

They get opposite treatment on purpose:

- **The CSP-blocked image is corrected in this slice.** R6 already forbids it, so removing it
  applies an approved requirement rather than making a new decision — the same reasoning that let
  P7a's guest-lookup hole be fixed under `/fix` rather than bounced back to Spec. The minimal
  correction is to **delete the hardcoded `<img>` element**; the hero section keeps its
  brand-coloured panel and blur glow, both already token-driven. A genuine per-vendor hero image
  needs a new `VendorConfig` field and a migration, which is a feature — filed as its own issue,
  not built here.
- **The wishlist is not built here, and the requirement is not deleted either.** Building it needs
  schema, auth-gated persistence and UI — a feature, and exactly the scope creep this repo keeps
  paying for. But rewriting P6.6's requirement to match what the code happens to do would be
  certifying the artifact by redefining the gate, which is the sin this slice exists to end. So the
  rewritten requirement **keeps the wishlist obligation and marks it `Deferred` to a filed issue**,
  and its `validation.md` row asserts *that the deferral is recorded and the issue is open* — never
  that the header passes. Same posture as GAP-013's `Fixed (partial)`.

**The rewritten specs must describe what P6.6/P6.6c were required to deliver, not what the code was
later found to do.** Where the two differ, the difference is the finding. This is the single
highest-risk way this slice could go wrong: a rewrite that quietly tracks the implementation would
produce two green gates and prove nothing, and would be very hard for a reviewer to spot.

## Scope (this slice)

**1. Rehabilitate `specs/2026-08-13-p6.6-p0-ui-overhaul/`.** Rewrite `requirements.md` to numbered
`R1..Rn` and `validation.md` to a `| Req | How to verify |` table with one row per requirement,
every row naming a command, a file property or an observable behaviour. Preserve the original
intent of R1–R8; carry the wishlist obligation forward as an explicit deferral.

**2. Walk the rewritten P6.6 gate live** against `npm run preview` and the deployed staging host,
including a second vendor (`srimart-staging.nocaped.com`) for the multi-tenancy row, since a
single-vendor render cannot distinguish `VendorConfig`-driven branding from a hardcoded default.

**3. Rehabilitate `specs/2026-08-13-p6.6c-operations-completion/`** the same way, and **walk it
live** across both roles. Its stalest content is already known: its `validation.md` asserts the
admin nav shows "all 9 tabs", while `components/staff/PanelNav.tsx` renders **ten** for the admin
tier — P6.7 added `Team` afterwards. The rewrite states the P6.6c-era obligation as a subset that
must be present, so a later slice legitimately adding a tab does not falsify the gate.

**4. Correct the CSP-blocked hero image** (`app/(storefront)/page.tsx:103`) per the reasoning above.

**5. #103 — live-verify P3c's R7.** In a deliberate, separately-confirmed window: set an invalid
`STRIPE_SECRET_KEY` on the staging Worker, place an order, confirm the failure path (order left
`CANCELLED`, a matching `OrderStatusEvent`, `Inventory.quantity` restored to its pre-order value),
then restore the real key from `secrets/staging.vars` and prove the restore with a successful
payment run.

**6. #207 — teach `sdd:audit` to see promotions.** Extend `scripts/sdd-check.ts`'s audit mode to
enumerate merged `staging → main` PRs after the loop baseline and report any whose PR number or
merge SHA is not cited by a `specs/roadmap.md` change-log row, with a degraded skip path when `gh`
is unavailable and no false positive for a legitimately pending carry-forward.

**7. #224 — cover `reverseRedemption`'s null-owner path** in `tests/loyalty.test.ts`.

**8. Triage whatever the walks find.** A small correction lands here; anything needing a new
decision becomes a filed issue and a recorded deferral.

## Deliberately excluded

- **Building the wishlist**, and adding a per-vendor hero image field to `VendorConfig`. Both are
  features; both get issues.
- **P7a's per-slice walk.** Effectively performed by PR #204, which found and fixed three defects
  against P7a's own spec. #192 item 4 named it alongside P6.6/P6.6c; it is discharged.
- **#104** (Resend verified sending domain) and **#113** (production Stripe live keys). Owner
  provisioning actions, both P8, both stay open. #103's inbox-delivery half stays unprovable until
  #104 lands — recorded as a limitation, not worked around.
- **#163 / #169 / GAP-011** — search indexing, assessed under #218 (P7d).
- **Any accessibility or observability work.** #217 and #218 are their own slices; a UI walk that
  drifts into an a11y pass would swallow both.
- **Backfilling roadmap rows that #207's new check might reveal.** The tooling is this slice's
  deliverable; if it reports a genuinely missing historical row, that row is written here only if it
  is this slice's own carry-forward, and otherwise filed.

## Open items carried forward

- **#231** closes on promotion; **#192, #103, #207, #224** close with it.
- **#104 / #113 / #163 / #169 / #174** all stay open and are named in this slice's documents —
  never adjacent to a closing keyword. PR #214 closed #174 by accident from a *commit message* that
  quoted the words `closes #174` inside a sentence correcting that very claim.
- **#103 depends on a human-confirmed window** against shared staging infrastructure. If the window
  does not happen, #103 stays open and this slice closes the other three, saying so explicitly
  rather than reporting the block as complete.
