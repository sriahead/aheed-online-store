# P10 #1083/#1078/#1079 — Collection minimum, editable banner headline, honest referral copy (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact and this file.

Commits: `ea6e7fd` (spec), `55edc95` (build), then this one (build notes, CHANGELOG, handoff).
Branch `feature/p1083-collection-minimum-headline`, cut from `origin/staging` at `bc0bcc0`.

## What changed and why

**Schema and migration (R1–R3).**
- `prisma/schema.prisma` gains two `VendorConfig` lines (plus comments): `bannerHeadline String?`
  after `bannerNote`, and `collectionMinimumOrderPence Int @default(0)` after `minimumOrderPence`.
  The rest of the model was deliberately **not** re-aligned with `prisma format` (see Decisions).
- `prisma/migrations/20261013180000_p1083_1078_collection_minimum_banner_headline/migration.sql`
  is one `ALTER TABLE "VendorConfig" ADD COLUMN … , ADD COLUMN …` under a comment header. **It is
  applied to the dev database** (`prisma migrate deploy`, 2026-10-13), so preview runs against it.
- `lib/repositories/vendor.ts`: both fields are on `VendorProfile` and in its `config` select, with
  fallbacks `0`/`null`. Both are also on `VendorStorefrontConfigInput`.
  - `bannerHeadline` is assigned directly, like `bannerNote`, so `undefined` means no change.
  - `collectionMinimumOrderPence` uses the conditional spread `#634` uses for the delivery numbers.

**#1083 — the resolver (R4–R8).**
- `lib/delivery-pricing.ts` exports a new `VendorDeliveryDefaults` (`DeliveryMoneyRules` plus a
  **required** `collectionMinimumOrderPence`). `resolveDeliveryRules` takes it, and for `COLLECTION`
  returns the defaults with `minimumOrderPence` replaced by the collection minimum, before any
  postcode or area logic runs.
- Making the property required is what found every caller. `typecheck` flagged
  `lib/delivery-pricing-service.ts` and `scripts/verify-delivery-areas.ts` (whose Prisma select also
  gained the field). Once `helpDeliveryFacts` was retyped to take `VendorDeliveryDefaults` too, it
  flagged that function's two callers, `app/(storefront)/help/page.tsx` and
  `features/assistant/assistant.ts`. `features/checkout/place-order.ts` needed no edit: it passes the
  whole `VendorProfile`, which now carries the field.
- `/help` and `lib/assistant-content.ts` needed no copy change. Both already branched on
  `collectionMinimumOrderPence > 0`.

**#1083 — the staff form (R12–R15).**
- `lib/delivery-rules-form.ts`: new `COLLECTION_MINIMUM_FIELD = "collectionMinimumOrderPence"`, and
  a raw input `collectionMinimumOrder`.
  - While collection is ticked, the value is parsed with `parsePoundsToPence`, so blank is an error
    and `0.00` means none.
  - While it is unticked, `collectionMinimumOrderPence` is `undefined`.
- `features/admin/storefront.ts` reads `collectionMinimumOrder` from the form.
- `components/staff/StorefrontConfigForm.tsx` renders **Collection minimum order (£)** as the first
  field inside the existing `{offerCollection && …}` block, which is why it leaves the DOM when the
  box is unticked. The delivery minimum's label becomes **Minimum delivery order (£)**, with a help
  line saying it does not apply to Click & Collect.

**#1083 — landing badge (R16).** `app/(landing)/page.tsx` badge text now reads "minimum delivery
order".

**#1078 (R17–R21).**
- New `components/layout/banner-headline.ts` exports the pure `bannerHeadlineText()`: the vendor's
  headline if non-null, otherwise the old template character for character.
  `components/layout/Header.tsx` calls it.
- `lib/brand-colour-form.ts` adds `MAX_BANNER_HEADLINE_LENGTH = 120` and parses `bannerHeadline`
  (trim, blank to `null`, over 120 is a field error), mirroring `searchPlaceholder`.
- The staff input sits **before** Banner Note (it is the first line, the note the second), with
  `maxLength={120}`, the placeholder "Your banner headline", and a help line about the blank
  fallback.

**#1079 (R22–R23).**
- `WaysToEarnAccordion` gains an optional `discountOffPence` prop defaulting to
  `REFERRAL_DISCOUNT_PENCE`. Its referral line now reads: "Give a friend £5.00 off an order of £20.00
  or more. Each friend can use it once, and you earn N bonus points when their order is confirmed."
  Both amounts are formatted from `lib/referrals.ts`' constants.
- `buildShareLinks` (`lib/referrals.ts`): the share message and email body now say "off an order of
  £X or more", where X is `formatPrice(MIN_REFERRAL_ORDER_PENCE)` from the same module.
- `ReferralCard`'s `navigator.share` text is reworded the same way.

**Docs.** `docs/store-admin-guide/admin-tabs-guide.md` 2.13.0 covers both new fields, renames the
minimum, and corrects the delivery-areas sentence that said collection uses the store defaults.

**Tests added or changed:**
- `tests/delivery-pricing.test.ts` (R5). It splits `MONEY` (the three quote fields) from `DEFAULTS`
  (with the collection minimum), because the old "collection resolves to `{...DEFAULTS}`" assertion
  would otherwise compare an extra key.
- `tests/place-order-delivery-pricing.test.ts` (R7).
- `tests/help-facts-and-faq-form.test.ts` (R8).
- `tests/delivery-rules-form.test.ts` (R13).
- `tests/banner-headline.test.ts`, new (R17).
- `tests/brand-colour-validation.test.ts` (R19).
- `tests/rewards-components.test.tsx` (R22).
- `tests/referrals.test.ts` (R23).
- Fixture-only additions of `collectionMinimumOrderPence: 0` in `tests/assistant-content.test.ts`
  and `tests/help-assistant-panel.test.tsx`.

**Gates run at Build:** `lint`, `typecheck`, `format:check` and `npm run build` all exit 0, and
`npx vitest run` run alone gives 246 files and 3164 tests passed, exit 0. **Not run at Build:**
`kms:validate` after the build-notes edits, `kms:assemble:internal` plus the `kms/site-internal`
build, and any `npm run preview` row. Every live row (R9–R12, R14–R16, R18, R21) is unrun.

## Decisions taken during the build

- **Migration SQL from `prisma migrate diff`, not `migrate dev --create-only`.** Against dev,
  `--create-only` demanded a reset (checksum drift on `20260820200500_p8_image_needs_review`, the
  `#895` trap in `specs/architecture.md`). The diff was taken from `origin/staging`'s schema to the
  new one, so it cannot propose dropping the `pg_trgm` indexes. Applied with `migrate deploy`.
- **No `prisma format`.** Running it re-aligned all of `VendorConfig` (the new column name is the
  longest), giving a 54+/46− whitespace diff that would fail R1's "no removed lines" check. Nothing
  enforces `prisma format` in `package.json` or CI, and earlier slices do not re-align either. The
  new line uses single spaces; `prisma validate` passes.
- **R7 is proven by composition.** `place-order-delivery-pricing.test.ts` mocks `createOrder`, and
  the real `BELOW_MINIMUM` comparison lives in `placeOrder` (`lib/repositories/orders.ts`), already
  proven by `tests/orders.test.ts` ("refuses below the vendor's minimum order").
  - The new tests assert the minimum the **action** hands to `createOrder` for a collection order:
    `0` when the collection minimum is 0, and `2000` when it is 2000, both with a £15 delivery
    minimum.
  - The mock applies that same comparison (`SUBTOTAL_PENCE < rules.minimumOrderPence` throws the real
    `CheckoutError`), so the action's error path is exercised end to end.
- **R17 is tested on an extracted pure function**, `bannerHeadlineText`, rather than by rendering
  `Header`, an async server component that reads cookies, the session and the vendor profile. The
  header's only change is the call, readable in its diff.
- **The tests were shown to fail without the fix.** With the `COLLECTION` branch in
  `resolveDeliveryRules` reverted to `return defaults`, six new tests failed: R5 ×2, R8 ×2 and R7 ×2.
  Restored afterwards.
- **The collection-minimum input uses `penceToPoundsValue(initialConfig.collectionMinimumOrderPence)`
  with no `?? 0`.** The Prisma type is a non-null `Int`.
- **`buildShareLinks` reads `MIN_REFERRAL_ORDER_PENCE` directly**, not through a new parameter. The
  discount was made a parameter in `#907` because it varies per call site; the minimum is a module
  constant that every caller would pass unchanged.

## Deviations from the spec

- **R22: an optional `discountOffPence` prop was added to `WaysToEarnAccordion`.** The spec allows
  "constants (or props defaulting to them)", and the prop defaults to `REFERRAL_DISCOUNT_PENCE`. No
  caller passes it, so the rendered amount is the constant.
- **R18: the input sits before Banner Note, not after it.** The spec says "next to". Placing it
  first matches the banner's own order (headline first, note second).
- Otherwise none.

## Known-shaky areas

- **Nothing is proven live yet.** Every `npm run preview` row is for Validate. The migration is
  applied to dev, so preview should start cleanly. Remember `npm run db:generate` after any
  `npm ci`.
- **R9's checkout submit.** Without `STRIPE_SECRET_KEY` locally, `place-order` redirects to
  `/checkout/<n>?t=…` (the stub path) rather than to Stripe. Either outcome passes R9, provided the
  minimum message does not appear. A collection checkout needs Name, Phone and (for a guest) Email.
  Setting Collection as the method happens in the cart or header UI through the `fulfilment-method`
  cookie.
- **R9 and R14 need Click & Collect ticked on local Aheed.** If dev's Aheed has collection off, the
  form requires a collection address before it saves. Restore the original state afterwards,
  including the delivery minimum: R9 sets it to £15.00, and local dev may have had a different value.
- **Local SriMart admin sign-in is known to 403** (handoff, `#1012`'s validation). R21 only reads
  SriMart's storefront `/` and needs no SriMart sign-in.
- **The help page's delivery "Minimum Order" line** still reads "Orders must reach £X before you can
  check out" inside the delivery section. It was left alone because it sits under delivery and the
  collection section now states its own minimum; if a reader takes it as store-wide, that is a copy
  follow-up, not an R10 failure.
- **The landing badge (R16) is the only shopper surface outside `resolveDeliveryRules` that names
  the minimum without saying "delivery".** The cart drawer, `/cart` and `/checkout` show the minimum
  for the shopper's own method, so they were correct without a wording change. Worth a glance at
  `components/cart/CartContents.tsx` ("minimum order" wording, method-specific value) during R9.
- **The `vendor-neutral-copy` test passed.** The derived template moved from `Header.tsx` to
  `components/layout/banner-headline.ts`. If that guard scans by path, check that it still covers
  the template's "local delivery across" wording, which is vendor-data-driven and was already
  allowed.
