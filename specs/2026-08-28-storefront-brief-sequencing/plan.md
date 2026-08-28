---
id: storefront-brief-sequencing-plan
title: "Storefront & fulfilment brief — roadmap sequencing (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-28
visibility: internal
summary: "Sequences the fourteen issues of the #408 storefront and fulfilment brief into the roadmap as two new phases (P8.6, P8.7) plus a small pre-launch set inside P8.2, and writes ADR-006 to settle the store-location question that gates two of them."
tags: [roadmap, sequencing, adr, storefront, fulfilment, planning]
related: [roadmap, adr-004-multi-tenancy, adr-005-payments-money-flow, mission]
---

# Storefront & fulfilment brief — roadmap sequencing (plan)

**Goal:** turn the fourteen issues filed under the #408 brief (#394–#407, filed 2026-08-27) from a
holding position into a sequenced part of `specs/roadmap.md`, and settle the one architectural
question that makes two of them un-sizeable. Shipping this slice means the next `/orient` reads a
roadmap that matches the issue tracker, instead of one that does not mention the brief at all.

This is documentation and decision work. **No storefront feature from the brief is built here.**

## Why this slice exists

`specs/roadmap.md` (v1.51.0) does not contain the strings `#408`, `#394` or `#407`. Fourteen issues
exist, are on Project #2, and carry milestone **P8 — Deployment & launch** as an explicitly stated
holding position that #408's own body calls "not a sequencing decision". Meanwhile the roadmap says
P8.2 (Launch & Operations) is next and the store is not live. Fourteen storefront features arriving
in front of a launch is a scope decision that has to be made deliberately rather than absorbed.

Four forks were put to the human at `/propose` (#420) and answered. This slice implements those
answers; it does not re-open them.

## What the verification pass changed

Every load-bearing claim in #408 was checked against the schema and code before the proposal. Three
came back different from the brief, and the third is the one that most changes sizing:

- **#407 is not schema-free.** Neither `VendorConfig` nor `VendorBranding` has any social field, so
  the "small, self-contained" item still needs a migration. Additive and nullable, but real.
- **#403 is smaller than assumed.** `lib/payments.ts` uses hosted Stripe Checkout with
  `mode: "payment"` and pins no `payment_method_types`, so wallet availability is Dashboard-
  controlled. Expected to ship no application code; the only real work is Apple Pay domain
  registration, and the live half waits on #113.
- **#399 is gated twice, not once.** `lib/payments.ts` sets no `capture_method`, so the integration
  captures immediately. The brief's "pre-authorise plus or minus 10 percent" scale guarantee needs
  manual capture or adjustable authorisation — a payments decision amending ADR-005 — *on top of*
  the variant model it already depends on. Nothing in the brief says this, and it makes #399 the
  most under-estimated item in the set.

## Scope (this slice)

**1. `specs/roadmap.md` — the sequencing.**

- Two new phases, appended rather than renumbered, following the same "out of sequence on purpose"
  convention P8.5 already set. P8.1, P8.2, P8.3 and P8.5 keep their existing numbers and meanings,
  and P8.3 remains the unscheduled catch-all.
  - **P8.6 — Storefront discovery & conversion** (post-launch): #394, #395, #396 paired with #286
    (same `pg_trgm` code path), #406, #405's link-only half, #400's async-loading half, and #397's
    three boolean certification facets.
  - **P8.7 — Fulfilment & merchandising data models**: #398's variant and unit-of-measure model,
    #399, #401, #402, #397's Pack Size and Brand facets, and #400's per-store half.
- A **pre-launch set named inside P8.2**: #407, #397's Country-of-Origin facet, the #403
  investigation, and the unit-price derivation half of #398. Sequenced here, built by its own later
  slice under its own issue — this slice does not build it.
- The **#397 split recorded explicitly**, because the brief files it as one item and it is not one:
  Country-of-Origin is pre-launch, the three boolean certifications are P8.6, Pack Size and Brand
  are P8.7 behind the variant model.
- The **gates recorded** so a future reader does not re-derive them: #363 gates #401 and #402;
  #113 gates #403's live half; ADR-006 gates #402 and #400's per-store half; the discount engine
  (#146, #147, #148, #372, #377) gates #404; #398's variant model gates #399 and #397's Pack Size
  facet; and #399 additionally needs the payments-capture decision described above.
- The carry-forward change-log row for **PR #419**, which `npm run sdd:audit` currently reports as
  pending.

**2. `specs/decisions/ADR-006-store-locations.md` — the ruling.**

#400's per-store stock counts and #402's collection points both imply multiple physical locations,
which `specs/mission.md` lists as out of scope. The human's ruling at `/propose` was to settle it in
its own ADR before either issue is scheduled.

The ADR answers the **architectural** half, which is the expensive-to-retrofit half: if locations
are ever introduced, are they a second tenancy axis or an attribute of a vendor? It decides that
`vendorId` remains the sole isolation axis and a location never becomes a second mandatory filter in
`lib/repositories/*` — because that filter is ADR-004 decision 2's central invariant and making it
a pair would be a rewrite of every repository query, not an addition.

It deliberately leaves the **business** half open: whether Aheed actually trades from more than one
site is not a question this repo can answer, and the ADR does not pretend to. What it removes is the
architectural uncertainty that made #400 and #402 impossible to size.

**Filed as a new ADR rather than an amendment to ADR-004** because ADR-004's numbered decisions are
cited by name across `CLAUDE.md`, `specs/architecture.md` and several slice specs; editing it in
place risks invalidating live citations. ADR-006 cross-references it instead.

**A naming collision this ADR has to resolve.** ADR-004 decision 1 already anticipates
`Region`/`Location` "as their own reference tables when geography grows beyond delivery areas" —
a *geography reference* concept for delivery areas, not a trading site with stock and a collection
counter. Two different ideas are competing for one word, and ADR-006 says which is which rather
than leaving a future reader to guess.

**3. Issue tracker reconciliation.**

New GitHub milestones for P8.6 and P8.7 (following the existing `P7.5` and `P8.5` milestone
precedent), and the fourteen issues re-milestoned off their P8 holding position onto the phase each
now belongs to.

## Deliberately excluded

- **No feature from the brief is built.** Including the pre-launch set — it is sequenced here and
  built by its own slice under its own issue, so a sequencing slice does not quietly become a
  feature slice.
- **`specs/mission.md` is not amended.** Per the `/propose` ruling, a click-to-chat link is a
  contact channel rather than notification automation, so #405's link half does not reverse the
  out-of-scope line. The chat-driven re-order half stays out of scope. The multi-branch line also
  stands, because ADR-006 rules on shape without committing the business.
- **The discount-engine decision is not taken.** #404 is recorded as gated, not resolved; #146,
  #147, #148, #149, #372 and #377 all stay open and unscheduled.
- **ADR-005 is not amended.** The #399 capture finding is *recorded* in the roadmap so it stops
  being invisible, but the payments decision itself belongs to whichever slice actually builds
  #399, not to a sequencing pass.
- **No board Phase-field values are created.** Project #2's Phase field has options only through
  P8 and they are UI-only in Projects V2 with no API to add them — the same gap as the already-open
  #267. Board items stay on Phase P8; the roadmap and the GitHub milestone carry the real phase.
- **#232** (wishlist) is untouched. It predates the brief and keeps its current position.

## Open items carried forward

- **#267** — Project #2's Phase field cannot express P7.5, P8.5, P8.6 or P8.7. This slice adds two
  more phases the field cannot represent, which makes the gap slightly worse and is worth saying out
  loud rather than discovering later.
- **#363** (vendor timezone is a hardcoded constant) remains the blocker for #401, #402 and the
  already-open #379. This slice records the dependency; it does not fix it.
- **#113** (production Stripe test keys) still gates #403's live half.
- The **business question** ADR-006 leaves open: whether Aheed trades from more than one physical
  site. Until that is answered, #400's per-store half and #402 stay scheduled-but-unstarted in P8.7.
