---
id: p1013-1012-help-facts-faq-corpus
title: "Help Centre exact facts + per-vendor approved-answer corpus (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-10
visibility: internal
summary: Replaces the Help Centre's platform-written claims with facts computed from VendorConfig and VendorDeliveryArea, and adds the per-vendor approved-answer model plus staff CRUD that every later answering surface depends on.
tags: [help-centre, faq, multi-tenant, vendor-config, chatbot-prerequisite]
related: [architecture, roadmap, sdd-workflow, design-system]
---

# Help Centre exact facts + per-vendor approved-answer corpus (plan)

Slice 1 of the chatbot programme (`#1015`), covering its two prerequisites: **`#1013`** (the Help
Centre answers from the database instead of hedged prose) and **`#1012`** (a per-vendor
approved-answer corpus exists at all). Both were filed by `/discover`'s eighth pass and approved at
`/propose` on 2026-10-10.

**Goal:** make `/help` tell each vendor's shoppers the truth — computed from that vendor's own
configuration — and give a vendor somewhere to put the answers this platform must not write on its
behalf. Shipping this means `#1015` has a corpus to answer from and a deterministic surface it does
not need to duplicate; not shipping it means any answering surface, AI or not, is built on prose
that contradicts the checkout.

## Why `#1013` is a correctness fix and not copy polish

`app/(storefront)/help/page.tsx` renders a hardcoded "Loyalty Points" section asserting, with no
condition attached:

> **Earning Points:** Every purchase earns you points automatically.
> **Redeeming Points:** Points can be redeemed for money off your next order. They are
> automatically applied at checkout when you have enough points.

`VendorConfig.loyaltyEnabled` is `Boolean @default(false)`, documented in
`prisma/schema.prisma` as shipping "dark for any vendor that hasn't opted in". **`/help` is the only
loyalty-mentioning surface in the application with no gate on that flag.** Every other one branches
correctly — `app/(storefront)/account/loyalty/page.tsx:38` returns `notFound()`,
`app/(storefront)/account/page.tsx:37,100` branches, `app/(storefront)/checkout/page.tsx:61`
requires it, and `lib/repositories/loyalty.ts:192,275` return `NO_REDEMPTION` / `0`.

`prisma/seed.ts` sets `loyaltyEnabled: false` for SriMart and `true` for Aheed — the second-vendor
check `CLAUDE.md` requires, and the exact difference several Aheed-only checks false-positive
against. Read live from production on 2026-10-10, `https://srimart.nocaped.com/help` (HTTP 200)
contains `Loyalty Points`, `Every purchase earns you points` and `Redeeming Points`. A shopper on a
store with loyalty switched off is currently told every purchase earns points.

That makes this a `#239`-class defect — a platform-authored claim rendering on behalf of a vendor it
is not true for — and it sits against `CLAUDE.md`'s "UI copy comes from the vendor or is neutral"
rule. Hedged wording is an accuracy improvement; promising a benefit that does not exist is a bug.

Two further instances, lower severity, are in scope because they are the same read:

- `minimumOrderPence` is `@default(0) // 0 = no minimum`, but the page states "A minimum order value
  **is required** for delivery". Both seeded vendors set a non-zero minimum (Aheed 1500, SriMart
  1000), so this is latent rather than currently false — it becomes false for the next vendor
  onboarded on the default.
- Collection is never mentioned. `offerCollection` and `expressCollectionEnabled` exist and Click &
  Collect shipped (`#402`), but the Delivery section describes delivery only.

## Scope (this slice)

**`#1013` — `/help` computes its facts.** `app/(storefront)/help/page.tsx` already calls
`getCurrentVendorProfile()`, and `VendorProfile` (`lib/repositories/vendor.ts:37-115`) already
carries `minimumOrderPence`, `deliveryFeePence`, `freeDeliveryThresholdPence`, `offerCollection`,
`deliveryPrefixes` and `deliveryAreas` with its per-area overrides. Loyalty comes from
`getLoyaltyRepository().config()` (`lib/repositories/loyalty.ts`, `LoyaltyConfig`). No migration and
no new table.

The one trap here is named in `VendorProfile`'s own docstring: *"Resolve a shopper's actual charges
with `lib/delivery-pricing.ts`'s `resolveDeliveryRules`, **never by reading the three vendor-wide
fields directly**."* Since `#890`, a `VendorDeliveryArea` row may override the fee, the minimum and
the free-delivery threshold per area, and a district row beats an area row. `/help` has no postcode
and no basket, so it cannot resolve one shopper's charges — it must therefore render the vendor
default **and**, where any area row overrides a value, say so and show the per-area figures.
Printing one flat figure as universal would be a new false claim in place of the one being removed.

**`#1012` — the approved-answer corpus.** A `VendorFaq` aggregate built on the `VendorReviewLink`
pattern (`prisma/schema.prisma:1081`), which already solved "the vendor owns the rows, the platform
compiles no names": adding an answer is then data, not a migration or a deploy. The full stack
mirrors that precedent file for file —
`lib/repositories/vendor-faqs.ts` (pure, explicit `prisma`/`vendorId`),
`lib/vendor-faqs-service.ts` (request-scoped facade),
`lib/faq-form.ts` (parsing, validation and the form-state type),
`features/admin/faqs.ts` (`"use server"`, async exports only),
`app/(admin)/staff/faqs/page.tsx` plus its form component, and the storefront render on `/help`.

Rendering the rows on `/help` is deliberately part of this slice rather than deferred to `#1015`.
It is a few lines on a page already being changed, and without it the corpus has no consumer and
no way to be proved to work before the chatbot exists — which is precisely how `#397`'s pack-size
facet shipped correct and inert.

Under `#239`'s null-hides rule a vendor with no rows renders no FAQ section at all. There is no
platform-authored fallback, by design.

## Deliberately excluded

- **The chatbot itself (`#1015`)** and any AI call, retrieval, embedding or `wa.me` context change.
  `components/layout/FloatingContact.tsx:116` keeps its current fixed message. Slice 3.
- **Conversation logging and the deflection rate (`#1014`).** It logs chatbot conversations, and
  until the bot exists there are none to log. Slice 3, not "alongside" as `#1015` suggests.
- **`#1016` (the hardcoded deprecated model id) and `#1017` (per-vendor AI budgeting).** Both touch
  shipped AI call sites on the public request path and neither is needed to render a page or store a
  row. Slice 2, kept out so a migration and a staff page are not validated in the same pass as a
  change to live inference.
- **Authoring the actual answers — `#1021`.** This slice ships the table, the editor and the
  rendering. The rows are vendor content that `ADR-004` and `#239` forbid this platform writing, and
  none is seeded for the same reason. `#1012` closes on tooling; `#1021` tracks the content.
- **AI-assisted answer drafting**, FAQ search, categories/grouping, per-answer analytics, rich text
  or Markdown in answers (plain text only), and any shopper-facing question submission.
- **`#892`'s store-admin-guide correction.** This slice must match the code's
  `freeDeliveryThresholdPence` semantics and will not restate the guide's wrong version, but fixing
  that guide is `#892`'s own scope.
- **Reworking `docs/shopper-help/shopping-guide.md` wholesale.** Only the sentences this slice makes
  self-contradictory are touched; `#1012`'s corpus is what eventually replaces that document's role.
  Note that `/help` renders this document's content verbatim, so its "Loyalty Program (If Enabled)"
  block is inside `#1013`'s gate, not outside it.
- **Any data-rights path for the new table.** `VendorFaq` holds vendor-authored business content,
  not shopper personal data, so it is outside `lib/repositories/data-rights.ts` by the same
  reasoning that puts `DeliveryRefusalCount` outside it. `#1014`'s conversation log is the one that
  will hold customer-written text and will need that path.

## Open items carried forward

- **`#1021`** — Aheed's and SriMart's answer rows. `#1015` is blocked on it, not on code.
- **`#892`** — the store-admin guide's `freeDeliveryThresholdPence` claim.
- **`#1014`**, **`#1016`**, **`#1017`**, **`#1015`** — slices 2 and 3 above.
- **`#606`** — substitution and paid-order cancellation still cannot be resolved by anyone, so no
  answer written here may promise either.
