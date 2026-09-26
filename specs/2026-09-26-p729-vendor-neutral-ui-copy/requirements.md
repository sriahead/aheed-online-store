# #729 — Vendor-neutral UI copy, slice 1 (requirements / acceptance criteria)

This slice removes hardcoded Aheed names and grocery-only wording from the storefront and staff UI,
so that any vendor, not only a grocer, sees correct copy. It builds on ADR-004's vendor-scoped
profile (`getCurrentVendorProfile()` in `lib/vendor-service.ts`, `VendorProfile` in
`lib/repositories/vendor.ts`) and on #239's rule that copy comes from the vendor or is neutral.
**No schema change and no migration.** `plan.md` holds the reasoning and the excluded items
(#905, #906). The two local vendors used for checks are Aheed (`Host: localhost:8787`) and
SriMart (`Host: srimart.localhost`), both served by `npm run preview`.

"Rendered `<title>`" below means the `<title>` element in the HTML returned by a GET to that path
under `npm run preview`.

## A. No other vendor's name in the UI

R1. Each of these seven pages exports `generateMetadata` and no static `metadata` object. Each
    returns a title built from `getCurrentVendorProfile()`'s `name`, keeping today's text before
    the dash:
    `app/(storefront)/login/page.tsx` ("Sign in — {name}"),
    `register/page.tsx` ("Create account — {name}"),
    `forgot-password/page.tsx` ("Forgot password — {name}"),
    `reset-password/page.tsx` ("Reset password — {name}"),
    `dev/page.tsx` ("Dev — {name}"),
    `account/page.tsx` ("Your account — {name}"),
    `account/loyalty/page.tsx` ("Loyalty & Rewards — {name}").
    Each falls back to "Aheed Food Centre" only when the profile is `null`, as
    `search/page.tsx:32-36` does.
R2. On the SriMart host, the rendered `<title>` of `/login` and `/register` contains `SriMart` and
    does not contain `Aheed`. On the Aheed host, both contain `Aheed Food Centre`.
R3. `RewardsPanel` takes a required `vendorName: string` prop and renders the header label
    `{vendorName} Club`. The literal `Aheed Club` does not occur in `components/`.
    `StorefrontChrome` passes `profile.name` to `RewardsLauncher` as `vendorName`, and
    `RewardsLauncher` passes it on to `RewardsPanel`.
R4. `ReferralCard` takes a required `storeName: string` prop and passes it to `buildShareLinks`.
    Its native-share `title` is `` `${storeName} referral` `` and its `text` contains no word
    matching `/grocer/i`. `RewardsPanel` passes `vendorName`, and
    `app/(storefront)/account/loyalty/page.tsx` passes the current vendor profile's `name`.
R5. In `lib/referrals.ts`, `buildShareLinks`' `storeName` parameter has no default value. None of
    its returned strings (after `decodeURIComponent`) contains a match for `/grocer/i`. Each
    contains the `storeName` passed in. The existing "£5" amount is unchanged (out of scope, see
    `plan.md`).
R6. `app/(storefront)/orders/lookup/page.tsx` renders "Delivery progress" where it rendered
    "Aheed Store Delivery Pipeline".
R7. `components/staff/StorefrontConfigForm.tsx`'s live-preview note reads "This shows what your
    colours will look like to shoppers. We automatically adjust them to guarantee they are
    readable."
R8. `app/layout.tsx`'s no-vendor fallback description is exactly "A multi-vendor online store with
    local delivery." Its fallback title stays "Aheed Online Store". The vendor-resolved branch is
    unchanged.

## B. No grocery wording shown to shoppers

R9. `lib/shopping-list-examples.ts` exists as a plain module (no `"use server"` directive) and
    exports `buildListExamples(names: string[]): { placeholder: string; exampleName: string | null }`
    with this behaviour:
    (a) Input names are trimmed. Empty strings are dropped. Duplicates are dropped
        case-insensitively, keeping the first. At most the first 3 remaining names are used.
    (b) With 1–3 names `n0, n1, n2`, `placeholder` is the lines `2x {n0}`, then `{n1}` if present,
        then `{n2} x 3` if present, joined by `\n`, and `exampleName` is `n0`.
    (c) With no names, `placeholder` is exactly `"2x first item\nsecond item\nthird item x 3"` and
        `exampleName` is `null`.
R10. `ShopYourList` takes an `exampleNames: string[]` prop and uses `buildListExamples` for the
     textarea placeholder. When `exampleName` is non-null, the hint reads
     "Quantities are understood — **2x {exampleName}**, **3 {exampleName}** or
     **{exampleName} x3**. Up to {MAX_LIST_LINES} lines." (bold spans as today). When it is null,
     the hint reads "Quantities are understood — write 2x or 3 before an item, or x3 after it. Up
     to {MAX_LIST_LINES} lines." The `PLACEHOLDER` constant and the words `chicken`, `basmati`,
     `milk` and `apples` no longer occur in `components/cart/ShopYourList.tsx`.
R11. `app/(storefront)/shop-your-list/page.tsx` obtains the names from
     `getProductRepository().list({ take: 3, inStockOnly: true })` and passes `items.map(i => i.name)`
     as `exampleNames`. No repository, schema or config file changes for this.
R12. `app/(storefront)/search/page.tsx`'s too-short message is exactly
     "That search is too short. Try at least two characters."
R13. These strings are replaced exactly:
     - `app/(storefront)/account/page.tsx:45`: "grocery lists" becomes "shopping lists".
     - `account/page.tsx:90`: "recurring grocery lists" becomes "recurring shopping lists".
     - `account/loyalty/page.tsx:88`: "unlock grocery vouchers" becomes "unlock vouchers".
     - `account/loyalty/page.tsx:104`: "off your next grocery basket" becomes "off your next order".
     - `components/rewards/WaysToEarnAccordion.tsx:63`: "Order groceries" becomes "Place an order".
     - `components/rewards/WaysToRedeemAccordion.tsx:65-66`: "off your grocery basket." becomes
       "off your basket."
     - `app/(storefront)/orders/lookup/page.tsx:16`: "Track your grocery order status" becomes
       "Track your order status".
R14. `app/(storefront)/terms/page.tsx` reads "For fresh or perishable items, cancellations after
     processing are subject to verification under UK Consumer Rights Law." No other terms
     sentence changes.
R15. `app/(storefront)/privacy/page.tsx` reads "Your data is used solely to process payments (via
     Stripe), fulfil and deliver your orders, and send order confirmations and updates." No other
     privacy sentence changes.

## C. Staff panel

R16. These staff placeholders are replaced exactly:

     | File:line | Old | New |
     |---|---|---|
     | `ProductForm.tsx:124` | `basmati-rice-5kg` | `product-name` |
     | `CategoryForm.tsx:85` | `rice-grains` | `category-name` |
     | `BundleForm.tsx:120` | `weekly-meat-box` | `bundle-name` |
     | `CampaignBannerUploader.tsx:168` | the halal-lamb example | `e.g. A selection of this campaign's products on a clean background` |
     | `BundleImageUploader.tsx:138` | the halal-lamb example | `e.g. The products in this bundle arranged together` |
     | `StorefrontConfigForm.tsx:353` (hero subtitle) | the HMC example | `e.g. Quality products at fair prices, delivered locally` |
     | `BrandManager.tsx:49` | `Shan` | `Brand name` |
     | `BrandManager.tsx:119` | `brands/shan/logo.webp` | `brands/brand-name/logo.webp` |
     | `SynonymDictionary.tsx:63` | `bhindi` | `What shoppers type` |
     | `SynonymDictionary.tsx:73` | `okra` | `What your catalogue calls it` |

     All files are under `components/staff/`.
R17. `/staff/storefront`'s branding form (the `<form action={saveBranding}>` in
     `StorefrontConfigForm.tsx`) has a text input with `id`/`name` `searchPlaceholder`, labelled
     "Search box text". Its `defaultValue` is the vendor's stored `searchPlaceholder` or `""`, and
     its placeholder is `e.g. Search our products…`.
R18. `parseBrandColourForm` (`lib/brand-colour-form.ts`) returns `searchPlaceholder` as follows:
     - A value is trimmed and returned as-is when it is 1–80 characters.
     - An empty or whitespace-only value returns `null`.
     - A value over 80 characters after trimming returns
       `{ ok: false, error: { field: "searchPlaceholder", message: "Search box text must be 80 characters or fewer." } }`.
     `BrandColourInput` carries `searchPlaceholder: string | null`.
R19. `VendorStorefrontConfigInput` has `searchPlaceholder?: string | null`.
     `updateVendorStorefrontConfig` writes it with direct assignment, like `bannerNote`, so
     `undefined` leaves the column unchanged. Neither the delivery-rules nor the social-links save
     path in `features/admin/storefront.ts` passes `searchPlaceholder`.
R20. Live, under `npm run preview` on the Aheed host, signed in as the demo store admin:
     - Saving the branding form with Search box text `Find something good` makes a GET of `/` on
       that host render a header search input whose `placeholder` is `Find something good`.
     - Saving again with the field empty makes it render `Search products…`.
     - Saving the delivery-rules form in between leaves the stored value unchanged.
     The original stored value is restored afterwards.
R21. `docs/store-admin-guide/admin-tabs-guide.md`'s `/staff/storefront` "What you can do" paragraph
     names the search box text, and its "Important fields" paragraph states that leaving it empty
     shows "Search products…".

## D. Category icons

R22. `categoryIcon(slug)` in `components/product/category-icon.ts` returns lucide's `Tag` for any
     slug not in its map. The nine existing mappings return the same icons as before.
     `ShoppingBasket` is no longer imported there.

## Regression guard, roadmap, gates

R23. `tests/vendor-neutral-copy.test.ts` exists and passes. It reads every `app/**/*.tsx`,
     `components/**/*.tsx` and `lib/referrals.ts` file, excluding `app/(admin)/staff/runbook/docs.ts`.
     It strips `//` line comments and `/* … */` block comments, including JSX `{/* … */}`. It
     asserts that none of these literals occurs in any remaining text:
     `Aheed Club`, `Aheed Food Centre Referral`, `Aheed Store Delivery Pipeline`,
     `— Aheed Food Centre"`, `Aheed automatically`, `Order groceries`, `grocery order`,
     `grocery basket`, `grocery lists`, `grocery vouchers`, `grocery items`,
     `grocery fulfillment`, `grocery platform`, `chicken breast`, `“rice” or “atta”`,
     `basmati-rice-5kg`, `rice-grains`, `weekly-meat-box`, `halal lamb`, `HMC Halal Fresh`,
     `brands/shan`, `"bhindi"`, `"okra"`.
     Deliberately re-inserting any one of them into a scanned file makes the test fail.
R24. Existing tests updated to the new behaviour pass: `tests/category-icon.test.ts`,
     `tests/rewards-components.test.tsx` and `tests/referrals.test.ts`. New unit tests cover:
     - R9 (a), (b) and (c) of `buildListExamples`
     - R18's four `searchPlaceholder` outcomes
     - R3's `{vendorName} Club` label, rendering `RewardsPanel` open with `vendorName="SriMart"`
R25. `specs/roadmap.md`'s change-log table has a 2026-09-26 row for **PR #904** (the `#900`
     promotion to production, merge `a156039`). `npm run sdd:audit` then reports no
     "pending carry-forward" line for PR #904.
R26. No file under `prisma/` changes in this slice's diff against `origin/staging`.
R27. `CHANGELOG.md` updated (Gate 4).
R28. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
