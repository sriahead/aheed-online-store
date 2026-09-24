# P10 #613/#890/#889 — Delivery areas: district ranges, per-area pricing, refusal counts (requirements)

Closes `#613`, `#890` and `#889`. On `/staff/delivery-areas` a store admin can (A) enter postcode
districts as comma lists or ranges, expanded into ordinary `VendorDeliveryArea` rows; (B) give any
area or district its own delivery charge, minimum order and free-delivery threshold, which every
shopper-facing price then honours; and (C) see per-district counts of real postcodes this store
turned away. It also specifies the district matching `#402` shipped unspecified. Read `plan.md`
for the reasoning and the deferred items; everything checkable is below.

**Terms.** An *entry* is one comma-separated item of submitted text. An *area* is 1–2 letters
(`MK`). A *district* is an area followed by a digit and optionally one more digit or letter (`MK9`,
`MK17`, `EC1A`). A *range* is `<area><number>-<area><number>` with a hyphen (`-`) or en dash (`–`),
optional spaces around it, the same area letters at both ends, and 1–2 digit numbers. An
*override* is a non-null value in one of `VendorDeliveryArea`'s three money columns. The *vendor
defaults* are the three `VendorConfig` columns of the same names. Money is integer pence.

**Real postcodes for live checks** (confirmed in MK reference coverage 2026-09-24): `MK9 2EA`,
`MK17 8NL`, `MK10 1AA`, `MK11 1AA`. `MK9 2AA` is **not** real.

## A. Lists and ranges (`#613`)

R1. `lib/delivery-area-form.ts` exports `parsePrefixListInput(raw: string)` returning the existing
    `ParseResult` shape: on success `value` is a `string[]`; on failure `error.field` is `"prefix"`.

R2. Input is upper-cased, split on commas, each entry trimmed; empty entries (`"MK1,,MK2"`, a
    trailing comma) are ignored. If none remains the error is `"Enter a postcode area."`.

R3. A non-range entry is accepted exactly when `parsePrefixInput` accepts it. Any rejected entry
    fails the whole submission with an error message containing that entry (upper-cased).

R4. A range expands to every district from start to end inclusive, ascending: `MK1-MK10` → `MK1`…
    `MK10` (10 values); `mk1 – mk3` → `MK1`, `MK2`, `MK3`; `MK5-MK5` → `MK5`.

R5. These ranges each fail with an error containing the entry: `MK1-RG5` (different letters),
    `MK10-MK1` (start after end), `EC1A-EC1C` (letter suffix), `MK1-10` (end without letters),
    `MK1-MK100` (three-digit number).

R6. The list is de-duplicated keeping first position: `"MK9, MK1-MK10, mk9"` → `MK9`, `MK1`…`MK8`,
    `MK10` (10 values).

R7. More than 100 de-duplicated values fails with an error containing `100`; `X0-X99` (100 values)
    succeeds.

R8. `parsePrefixInput`'s behaviour is unchanged: every pre-existing assertion in
    `tests/delivery-area-form.test.ts` still passes, with at most comments edited.

R9. `lib/repositories/delivery-areas.ts` exports `createDeliveryAreasForVendor(prismaWs, vendorId,
    prefixes, overrides)` whose first parameter is typed as the `getPrismaWs()` client. It calls
    `vendorDeliveryArea.createMany` once with `skipDuplicates: true`, every row carrying the given
    `vendorId` and the same three override values, and returns `{ added, alreadyListed }`
    (`added` = the call's `count`, `alreadyListed` = `prefixes.length - added`).

R10. `addDeliveryArea` (`features/admin/delivery-areas.ts`) still calls `requireVendorRole("ADMIN")`
    before parsing. One parsed value uses the single-row create (a duplicate still returns
    `"That postcode area is already on the delivery list."`); two or more use R9.

R11. `DeliveryAreaFormState` gains `message: string | null` (`null` in `initialDeliveryAreaState`).
    A bulk success sets `saved: true` and exactly one of: `"Added N delivery areas."` (none already
    listed); `"Added N delivery areas; M already listed (their charges were not changed)."`;
    `"All M already listed — nothing changed."` — with `area` singular when `N` is 1. A single-row
    success leaves `message` `null` and shows `"Saved."`.

R12. `features/admin/delivery-areas.ts` exports only `export async function` declarations — no
    `export const`, `let`, `var`, `class`, `default`, or non-async `export function`.

R13. The add form: input `maxLength={200}`, label `Postcode areas or districts`, placeholder
    `MK, MK9 or MK1-MK10`, help text mentioning areas, districts, comma lists and ranges.

R14. The add form's feedback (error, `"Saved."`, or `message`) is inside no element carrying
    `sr-only` or `sm:sr-only`.

## B. Per-area pricing (`#890`)

R15. `model VendorDeliveryArea` in `prisma/schema.prisma` gains `deliveryFeePence Int?`,
    `minimumOrderPence Int?` and `freeDeliveryThresholdPence Int?`, and its `prefix` comment names
    both an area (`MK`) and a district (`MK9`).

R16. Exactly one new migration directory exists for this slice. Its `migration.sql` contains only
    `ALTER TABLE … ADD COLUMN`, `CREATE TYPE`, `CREATE TABLE`, `CREATE UNIQUE INDEX`/`CREATE INDEX`
    and `ADD CONSTRAINT … FOREIGN KEY` statements — no `DROP`, no `ALTER COLUMN`, and nothing
    touching a `pg_trgm` index. `npx prisma migrate status` against dev reports it applied.

R17. `lib/delivery.ts` exports `matchDeliveryArea(postcode, areas)` returning the matching element
    of `areas` or `null`; when both an area row and a district row match, it returns the district
    row. `isDeliverable(postcode, prefixes)` returns exactly whether a match exists, and every
    pre-existing assertion in `tests/is-deliverable.test.ts` passes.

R18. `lib/delivery-pricing.ts` exports a pure `resolveDeliveryRules(vendorDefaults, areas,
    postcode, method)` returning `{ deliveryFeePence, minimumOrderPence,
    freeDeliveryThresholdPence, areaPrefix }`. For `method === "DELIVERY"` with a postcode that
    `matchDeliveryArea` matches, each money field is the matched row's value when non-null and the
    vendor default otherwise, and `areaPrefix` is the row's prefix. In every other case (collection,
    `null`/empty postcode, no match) it returns the vendor defaults and `areaPrefix: null`. The file
    imports nothing from Prisma, `next/*` or any service.

R19. Unit tests on R18 assert, for vendor defaults `{ fee 349, min 0, threshold 4000 }` and areas
    `MK` (no overrides), `MK17` (fee 599, min 2500, threshold 0):
    `MK9 2EA` → `{349, 0, 4000, "MK"}`; `MK17 8NL` → `{599, 2500, 0, "MK17"}`; `MK17 8NL` with
    method `COLLECTION` → `{349, 0, 4000, null}`; postcode `null` → vendor defaults, `null`; and an
    `MK17` row with only fee 599 set → `{599, 0, 4000, "MK17"}`.

R20. `computeTotals` given `freeDeliveryThresholdPence: 0` and a subtotal of 10000 charges the full
    fee (existing behaviour, now pinned by a test because R18 relies on it).

R21. `VendorProfile` (`lib/repositories/vendor.ts`) gains `deliveryAreas: { prefix,
    deliveryFeePence, minimumOrderPence, freeDeliveryThresholdPence }[]`; `deliveryPrefixes` is
    still present and equals `deliveryAreas.map(a => a.prefix)`.

R22. Each of these computes its delivery money from `resolveDeliveryRules` — none reads the
    profile's vendor-wide `deliveryFeePence`/`minimumOrderPence`/`freeDeliveryThresholdPence`
    directly any more: `app/(storefront)/checkout/page.tsx`, `features/checkout/place-order.ts`,
    `components/layout/Header.tsx` (the cart drawer's props), `app/(storefront)/cart/page.tsx`,
    `app/(landing)/page.tsx`. `place-order` passes the delivery address postcode; the others pass
    the `delivery-postcode` cookie value.

R23. The checkout form submits a hidden field `quotedDeliveryRules` holding the three money values
    the page was priced with, as `<fee>:<minimum>:<threshold>` in pence (`threshold` empty for
    `null`). For a delivery order whose address postcode resolves to **different money values** —
    not merely a different `areaPrefix`, so a shopper with no cookie whose area has no overrides is
    never refused — or when the field is missing or malformed, `place-order` creates no order, sets the `delivery-postcode`
    cookie to the address postcode, and returns the error `"The delivery charge for <POSTCODE> is
    different. Please review your updated total and place the order again."` with the postcode as
    typed, normalised.

R24. `lib/repositories/delivery-areas.ts` exports `updateDeliveryAreaChargesForVendor(prismaWs,
    vendorId, id, overrides)` using `updateMany` with `where: { id, vendorId }` on the WebSocket
    client; zero rows updated returns the existing "no longer exists" failure.

R25. Money fields on the add form and each row's edit form are parsed with
    `parseOptionalPoundsToPence` from `lib/delivery-rules-form.ts`: blank → `null`; a valid amount →
    pence; a negative or malformed amount → a field error naming the field, and nothing is written.

R26. Each listed row shows its fee, minimum and threshold, with `Store default` for a `null` value,
    and an edit form (a `"use server"` action `updateDeliveryAreaCharges` calling
    `requireVendorRole("ADMIN")` first) that saves the three values and re-renders the list.

R27. `lib/delivery-areas-service.ts` exposes `createMany` and `updateCharges`, each passing a
    `getPrismaWs()` client. `tests/repository-transaction-safety.test.ts`,
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass
    unmodified.

## C. Refusal counts (`#889`)

R28. `prisma/schema.prisma` gains `enum DeliveryRefusalSource { HEADER CHECKOUT }` and `model
    DeliveryRefusalCount` with `id`, `vendorId` (FK to `Vendor`, cascade delete), `district
    String`, `day DateTime @db.Date`, `source DeliveryRefusalSource`, `count Int @default(0)`, and
    `@@unique([vendorId, district, day, source])`. It has no user, session, postcode-unit, cookie or
    IP column.

R29. `lib/repositories/delivery-refusals.ts` exports `recordDeliveryRefusal(prisma, vendorId,
    district, day, source)` doing one `upsert` on the R28 unique key (create with `count: 1`,
    update with `count: { increment: 1 }`), and `listRecentDeliveryRefusals(prisma, vendorId,
    sinceDay, limit)` returning `{ district, header, checkout, total }[]` sorted by `total`
    descending, then `district` ascending.

R30. A refusal is recorded only when the eligibility status is `OUTSIDE_DELIVERY_AREA`, with
    `district` = the postcode's outward code and `day` = the current calendar day in the vendor's
    `VendorConfig.timezone`. `INVALID_POSTCODE`, `UNVERIFIED` and `DELIVERABLE` record nothing.

R31. `setDeliveryPostcode` (`features/storefront/delivery.ts`) records source `HEADER`;
    `place-order`'s postcode refusal records source `CHECKOUT`. `GET /api/address/lookup` records
    nothing.

R32. If recording throws, the calling action's return value and cookie behaviour are identical to
    a successful record, and the error is logged. A unit test forces the repository to throw and
    asserts this for both call sites.

R33. `/staff/delivery-areas` renders a section headed `Districts you turned away (last 30 days)`
    listing up to 20 rows from R29 (columns District, Header, Checkout, Total), or the text
    `No out-of-area postcodes in the last 30 days.` when empty.

## D. Live proof (dev database and `npm run preview` only)

R34. `scripts/verify-delivery-areas.ts`, run with `npx tsx` against dev, uses the real Neon
    adapters to: snapshot Aheed's and SriMart's `VendorDeliveryArea` rows; bulk-insert `MK1`…`MK10`
    for Aheed (printing `added`/`alreadyListed`) and re-run asserting `added === 0`; set overrides
    on one inserted row via R24 and read them back; resolve `MK9 2EA` and `MK17 8NL` with
    `resolveDeliveryRules` over the rows read from the database; call `recordDeliveryRefusal`
    twice for one test district/day/source and assert `count === 2`, then delete that row; assert
    SriMart's rows equal their snapshot; restore Aheed's rows (including override values) to the
    snapshot; and exit 0 only if every assertion held.

R35. Signed in as `demo-store-admin`, submitting `MK1-MK10` renders an R11 bulk message and the list
    shows `MK1`…`MK10`; resubmitting renders `"All 10 already listed — nothing changed."`.

R36. With Aheed's areas exactly `MK1`…`MK10` (no overrides): `GET
    /api/address/lookup?postcode=MK9%202EA` → `deliverable: true`, status `DELIVERABLE`;
    `…MK17%208NL` → `deliverable: false`, status `OUTSIDE_DELIVERY_AREA`. The header, with the
    `delivery-postcode` cookie at `MK9 2EA`, renders `Delivery · MK9 2EA`; at `MK17 8NL` it does not
    render `Delivery · MK17 8NL`. A delivery order to `MK17 8NL` is refused with `Sorry — we don't
    deliver to MK17 8NL yet.`.

R37. After entering `MK17 8NL` in the header once and attempting one checkout to it (R36), the
    staff table shows `MK17` with Header ≥ 1 and Checkout ≥ 1.

R38. With Aheed's areas `MK` (no overrides) and `MK10` (fee £5.99, minimum £30.00, threshold £0):
    with the cookie at `MK10 1AA` the cart drawer and checkout summary show a £5.99 delivery charge
    and a £30.00 minimum; with the cookie at `MK9 2EA` they show the vendor defaults. An order
    placed for `MK10 1AA` above £30 is stored with `deliveryFeePence = 599`.

R39. With the cookie at `MK9 2EA`, changing the checkout address postcode to `MK10 1AA` and placing
    the order returns the R23 message and creates no order; the reloaded checkout summary shows
    £5.99. With **no** `delivery-postcode` cookie, an order to `MK9 2EA` (area `MK`, no overrides)
    is placed without the R23 message.

R40. After R35–R39, Aheed's dev delivery areas and overrides are restored to what was recorded
    before R35, and any `DeliveryRefusalCount` rows created for Aheed during validation are deleted.

## E. Documentation and carry-forward

R41. None of `lib/delivery-area-form.ts`, `lib/delivery.ts`, `features/admin/delivery-areas.ts`,
    `tests/delivery-area-form.test.ts` contains `RegExp`; each header comment describes area versus
    district matching as the code does it.

R42. The `/staff/delivery-areas` page intro mentions areas, districts and per-area charges.

R43. The "Delivery areas — `/staff/delivery-areas`" section of
    `docs/store-admin-guide/admin-tabs-guide.md` no longer contains `Prefixes are whole postcode
    areas`, and covers: area vs district, lists and ranges and the 100 limit, excluding by listing
    served districts, per-area charges with blank = store default and what `0` means for each
    field, that charges apply to delivery only, the turned-away table, and that it holds no
    personal data.

R44. `specs/decisions/ADR-006-store-locations.md` carries a dated 2026-09-24 note (citing `#613`,
    `#890`) that delivery geography and per-area charges live on `VendorDeliveryArea` as postcode
    areas/districts, ranges are input-only, and ADR-004's `Region`/`Location` tables and exclusion
    rules remain unbuilt. `specs/architecture.md` describes per-area pricing resolution and the
    `DeliveryRefusalCount` table.

R45. `specs/roadmap.md`'s Roadmap Change Log has a row for PR #887 (merge `3b85289`), and
    `npm run sdd:audit` no longer lists PR #887 as pending carry-forward.

## F. Gates

R46. `CHANGELOG.md` updated, citing `#613`, `#890` and `#889` (Gate 4).

R47. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate` and
    `npm run kms:check-generated` exit 0; `npx vitest run`, run alone, passes with every test file
    executed; `npm run kms:assemble:internal` followed by a Next build in `kms/site-internal`
    succeeds; PR CI is green.
