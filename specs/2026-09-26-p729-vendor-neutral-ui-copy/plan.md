---
id: p729-vendor-neutral-ui-copy-plan
title: "#729 — Vendor-neutral UI copy, slice 1 (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-26
visibility: internal
summary: Removes hardcoded Aheed names and grocery-only wording from storefront and staff UI so any vendor, not just a grocer, reads correct copy. Shop-your-list examples come from the vendor's own products; the search placeholder becomes staff-editable. No schema change.
tags: [multi-tenancy, vendor-neutral, copy, storefront, staff-panel, p10]
related: [architecture]
---

# #729 — Vendor-neutral UI copy, slice 1 (plan)

**Goal:** a vendor that is not a grocer — SriMart (electronics) today, any vendor tomorrow — sees
no other vendor's name and no grocery-only wording anywhere this slice touches. It proves the
platform's copy is vendor-neutral by default, without adding any new vendor setting.

ADR-004 moved branding, delivery and locality into the database. #239 (P7.5c+f) then removed the
header, hero and banner copy that made SriMart advertise halal meat. This slice finishes the same
job for the surfaces those two passes missed. The orient audit (2026-09-26) found them. The owner
approved this scope on #729 (comment dated 2026-09-26).

## The rule this slice applies

Copy either comes from the vendor (its name, its own products, its own settings) or is neutral.
It never names another vendor or assumes a product category. No vendor name is ever written into
a component. That rule is what makes a third or tenth vendor work with no code change.

## Scope (this slice)

**A. Aheed's name hardcoded, so every vendor shows it**

- **A1 — page titles.** These pages export a static
  `metadata = { title: "… — Aheed Food Centre" }`:
  - `app/(storefront)/login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`,
    `reset-password/page.tsx`, `dev/page.tsx`
  - `app/(storefront)/account/page.tsx`, `account/loyalty/page.tsx`

  Each becomes `generateMetadata()` reading `getCurrentVendorProfile()`, the same pattern
  `app/(storefront)/search/page.tsx:32-36` already uses. That includes its existing
  `?? "Aheed Food Centre"` fallback for the no-vendor case, which only a request with no vendor
  reaches (such requests are redirected to `/coming-soon`). The part before the dash stays as it
  is today.
- **A2 — rewards panel name.** `components/rewards/RewardsPanel.tsx:78` renders "Aheed Club". It
  becomes `{vendorName} Club`, as the owner chose. `vendorName` is a new required prop, passed
  from `components/layout/StorefrontChrome.tsx` (`profile.name`) through
  `components/rewards/RewardsLauncher.tsx`. It is a prop from the layout, not a client-side fetch,
  following CLAUDE.md's no-middleware rule. The panel's "Aheed Food Centre identity" comment
  (line 70) is updated to match.
- **A3 — referral share text.**
  - `components/rewards/ReferralCard.tsx:63,80,81` hardcodes "Aheed Food Centre" and "first
    grocery order". `ReferralCard` gains a required `storeName` prop, which `RewardsPanel` and
    `app/(storefront)/account/loyalty/page.tsx` pass.
  - `lib/referrals.ts:95` `buildShareLinks(referralUrl, storeName = "Aheed Food Centre")` loses its
    default, making `storeName` required, and drops the word "grocery" from its three messages.
- **A4 — order tracking heading.** `app/(storefront)/orders/lookup/page.tsx:97`
  "Aheed Store Delivery Pipeline" becomes "Delivery progress".
- **A5 — staff colour preview.** `components/staff/StorefrontConfigForm.tsx:431`
  "Aheed automatically adjusts them…" becomes "We automatically adjust them…".
- **A6 — root metadata fallback.** `app/layout.tsx:30`: the no-vendor description "A multi-vendor
  grocery platform with local delivery." becomes "A multi-vendor online store with local delivery."
  The fallback **title** "Aheed Online Store" is deliberately left alone, because the platform
  has no name of its own. The KMS strategy's open decision U1 records this, and inventing one is
  not a copy decision. This fallback renders only on `/coming-soon`.

**B. Grocery wording shown to shoppers**

- **B1 — Shop your list examples.**
  - `components/cart/ShopYourList.tsx:26-29` has the placeholder
    "2x chicken breast / 5kg basmati rice / milk / apples x 3", and lines 51-53 explain quantities
    with "apples".
  - A new pure module, `lib/shopping-list-examples.ts`, gets
    `buildListExamples(names: string[])`. It is a plain module, not `"use server"`.
  - `app/(storefront)/shop-your-list/page.tsx` fetches up to 3 of the current vendor's active,
    in-stock products with the existing `getProductRepository().list({ take: 3, inStockOnly: true })`.
    That list is vendor-scoped and newest first. The page passes their names to
    `ShopYourList` as a new `exampleNames` prop.
  - This needs no repository change and no setting, and it is correct for any vendor, including
    one onboarded later.
  - With no names, the copy falls back to neutral wording that names no product type.
- **B2 — search hint.** `app/(storefront)/search/page.tsx:244`
  "Try at least two characters, like “rice” or “atta”." becomes "Try at least two characters."
- **B3 — account, loyalty and rewards wording.** "grocery"/"groceries" is removed from:
  - `app/(storefront)/account/page.tsx:45,90`
  - `app/(storefront)/account/loyalty/page.tsx:88,104`
  - `components/rewards/WaysToEarnAccordion.tsx:63` ("Order groceries" becomes "Place an order")
  - `components/rewards/WaysToRedeemAccordion.tsx:65`
  - `app/(storefront)/orders/lookup/page.tsx:16`

  The exact replacements are in `requirements.md`.
- **B4 — legal pages (minimal neutral swap, owner-approved wording).**
  - `app/(storefront)/terms/page.tsx:66`: "fresh or perishable grocery items" becomes
    "fresh or perishable items".
  - `app/(storefront)/privacy/page.tsx:55`: "arrange grocery fulfillment, deliver orders" becomes
    "fulfil and deliver your orders".
  - No other legal wording changes.

**C. Staff panel**

- **C1 — form placeholders.** Grocery example values become neutral ones:
  - `ProductForm.tsx:124` `basmati-rice-5kg`
  - `CategoryForm.tsx:85` `rice-grains`
  - `BundleForm.tsx:120` `weekly-meat-box`
  - `CampaignBannerUploader.tsx:168` and `BundleImageUploader.tsx:138` ("halal lamb …")
  - `StorefrontConfigForm.tsx:353` ("100% Certified HMC Halal …")
  - `BrandManager.tsx:49,119` (`Shan`, `brands/shan/logo.webp`)
  - `SynonymDictionary.tsx:63,73` (`bhindi`, `okra`)

  The last two were not in the orient finding table. They are the same defect class, #729's own
  body names `bhindi`, and they were found while writing this spec. They are in scope for that
  reason.
- **C3 — search placeholder is staff-editable.**
  - `VendorConfig.searchPlaceholder` already exists and already drives the header search box
    (`lib/repositories/vendor.ts:206`, fallback `DEFAULT_SEARCH_PLACEHOLDER` = "Search products…").
    Today it can only be set by seeding.
  - A "Search box text" input is added to the **branding** form on `/staff/storefront`.
    `lib/brand-colour-form.ts` parses it:
    - It is trimmed.
    - Empty means `null`, which the header shows as "Search products…".
    - More than 80 characters is refused with a field error.
  - `VendorStorefrontConfigInput` gains an optional `searchPlaceholder` field, written with the
    same `undefined` = unchanged semantics as `bannerNote`. The delivery-rules and social-links
    forms therefore leave it alone.
  - The store-admin guide (`docs/store-admin-guide/admin-tabs-guide.md`) names the new field,
    because CLAUDE.md requires every documented capability to trace to a real control and the
    reverse.

**D. Category icons**

- **D1 — neutral fallback.** `components/product/category-icon.ts` falls back to `ShoppingBasket`,
  so every SriMart category renders a basket. The fallback becomes lucide's `Tag`. The nine
  existing slug mappings stay, because they only fire for a vendor that uses those slugs.

**Regression guard.** A new `tests/vendor-neutral-copy.test.ts` fails if any of the removed
literals reappears in shipped UI source. It scans `app/**/*.tsx`, `components/**/*.tsx` and
`lib/referrals.ts`, and excludes the generated `app/(admin)/staff/runbook/docs.ts` and comments.
Without it, the next grocery-flavoured placeholder lands unnoticed, which is exactly how these
accumulated after #239.

**Carried on this branch.** `specs/roadmap.md` gets the change-log row for PR #904 (the `#900`
promotion, merge `a156039`), which `sdd:audit` reports as "pending carry-forward".

## Deliberately excluded

- **Grocery labels and HMC on the staff product form (orient finding C2).** Tracked as **#905**.
  Hiding them per vendor needs a new vendor setting, which is a `/propose` decision.
  `docs/research/discovery-log.md` (the #398/#601 finding) constrains its shape.
- **"UK grocery" wording inside AI prompts (orient finding D2).** Tracked as **#905**, for the
  same reason: the model needs to be told what the shop sells, which is a new setting.
  Affected: `lib/list-normalisation.ts`, `lib/search-synonym-proposals.ts`,
  `lib/net-content-suggester.ts`.
- **Open Food Facts image lookup offered to every vendor (orient finding D3).** Tracked as
  **#906**, Deferred by the owner.
- **The `?? "Aheed Food Centre"` no-vendor fallbacks** in page `generateMetadata`s and
  `DEFAULT_SENDER_NAME`. They are reachable only when no vendor resolves, and those requests are
  redirected. Replacing them means choosing a platform name (U1), which this slice does not do.
- **`buildShareLinks`' hardcoded "£5".** It says £5 regardless of the vendor's configured
  referral discount. That is a correctness defect, not a vendor-copy one. It will be filed as its
  own issue at Build notes rather than fixed silently here.
- **Test fixtures** that use grocery product names (`tests/shopping-list.test.ts` and others).
  They are test data about Aheed-shaped catalogues, not shipped copy.
- **Other staff placeholders that are not grocery-specific**: `ProductForm` "India" (origin),
  "£2.40 / kg" (unit label), "HMC/2026/01234" (part of the HMC section, #905), "Same-Day Local
  Dispatch", "WELCOME10", "GOLD".
- **Comments** that quote the old Aheed copy as history (e.g. `components/layout/Header.tsx:126`).
  They are the record of #239 and are not rendered.

## Open items carried forward

- #905 (slice 2) is picked up after this slice ships and starts at `/propose`.
- #906 stays Deferred until the owner revives it.
