---
id: p905-vendor-product-labels-plan
title: "#905 — Per-vendor product labels, store description for AI, delivery-area examples (plan)"
audience: [dev]
status: draft
type: spec
version: "1.0.0"
updated: 2026-09-26
visibility: internal
summary: Each vendor chooses which grocery labels its staff product form shows and describes what it sells for the AI prompts. Delivery-area examples and help copy come from the vendor's own area, and referral share text uses the real discount. One additive migration.
tags: [multi-tenancy, vendor-neutral, catalogue, ai, delivery-areas, referrals, p10]
related: [p729-vendor-neutral-ui-copy-plan, architecture]
---

# #905 — Per-vendor product labels, store description for AI, delivery-area examples (plan)

**Goal:** a vendor that does not sell groceries (SriMart, electronics, in Reading) is no longer
treated as a Milton Keynes grocer on the surfaces this slice touches:

- its staff do not see Halal, Fresh, Organic, Vegetarian, Gluten free or HMC controls;
- the AI prompts are not told the shop is a grocer;
- its delivery-area page and help page do not use Milton Keynes as the example;
- its referral share messages quote the discount the shopper will actually get.

It is **slice 2 of `#729`** (slice 1, PR #908, removed hardcoded copy). This slice adds the vendor
settings that copy alone could not provide. The owner approved the scope at `/propose` on
2026-09-26. The decisions are recorded as comments on `#905`.

Folded in: **`#907`** (the referral share text says "£5"), and the **delivery-area examples**. The
owner raised the examples from a screenshot of a Reading store's `/staff/delivery-areas` page
showing MK examples.

## Owner decisions this spec implements (2026-09-26, `/propose`)

1. **Label settings are six yes/no columns on `VendorConfig`.** They are not a child table and not
   a "vertical" enum. A vertical enum was argued against at orient because it breaks at the third
   kind of shop.
   - The product-side booleans stay. `docs/research/discovery-log.md` (2026-09-07, the `#398`/`#601`
     finding) holds that they are sound.
   - Adding a seventh label still needs a migration on both `Product` and `VendorConfig`. This slice
     does not change that.
2. **A label switched off is hidden on the staff product form, and each product's stored value is
   kept.** A hidden checkbox submits nothing, and today's parser reads "nothing" as `false`. So the
   save path must stop writing a label the vendor has switched off; otherwise every save would
   silently wipe that label. The storefront is unchanged: badges and facets already appear only
   where products carry the flag.
3. **A new optional "store description" setting feeds the three AI prompts.** When it is blank, the
   prompts use neutral wording and never say "grocery".
4. **Existing vendors are backfilled from data, not by name.** The migration switches a label on for
   a vendor only when at least one of that vendor's products already carries it. New vendors start
   with every label off.

## Scope (this slice)

**A. Per-vendor label settings (`#905` part 1)**

- **Schema.** One additive migration adds seven `VendorConfig` columns:
  - `showHalalLabel`, `showFreshLabel`, `showOrganicLabel`, `showVegetarianLabel`,
    `showGlutenFreeLabel` and `showHmcCertification`: each `Boolean @default(false)`;
  - `storeDescription`: `String?`.

  The migration's backfill `UPDATE` sets each of the six booleans from an `EXISTS` over that
  vendor's `Product` rows (active and inactive), per decision 4. It names no vendor.
- **Settings UI.** A new "Product labels & store description" form on `/staff/storefront`
  (ADMIN only), with its own server action `updateCatalogueSettings` in
  `features/admin/storefront.ts`.
  - It follows the existing pattern: the delivery-rules and social-links forms each have their own
    action so that one form never rewrites another's fields.
  - Parsing lives in a new pure module, `lib/catalogue-settings-form.ts`.
  - HMC certification is only valid while Halal is on. HMC is a halal certifying body, and the
    product form already ties the two together. Saving HMC on with Halal off is refused with a field
    error; the parser does not quietly switch it off.
- **Profile.** `VendorProfile` (`lib/repositories/vendor.ts`) gains the six booleans and
  `storeDescription`. A vendor with no `VendorConfig` row resolves every label to `false` and the
  description to `null`.
- **Staff product form.** `components/staff/ProductForm.tsx` takes a required `labels` prop.
  - It renders only the enabled label checkboxes.
  - It renders the HMC section only when both Halal and HMC certification are enabled.
  - `Featured on homepage` and `Visible in the shop` are not labels and always render.
- **Save path.** `saveProduct` (`features/admin/catalogue.ts`) reads the vendor's label settings
  server-side and removes every disabled label's fields from the write:
  - `isHalal`, `isFresh`, `isOrganic`, `isVegetarian` and `isGlutenFree` for their own labels;
  - `isHmcCertified`, `hmcReference` and `hmcVerifiedAt` when HMC is not shown.

  The effects:
  - an **update** leaves those columns exactly as stored;
  - a **create** leaves them at their schema defaults;
  - a crafted request carrying a disabled label's field cannot set it, because the stripping is
    server-side.

**B. Store description in the AI prompts (`#905` part 2)**

- The first line of each prompt changes from a grocery framing to a neutral one:
  - `lib/list-normalisation.ts` `buildNormalisationPrompt`: "UK grocery shopping lists, including
    South Asian terms";
  - `lib/search-synonym-proposals.ts`: "UK grocery shoppers … South Asian grocery catalogue";
  - `lib/net-content-suggester.ts` `buildNetContentPrompt`: "one UK grocery product".
- When the vendor has a description, each prompt adds one line quoting it as the shop's own words.
- Each builder takes the description as a **required** `string | null` parameter, so a caller
  cannot silently forget it (the `#729` rule against defaults). The callers resolve it:
  - `features/cart/match-list.ts`, from the current vendor profile;
  - `lib/search-synonyms-service.ts`, from the vendor's config;
  - `lib/net-content-run.ts` and `scripts/suggest-net-content.ts`, per vendor;
  - `scripts/verify-list-normalisation.ts`.
- The description is admin-written text sent to a model. So it is:
  - trimmed;
  - limited to 200 characters;
  - collapsed to one line;
  - placed inside quotation marks after a label.

  It is never allowed to replace the instruction text. Aheed's South Asian vocabulary context,
  which today is hardcoded for every vendor, moves into Aheed's own seeded description.
- `MAX_AI_INPUT_CHARS` in `features/cart/match-list.ts` still measures the real prompt, which now
  includes the description. That is the existing contract; this slice only makes the description
  part of what is measured.

**C. `#907`: referral share text**

- `buildShareLinks` (`lib/referrals.ts`) takes a required `discountOffPence: number`. Its X,
  WhatsApp and email messages format that value with `formatPrice` instead of the literal `£5`.
- `ReferralCard` passes it through.
- The literal `500` defaults become the `REFERRAL_DISCOUNT_PENCE` constant:
  - `components/rewards/ReferralCard.tsx`, its `discountOffPence = 500` default;
  - `components/rewards/RewardsPanel.tsx`, its `?? 500` fallback.
- **Correction to `#907`'s premise, found at `/spec`:** `#907` says a vendor may configure a
  different referral discount. Nothing lets a vendor do that. `getReferralStats` and
  `ensureReferralDiscountCode` both use the platform constant `REFERRAL_DISCOUNT_PENCE` (500). So
  today every message already says the correct £5, and this fix changes nothing a shopper sees. It
  makes the discount's one source of truth drive every message, so a future configurable discount
  cannot drift out of step. The defect was real in shape and latent in effect.
- **`generateReferralCode`'s fallback** for an empty or non-string user id changes from
  `"REF-AHEED"`, one vendor's name, to `"REF_NOCAPED"`. This is an owner decision at spec approval,
  2026-09-26.
  - The underscore is deliberate. The value does not match `extractReferralPrefix`'s `REF-…`
    pattern, so the fallback can never be redeemed as, or mistaken for, a real shopper's code.
  - The fallback is only reached when there is no user id. An existing `DiscountCode` row named
    `REF-AHEED`, if one exists, is left alone and not migrated.

**D. Delivery-area examples and the help page's locality**

- **Example source.** A new pure module, `lib/delivery-area-examples.ts`, picks the example postcode
  area in this order:
  1. the area letters of the vendor's `VendorLocation.postcode`;
  2. otherwise the letters of the alphabetically first `VendorDeliveryArea.prefix`;
  3. otherwise `null`.

  It builds the example set `{ area: "RG", district: "RG1", list: "RG1, RG3, RG5", range:
  "RG1-RG10" }` from that area. Neither seeded vendor has a `VendorLocation` row today, so both
  resolve through step 2: Aheed to `MK`, SriMart to `RG`.
- **Staff surfaces.** The resolved examples replace the hardcoded MK ones in:
  - the `/staff/delivery-areas` intro paragraph;
  - the add-form placeholder and help text in `components/staff/DeliveryAreaManager.tsx`;
  - the error messages in `lib/delivery-area-form.ts`.

  With no example area, each drops its example clause and keeps the rule it explains.
- **Store address placeholders.** On `components/staff/StorefrontConfigForm.tsx`, `e.g. Milton
  Keynes` and `e.g. MK9 3QA` become neutral: `Town or city` and `Full postcode`. That form is where
  a vendor types its own address, so no example can come from the vendor.
- **Help page (shopper-facing).** `/help` says "We currently deliver across Milton Keynes and
  surrounding local areas" on every vendor, SriMart included. Found at `/spec` while tracing the
  MK question; this is the only shopper-visible instance. It becomes the vendor's `localityName`,
  or a neutral sentence when that is empty.

**E. Guards and documentation**

- `tests/vendor-neutral-copy.test.ts` denylists what this slice removes and scans the lib modules
  that now hold user-facing or model-facing copy.
- The `/staff/storefront` section of `docs/store-admin-guide/admin-tabs-guide.md` documents the new
  form, tracing each sentence to a real control.
- `docs/developer-portal/app-conventions.md`'s "User-facing copy" section replaces its "tracked as
  `#905`, not a copy fix" bullet with the rule this slice ships.
- The seed (`prisma/seed.ts`) sets the seven new fields for Aheed and SriMart. Re-seeding resets
  them to that declared baseline, as it already does for the rest of `VendorConfig`.

**F. Carry-forward from `/orient`**

- The `specs/roadmap.md` change-log row for PR #910. `sdd:audit` reports it as pending
  carry-forward.
- The `docs/model-handoff.md` correction that `#729` is in production (PR #910, `556e273`), not
  In Review.

## Deliberately excluded

- **Vendor-defined product filters (`#912`).** SriMart's electronics filters (storage, colour,
  connectivity) are the next slice, straight after this one reaches `staging`. The owner chose to
  keep that separate at `/propose`. This slice's per-vendor settings are the foundation it builds on.
- **Hiding labels on the storefront** when a vendor switches them off. Owner decision 2; the
  storefront stays data-driven.
- **Replacing the six product booleans** with a generic attribute model. Excluded by the discovery
  log's `#398`/`#601` finding and by `#912`'s own scope.
- **A vendor-configurable referral discount.** The constant is platform-wide (see C). No issue is
  filed, because nobody has asked for one; this slice only removes the second copy of the value.
- **Reference-data postcode coverage** being one platform-wide list (`MK,RG`). Tracked as **`#911`**
  (Backlog). This slice changes copy only; eligibility is untouched.
- **The staff product list and inventory table** do not show labels today, so they need no gating.
- **`Header.tsx`'s comments** mentioning Reading and SriMart are explanatory comments, not copy.

## Risks and how the spec meets them

- **Silent label wipe on save.** This is the main risk. R11 requires that an update with a disabled
  label leaves the stored value unchanged. R12 requires that a crafted field for a disabled label
  is ignored. R34 proves both against a real database under `npm run preview`.
- **The backfill switches a label off for a vendor that uses it.** It cannot: the rule is "on if
  any product carries it". R4 proves it on dev: Aheed's labels come back on, SriMart's stay off.
- **Production Aheed has no product carrying some label.** Then that label starts off, and an admin
  switches it on at `/staff/storefront`. This is intended, and the admin guide says so.
- **Migration generation.** Prisma proposes dropping the hand-authored `pg_trgm` indexes, and
  `prisma migrate dev --create-only` against dev offers a reset (`#895`). So the migration is
  generated with `prisma migrate diff --from-schema-datamodel <staging schema>
  --to-schema-datamodel prisma/schema.prisma --script`, with the backfill appended by hand. It is
  read before it applies (R3).

## Open items carried forward

- **`#912`** (vendor-defined filters): next slice.
- **`#911`** (reference coverage): Backlog, owner-prioritised.
- **`#901`** (production pilot for `#900`): owner action. This slice changes the net-content
  prompt's first line, so its pilot results should be read against this slice's prompt if both
  land before the pilot runs.
