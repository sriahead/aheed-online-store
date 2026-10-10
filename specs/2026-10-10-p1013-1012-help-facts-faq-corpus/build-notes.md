# Help Centre exact facts + per-vendor approved-answer corpus (build notes)

Slice 1 of the chatbot programme: `#1013` (the Help Centre computes its delivery, collection and
loyalty facts) and `#1012` (the per-vendor approved-answer corpus, its staff editor and its
storefront rendering). Built 2026-10-10 on `feature/p1013-1012-help-facts-faq-corpus`, spec commit
`20f708b`.

**Read this first if you are validating:** two things found during the build are not in
`requirements.md` as originally approved — a spec amendment to R14 (recorded inline in
`requirements.md` itself) and a live production defect fixed in passing (`#1022`). Both are below
under *Decisions* and *Deviations*.

## What changed and why

**`#1013` — `app/(storefront)/help/page.tsx`.** The page previously asserted four things as
platform prose that are per-vendor settings: that points are earned on every purchase, that a
minimum order is required, a single delivery fee, and nothing at all about collection. It now reads
`VendorProfile`, `LoyaltyConfig` and the vendor's active answers, and renders only what is true for
that vendor.

- The **loyalty panel is gated on `loyalty.loyaltyEnabled`**. That flag is `@default(false)`, and
  every other loyalty surface already respected it (`/account/loyalty` 404s, `/account` and
  `/checkout` branch, `lib/repositories/loyalty.ts` returns `NO_REDEMPTION`). This page was the only
  one that did not, and the promise was live on SriMart's production Help Centre.
- **Money is never read off the profile for display.** `lib/help-facts.ts` is new and holds all of
  it: it resolves each `VendorDeliveryArea` row through `resolveDeliveryRules`
  (`lib/delivery-pricing.ts`) and reports which of the three figures vary. The page prints one
  figure only where nothing overrides it, and a per-area breakdown where something does. This is the
  trap `VendorProfile`'s own docstring names — reading the three vendor-wide fields directly would
  have replaced a false loyalty claim with a false pricing claim for any vendor using `#890`'s
  per-area overrides.
- **`0` and `null` both mean "free delivery not offered"**, per `lib/delivery-pricing.ts`. The page
  never renders a `£0.00` threshold. `#892` is open because the store-admin guide says a `0`
  threshold makes every order free; the code is authoritative and this follows the code.
- Collection renders only under `offerCollection`, and its minimum comes from the `COLLECTION`
  resolution, which is always the vendor defaults — per-area pricing does not apply to collection.
- The postcode list renders only when `deliveryPrefixes` is non-empty (`#239`'s null-hides rule).

**`#1012` — the corpus, mirroring the `VendorReviewLink` stack file for file.** `VendorFaq` in
`prisma/schema.prisma`, migration `20261010120000_p1012_vendor_faq`,
`lib/repositories/vendor-faqs.ts` (pure), `lib/vendor-faqs-service.ts` (request-scoped facade),
`lib/faq-form.ts` (parsers, caps and the form-state type), `features/admin/faqs.ts` (`"use server"`,
async exports only), `app/(admin)/staff/faqs/page.tsx`, `components/staff/FaqManager.tsx`, and the
render on `/help`.

- **No answer text exists anywhere in the repository** — not in the schema, the seed, a placeholder
  or a default parameter. The staff form's placeholders are instructions ("Type a question a shopper
  actually asks you"), never sample content, because a sample question is a claim about what the
  vendor sells. `#1021` tracks the content itself.
- The three required staff surfaces are wired: `components/staff/PanelNav.tsx` (admin tier only,
  matching the `ADMIN` gate the parity test derives from the page), the hub card in
  `app/(admin)/staff/page.tsx`, and a seven-part section in
  `docs/store-admin-guide/admin-tabs-guide.md`.

**`docs/shopper-help/shopping-guide.md`** lost its hedged delivery bullets and its whole
"Loyalty Program (If Enabled)" section, and its "Paying" line stopped mentioning loyalty points.
This was not cosmetic: `/help` renders that document verbatim, so its loyalty wording would have
rendered for a loyalty-off vendor and defeated `#1013`'s own gate. Front matter bumped to 1.6.0 and
the `loyalty` tag dropped. `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` regenerated.

**Tests.** `tests/help-vendor-facts.test.tsx` (11 cases) renders the real page against mocked
vendors; `tests/help-facts-and-faq-form.test.ts` (15 cases) covers the two pure modules.

## Decisions taken during the build

**`updateMany` over `getPrismaWs()` for the three edit paths — and R14 amended to say so.** The spec
as approved forbade `updateMany` outright, which contradicted R15: a singular `update` cannot carry
a non-unique `vendorId` filter, so another vendor's id throws `P2025` rather than affecting zero
rows. Resolving it the other way would have meant branching on `error.code`, which `CLAUDE.md`
warns reports different values on the two adapters. `lib/repositories/brands.ts:158` and
`lib/repositories/attributes.ts:230` already solved exactly this with a mixed-client module, so
`vendor-faqs.ts` takes `DbWs` for `updateFaq`/`setFaqActive`/`reorderFaq` and `Db` for the reads,
the childless `create` and the `deleteMany`. The amendment and its reasoning are recorded inline in
`requirements.md` under R14, not only here.

**The unique key is `(vendorId, question)` but writes are keyed by `id`.** The precedent upserts on
its natural key (`vendorId_platform`), which is right for a short stable platform label and wrong
for a question: editing the wording would orphan the answer into a new row instead of correcting
it. The unique index is kept as a data-quality rule — a duplicate question is refused and reported
as a field error rather than throwing.

**`isUniqueViolation` reused, not reimplemented.** First draft had a local `P2002`/`23505` check;
`lib/repositories/prisma-errors.ts` already exports the shared helper, which exists precisely so
that comparison lives in one place.

**Visibility and order are one-field forms.** Toggling a row's visibility does not resubmit its
question and answer, so a stale editor tab cannot silently revert a concurrent edit.

**Tier wording preserved rather than dropped.** Removing the guide's loyalty section would have
deleted its tier explanation, which no other shopper surface carries. The gated panel now reads
`getLoyaltyRepository().tiers()` — an existing method, no new query shape — and names the vendor's
real tiers, hiding the sentence when it has none. Deleting documented shopper information to satisfy
a copy rule would have been a regression.

**Answer cap set at 1,200 characters** with `#1015` in mind: `wa.me`'s `?text=` truncates silently
and its ceiling varies by platform, so bounding at the source is cheaper than bounding at every
future consumer. Plain text only, rendered by React, so nothing is parsed as Markdown or HTML.

**`beforeAll` warms the page import in the render test.** The page imports the large generated
`DOC_ARTICLES`; that cost landed on whichever test ran first and tripped the 5s timeout. Warming it
in setup makes the cost explicit rather than flaky.

## Deviations from the spec

**1. R14 was amended, in `requirements.md`, before it was implemented.** See *Decisions* above. The
approved text forbade `updateMany`; the implemented text requires it through `getPrismaWs()`. This
is a reviewed change to the spec, not an undocumented departure from it.

**2. A live production defect was fixed in passing: `#1022`.** `/help` selected its shopper
documentation by **audience alone**, with no visibility filter. Three articles match that, two of
them `visibility: internal`, and the internal `docs/operations-research/order-fulfilment-core.md`
sorted first — so `shopperDocs[0]` was serving an internal operations document on the public Help
Centre of every vendor, while the public shopping guide was never rendered at all. Verified live on
2026-10-10: `https://srimart.nocaped.com/help` contained `Order & Fulfilment Operations`,
`PENDING_PAYMENT`, `Known Trap` and `Capacity Limit`, and did **not** contain `Guest Checkout`.

The filter now also requires `doc.visibility === "public"`, which reduces the match to exactly one
article. This was **not optional for this slice**: R1 ("no loyalty wording when loyalty is off")
cannot hold while an internal document discussing points renders there unconditionally. The defect
predates the slice and has its own cause, so it is filed as `#1022` with the follow-ups this slice
did **not** do — no test asserts that every shopper-facing render path is visibility-filtered, and
`shopperDocs[0]` is still an array index that happens to be correct because exactly one article now
matches.

**3. R4 and R16 were clarified, not changed in substance.** R4 named `resolveDeliveryRules` as the
page's direct call; the page reaches it through `helpDeliveryFacts`, so R4 and its validation row
now name that wrapper and additionally require `lib/help-facts.ts` to call `resolveDeliveryRules`.
R16 now states explicitly that a **type-only** import of the row shape in a component is permitted,
matching `components/staff/ReviewLinksManager.tsx`. Both were corrected so a fresh validator reads
the requirement that was actually built.

## Known-shaky areas

**The client wiring is the single biggest risk, and it is not proven yet.** R15 was proved against
the real dev database, but with one `PrismaClient` constructed directly in a script — so it proves
the repository's *tenancy* logic, not that `lib/vendor-faqs-service.ts` hands `getPrismaWs()` to the
three update paths in a real request. An `updateMany` reached through `getPrisma()` crashes
unconditionally, including on zero rows, and nothing in `lint`, `typecheck`, `test` or `build` can
see it. **Validation must edit, hide and reorder a row under `npm run preview`** — not `npm run
dev`, which cannot load the WASM engine. If any of those three actions 500s while create and delete
work, this is why.

**`features/admin/faqs.ts` is enforced at runtime only.** It exports four async functions and
nothing else; `revalidateFaqSurfaces` is a non-exported sync helper, which is allowed because the
rule constrains exports. A single value export would 500 every action while every static check
stays green. Submit the form once for real.

**What was proved against the real database, for the record** (dev, `ep-dry-morning-zab7dx08`,
2026-10-10): cross-vendor `updateFaq` → `{ok:true,count:0}`; cross-vendor `setFaqActive` → `0`;
cross-vendor `deleteFaq` → `0`; the row intact afterwards; a duplicate question → `ok:false,
DUPLICATE_QUESTION` rather than a throw; the same question accepted for a second vendor; the owner's
own update → `count:1`; zero probe rows left behind.

**The migration reached dev by hand, because `#895` blocks the normal path.** `prisma migrate dev
--create-only` demanded a full reset of dev over the unrelated
`20260820200500_p8_image_needs_review` checksum drift. The SQL was generated with `prisma migrate
diff --from-schema-datasource --to-schema-datamodel` (the route the previous migration also took),
read in full, applied with `prisma db execute`, then recorded with `prisma migrate resolve
--applied`. **Dev therefore has the table and a resolved history entry** — staging and production
get it from CI as normal. A validator does not need to re-apply anything.

**Per-area breakdown needs a second vendor and a real override row.** The unit tests cover
area-versus-district resolution, including the detail that a bare `MK` matches nothing until a digit
is appended, but no live override exists in the seed. Add one on `/staff/delivery-areas` to see the
breakdown render, and remove it afterwards.

**`npm run build` had not finished when these notes were written.** `lint`, `typecheck`,
`format:check`, the full suite (220 files / 2862 tests) and the docs-site build all passed. CI is
ground truth for the build.

**Unrelated observation, not touched: `#797` is real and visible.** Listing vendors on dev returned
roughly 190 leftover `test-vendor-*`, `express-test-*` and `concurrency-test-*` rows from live-DB
test fixtures. It did not affect this slice — the probe selected the two alphabetically real vendors
— but it makes any "list all vendors" check on dev noisy.
