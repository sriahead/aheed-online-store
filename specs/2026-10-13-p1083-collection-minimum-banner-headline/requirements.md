# P10 #1083/#1078/#1079 — Collection minimum, editable banner headline, honest referral copy (requirements / acceptance criteria)

Closes `#1083` (Click & Collect is held to the delivery minimum), `#1078` (vendor-editable banner
headline) and `#1079` (unenforced referral claims). Builds on `#890`'s single delivery-money
resolver (`lib/delivery-pricing.ts`) and `#1077`'s `ReferralCard` wording. One-line version of
`plan.md`: two new `VendorConfig` columns, `collectionMinimumOrderPence Int @default(0)` (0 = no
collection minimum) and `bannerHeadline String?` (null = today's derived line), plus a referral copy
fix. The Gate 1 rulings in `plan.md` are the authority for the two defaults.

"Aheed" and "SriMart" below are the two seeded vendors (local hosts as in
`docs/developer-portal/local-dev-playbook.md`). "Derived line" means the header banner's first line
as it renders today: the vendor's name, then "local delivery across" and the locality, then
"& click and collect" only when the vendor offers collection.

## Schema and data

R1. `prisma/schema.prisma`'s `VendorConfig` model declares `collectionMinimumOrderPence Int
    @default(0)` and `bannerHeadline String?`. No other model or field in the schema changes.

R2. Exactly one new directory exists under `prisma/migrations/` on this branch, and its
    `migration.sql` adds those two columns to `"VendorConfig"` and does nothing else: it contains no
    `DROP`, no `CREATE INDEX`, no `ALTER` of any other table, and no `UPDATE`.

R3. `getVendorProfile` (`lib/repositories/vendor.ts`) returns `collectionMinimumOrderPence: number`
    and `bannerHeadline: string | null`, falling back to `0` and `null` when the vendor has no
    `VendorConfig` row.

## #1083 — collection minimum

R4. `resolveDeliveryRules`' `vendorDefaults` parameter type requires a `collectionMinimumOrderPence:
    number` property (not optional). For `method === "COLLECTION"` the returned `minimumOrderPence`
    equals `vendorDefaults.collectionMinimumOrderPence`, whatever postcode and areas are passed; the
    returned `deliveryFeePence`, `freeDeliveryThresholdPence` and `areaPrefix` are unchanged from
    before this slice. For `method === "DELIVERY"` the result is unchanged from before this slice.

R5. `tests/delivery-pricing.test.ts` asserts the following, and passes:
    - with a delivery minimum of 1500 and a collection minimum of 0, `COLLECTION` resolves a minimum
      of 0 and `DELIVERY` resolves 1500;
    - with a collection minimum of 500, `COLLECTION` resolves 500 even when the postcode matches an
      area that overrides the minimum to a different value.

R6. `getShopperDeliveryRules` (`lib/delivery-pricing-service.ts`) passes the profile's
    `collectionMinimumOrderPence` (or `0` when the profile is null) into `resolveDeliveryRules`.

R7. A test drives `features/checkout/place-order.ts` for a `COLLECTION` order whose subtotal is
    below the vendor's delivery minimum, and passes:
    - with a collection minimum of 0, the result is not the below-minimum refusal;
    - with a collection minimum above the subtotal, the order is refused as below the minimum.

R8. `lib/help-facts.ts` reports `collectionMinimumOrderPence` equal to the vendor's collection
    minimum, not its delivery minimum. A test with a delivery minimum of 1500 and a collection
    minimum of 0 asserts `collectionMinimumOrderPence === 0` and `defaults.minimumOrderPence === 1500`.

R9. Under `npm run preview`, with Aheed configured with a delivery minimum of £15.00, Click &
    Collect ticked and a collection minimum of £0.00, a shopper whose fulfilment method is
    Collection, with a basket subtotal under £15.00:
    - sees no "minimum order" shortfall message on `/cart` or `/checkout`;
    - can submit the checkout form without receiving "Your order is below this store's minimum.".

R10. Under the same conditions as R9, `/help` on Aheed shows "There is no minimum for collection
     orders." in its collection section and still states the £15.00 minimum in its delivery section.

R11. Under `npm run preview`, with Aheed's collection minimum set to £20.00, a Collection basket
     under £20.00 shows the below-minimum shortfall on `/cart`, and `/help` shows "Collection orders
     must reach £20.00.".

R12. On `/staff/storefront`'s delivery-rules form, while "Offer Click & Collect" is ticked, an input
     with `id` and `name` `collectionMinimumOrder` and the visible label "Collection minimum order
     (£)" renders with the stored value in pounds (for example `0.00`), and a help line stating that
     0.00 means no minimum. While the box is unticked, the input is not in the DOM.

R13. `parseDeliveryRules` (`lib/delivery-rules-form.ts`):
     - when `offerCollection` is true, requires the collection minimum and parses it with
       `parsePoundsToPence`. A blank or malformed value returns `ok: false` with an exported
       `COLLECTION_MINIMUM_FIELD` as the error's field;
     - when `offerCollection` is false, returns `collectionMinimumOrderPence: undefined`.

     `tests/delivery-rules-form.test.ts` covers all three cases (a valid value, a blank or malformed
     value with collection ticked, and collection unticked) and passes.

R14. `updateVendorConfig` writes `collectionMinimumOrderPence` only when it is not `undefined`. Saving
     the delivery-rules form with collection unticked leaves the stored value unchanged. Verified
     under `npm run preview`: set £3.00 with collection ticked, save, untick and save, re-tick, and the
     field shows `3.00`.

R15. On the same form, the delivery minimum's visible label reads "Minimum delivery order (£)" and
     its help line states that it does not apply to Click & Collect orders.

R16. The landing page's hero badge for the minimum reads "AMOUNT minimum delivery order" (for
     example "£15.00 minimum delivery order"). It renders only when the delivery minimum is above 0,
     as before.

## #1078 — banner headline

R17. `components/layout/Header.tsx` renders `profile.bannerHeadline` as the banner's first line when
     it is a non-null string. When it is null, it renders the derived line character-for-character as
     before this slice. A test covers both cases and passes.

R18. `/staff/storefront` renders an input with `id` and `name` `bannerHeadline` and the visible label
     "Banner Headline", next to the existing Banner Note field. Its `defaultValue` is the stored value
     (empty when null), and a help line says that leaving it blank shows the store name and delivery
     area. Its `placeholder` names no vendor and no product or trade.

R19. `parseBrandColourForm` (`lib/brand-colour-form.ts`) trims `bannerHeadline`, maps blank to
     `null`, and returns `ok: false` with field `bannerHeadline` for a value longer than 120
     characters. A test covers a valid value, a blank value and a 121-character value, and passes.

R20. `updateVendorConfig` persists `bannerHeadline` from that form, so saving with the field blank
     stores `null`.

R21. Under `npm run preview`: after an Aheed admin saves a banner headline on `/staff/storefront`,
     Aheed's `/` and one storefront page (for example `/help`) show it as the banner's first line,
     and SriMart's `/` still shows SriMart's derived line. After the field is cleared and saved,
     Aheed shows its derived line again.

## #1079 — referral copy

R22. `components/rewards/WaysToEarnAccordion.tsx`'s "Refer your friends" text, as rendered, contains
     neither the word "qualifying" nor the phrase "first order". It states the friend's discount,
     the minimum order formatted from `MIN_REFERRAL_ORDER_PENCE`, and the bonus points earned when
     the friend's order is confirmed. The amounts come from `lib/referrals.ts`' constants (or
     props defaulting to them), not pound literals in the JSX. A test renders the accordion open and
     asserts the minimum and the absence of both phrases, and passes.

R23. The share message and the email body returned by `buildShareLinks` (`lib/referrals.ts`), and
     the `navigator.share` text in `components/rewards/ReferralCard.tsx`, do not contain "first
     order" and do state the minimum order from `MIN_REFERRAL_ORDER_PENCE`. A test calls
     `buildShareLinks` and asserts both strings, and passes. This requirement covers the runtime
     strings only, not code comments.

## Documentation, Gate 4, Gate 3

R24. `docs/store-admin-guide/admin-tabs-guide.md` (version bumped):
     - describes the Collection minimum order field (0 = no minimum) and the Banner Headline field
       (blank = the store name and delivery area);
     - no longer says Click & Collect uses the store's default minimum.

R25. `CHANGELOG.md` has an entry for this slice citing `#1083`, `#1078` and `#1079` (Gate 4).

R26. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check`,
     `npm run kms:validate` and `npm run build` all exit 0. `npm run kms:assemble:internal` followed
     by a webpack Next build in `kms/site-internal` also exits 0.
