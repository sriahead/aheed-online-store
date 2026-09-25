# P10 #613/#890/#889 — Delivery areas: district ranges, per-area pricing, refusal counts (build notes)

Written at the end of Build, before the Clear. Build commit: `dfde0d7` on
`feature/613-delivery-area-geography` (cut from `origin/staging` at `8a9f2d1`). Spec commits
`6d164a5` + `10db995` (runbook regen); Discover log `32452d6`.

## What changed and why

**Schema and migration.**
- `VendorDeliveryArea` gains `deliveryFeePence Int?`, `minimumOrderPence Int?`,
  `freeDeliveryThresholdPence Int?`.
- New `enum DeliveryRefusalSource { HEADER CHECKOUT }` and `model DeliveryRefusalCount` with a
  four-key unique; `Vendor` gains the back-relation `deliveryRefusalCounts`.
- Migration `prisma/migrations/20260924120000_p613_delivery_area_overrides_refusal_counts/`. It is
  additive only, and **already applied to the dev database** (`ep-dry-morning-zab7dx08`) via
  `prisma migrate deploy`. Staging and production get it through CI on merge/promotion.

**Matching — `lib/delivery.ts`.**
- Rewritten around `matchDeliveryArea(postcode, areas)`, generic over any `{ prefix }` row so pricing
  gets the matched row's overrides back.
- A district row wins over an area row regardless of list order.
- `isDeliverable` is now `matchDeliveryArea(...) !== null`. Every pre-existing assertion in
  `tests/is-deliverable.test.ts` is untouched and passes.

**Parsing — `lib/delivery-area-form.ts`.**
- `parsePrefixListInput`: comma split, range expansion, de-dupe, 100 cap.
- `parseAreaChargesInput` reuses `parseOptionalPoundsToPence` from `lib/delivery-rules-form.ts`.
- `bulkAddMessage` produces the R11 strings.
- `DeliveryAreaFormState.message`, and the three money field-name constants.
- `parsePrefixInput` is byte-for-byte the same logic.

**Pricing.**
- `lib/delivery-pricing.ts`: pure `resolveDeliveryRules`, plus `encodeDeliveryQuote` / `quoteMatches`
  for R23.
- `lib/delivery-pricing-service.ts`: `getShopperDeliveryRules(profile, method)`, React-`cache`d, reads
  the `delivery-postcode` cookie.
- `VendorProfile.deliveryAreas` (in `lib/repositories/vendor.ts`) carries the overrides;
  `deliveryPrefixes` is kept and derived.

**Consumers switched to the resolver (R22):**
- `components/layout/Header.tsx` (cart drawer props)
- `app/(storefront)/cart/page.tsx`
- `app/(storefront)/checkout/page.tsx` — also passes `quotedDeliveryRules` to `CheckoutForm`, which
  renders it as a hidden input
- `app/(landing)/page.tsx`
- `features/checkout/place-order.ts`

**Refusals.**
- `lib/repositories/delivery-refusals.ts` (pure): `recordDeliveryRefusal` upsert and
  `listRecentDeliveryRefusals` fold.
- `lib/delivery-refusal.ts` (pure): `refusalRecordFor`, `refusalWindowStart`.
- `lib/delivery-refusals-service.ts`: `recordRefusalIfOutside`, `recordRefusalForPostcode`,
  `listRecentRefusalsForCurrentVendor`, all failure-swallowing.
- Call sites: `features/storefront/delivery.ts` `setDeliveryPostcode` (HEADER) and `place-order`'s
  eligibility refusal branch (CHECKOUT).

**Staff.**
- `lib/repositories/delivery-areas.ts`:
  - `createDeliveryAreasForVendor` (WS, `createMany`, `skipDuplicates`)
  - `updateDeliveryAreaChargesForVendor` (WS, `updateMany` scoped `{ id, vendorId }`)
  - `create` accepts charges; `list` returns them
- The service exposes `createMany` / `updateCharges`.
- Actions: `addDeliveryArea` routes one value to `create` and two or more to `createMany`; new
  `updateDeliveryAreaCharges`.
- `components/staff/DeliveryAreaManager.tsx`:
  - label, placeholder, `maxLength={200}` and help text
  - optional charges (in a `<details>`)
  - per-row charges display and edit form
  - `Feedback` no longer wrapped in `sm:sr-only`, and now `role="status"` on success
- The page shows the turned-away table and the new intro.

**Docs.**
- `docs/store-admin-guide/admin-tabs-guide.md` 2.3.0
- `specs/decisions/ADR-006-store-locations.md` 1.1.0 (dated note)
- `specs/architecture.md` 1.32.0 §3.1a
- `specs/roadmap.md` PR #887 change-log row (R45)
- `CHANGELOG.md` entry
- Stale `RegExp` prose removed from the four files named in R41, including the explanatory comment in
  `tests/delivery-area-form.test.ts` (comments only; no assertion changed)

**Tests.**
- New:
  - `tests/delivery-pricing.test.ts`
  - `tests/delivery-areas-actions.test.ts`
  - `tests/delivery-refusals.test.ts`
  - `tests/delivery-refusals-service.test.ts` (R32, incl. `setDeliveryPostcode`)
  - `tests/place-order-delivery-pricing.test.ts` (R23 + R31/R32 at checkout)
- Extended:
  - `tests/delivery-area-form.test.ts`
  - `tests/delivery-areas-repository.test.ts`
  - `tests/is-deliverable.test.ts`
  - `tests/order-totals.test.ts` (R20)
  - `tests/admin-only-authorization.test.ts` (new action refused for STAFF)
- Full `npx vitest run` alone at Build: **167 files / 2216 tests passed**.
- `lint`, `typecheck`, `format:check`, `kms:validate` and `kms:check-generated` passed after commit.
- `kms:assemble:internal` plus `next build` in `kms/site-internal` succeeded.

**Live proof run at Build (R34):** `npx tsx scripts/verify-delivery-areas.ts` against dev printed
`ALL CHECKS PASSED`:
- first bulk insert `added=10`, second `added=0`
- MK10 charges updated via WS
- the cross-vendor update refused
- `MK10 1AA` resolved to 599/3000/0
- `MK9 2EA` resolved to the defaults
- `MK17 8NL` uncovered by `MK1`–`MK10`
- the refusal upsert reached count 2
- Aheed restored to `[["MK",null,null,null]]`; SriMart `[["RG",…]]` untouched

Validation must still re-run it from the fresh context. **Dev's Aheed `VendorConfig` defaults are
fee 349, minimum 1500 (£15.00), threshold 3000 (£30.00)** — use these, not the spec's illustrative
349/0/4000, when reading R38's live output.

## Decisions taken during the build

- **Migration generated with `prisma migrate diff --from-schema-datamodel <origin/staging schema>
  --to-schema-datamodel prisma/schema.prisma --script`, not `migrate dev --create-only`.**
  - `migrate dev` against dev refused with "The migration `20260820200500_p8_image_needs_review` was
    modified after it was applied … We need to reset the public schema". A reset was **not**
    performed.
  - The datamodel diff needs no database and cannot propose the `pg_trgm` drops, because they are in
    neither datamodel. This matches `#876`'s precedent.
  - The SQL was read before `prisma migrate deploy` applied it.
  - The p8 checksum drift on dev is pre-existing and untouched; filed as **`#895`** (Backlog).
- **`resolveDeliveryRules` takes the `VendorProfile` directly as `vendorDefaults`** (structural typing),
  so `place-order` never spells `vendor.deliveryFeePence`. R22's grep therefore holds for all five
  files.
  - `lib/delivery-pricing-service.ts` and the staff page do read the vendor-wide fields. Neither is in
    R22's list: the service *is* the resolver's default feed, and the staff page shows defaults
    beside overrides.
- **`place-order` compares the quote only for DELIVERY orders.** A COLLECTION order resolves to vendor
  defaults and never checks `quotedDeliveryRules`. Switching Delivery→Collection can only lower the
  charge (no fee), so refusing it would be pointless.
- **On an R23 mismatch `place-order` calls the existing `setDeliveryPostcode` server action** to move
  the cookie, rather than duplicating cookie attributes. That call also runs the HEADER refusal
  recorder, which records nothing here: the postcode already passed `blocksCheckout`, so it is
  deliverable.
- **Header refusals: `recordRefusalForPostcode` does the eligibility lookup inside its own try.**
  `setDeliveryPostcode` previously did no lookup; a reference-DB outage now costs one extra caught
  error, never a broken control.
  - `getDeliveryEligibility` is React-`cache`d, so the header re-render in the same request reuses it.
- **Refusal district** = first token of the eligibility's canonical spaced postcode (`MK17 8NL` →
  `MK17`). **Day** = `calendarDayToUtcMidnight(calendarDayInZone(now, profile.timezone))`. The staff
  window is today minus 29 days, inclusive (30 vendor-local days).
- **Bulk add revalidates only when `added > 0`.** An all-duplicates submission changes nothing.
- **Landing banner hides "free delivery over" for a threshold of `0`** as well as `null`. Previously it
  hid only on `null`, which is fine at vendor level today but would show "Free delivery over £0.00"
  for a per-area `0`.
- **Staff row display:** a `null` override shows `Store default (£x.xx)` (or `Store default (none)`
  for a null vendor threshold); a threshold override of `0` shows `Not offered`.
- **The add form's charges sit in a collapsed `<details>`**, so the common case (just add districts)
  stays one field and one button.
- **R32 tests split into their own file** (`tests/delivery-refusals-service.test.ts`), because
  `vi.mock` is hoisted file-wide and would otherwise have mocked the repository the R29 tests
  exercise.

## Deviations from the spec

- **The spec folder was renamed during `/spec`**, from `2026-09-24-p613-delivery-area-district-ranges`
  (never committed) to `2026-09-24-p613-delivery-areas-ranges-fees-refusals`. It is the only spec
  folder for this slice.
- **R14's check says no `sr-only` wraps the add form's feedback.** The component has no `sr-only`
  anywhere now, and success feedback gained `role="status"`. That's additive, not a deviation, and is
  noted so the reviewer doesn't wonder.
- **R16's allowed statement list:** the generated SQL uses exactly `CREATE TYPE`, `ALTER TABLE … ADD
  COLUMN`, `CREATE TABLE`, `CREATE UNIQUE INDEX` and `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`,
  plus a header comment. Nothing else.
- Otherwise none.

## Known-shaky areas

- **R38/R39 end-to-end under `npm run preview` have NOT been run** — they are Validate's job. The
  riskiest paths:
  - **Checkout page quote vs. `place-order` recompute.** Both must derive the same three numbers.
    They share `resolveDeliveryRules` and the same profile, but the page uses the cookie's method
    (`getFulfilmentMethod()`) while `place-order` uses the submitted `fulfilmentMethod`. If the radio
    changed without a server re-render, the quote and the method could disagree.
    - Delivery→Collection skips the check (see Decisions).
    - Collection→Delivery with an overridden area should *refuse* (a genuine price difference).
    - Confirm the checkout form actually re-renders after the radio changes (`chooseMethod` writes the
      cookie via `setFulfilmentMethod`).
  - **Cookie value format.** `setDeliveryPostcode` stores `normalisePostcodeInput(...)`. The resolver
    and `matchDeliveryArea` normalise again, so format should not matter. R36's curl uses
    `delivery-postcode=MK9%202EA`, and the playbook notes cookie-format pitfalls; fall back to the
    header control if needed.
  - **The mismatch path's cookie move** happens inside a server action that returns an error state,
    not a redirect. The shopper sees the error, and the summary re-renders because
    `setDeliveryPostcode` revalidates the layout. Verify the summary actually shows the new charge
    without a manual reload (R39 allows a reload).
- **`place-order`'s refusal recording awaits a DB write on the refusal path.** Failure is swallowed
  (unit-tested), but it adds latency to a refused checkout only.
- **`updateMany` / `createMany` on WS are proven by the script against dev**, not yet under
  `npm run preview` on the Worker runtime. R35 (bulk add) and R26 (edit charges) through the real
  page are the runtime proof.
- **The `lib/delivery-rules-form.ts` comment and the Storefront section of the admin guide wrongly
  say a £0 vendor threshold makes every order free** (the code treats it as "not offered"). Out of
  scope; filed as **`#892`**. The new Delivery-areas section states the correct meaning, so the guide
  is internally inconsistent until `#892` lands.
- **Deferred items were filed at build-notes, both Status `Deferred` in the "Deferred —
  owner/external gated" milestone:**
  - **`#893`**: range shorthand, bulk removal, redundancy warning, collection charges, banner wording.
  - **`#894`**: refusal-count retention, lookup-API counting, per-area slot capacity.
  - Also: `#888` radius (Deferred), `#891` notify-me emails (Backlog, separate by owner decision),
    `#892` the £0-threshold doc contradiction (Backlog).
- **Dev database state after Build:** Aheed areas `MK` only (no overrides); SriMart `RG`; no
  `DeliveryRefusalCount` rows except any created by later manual testing. Setup step 5 of
  `validation.md` re-records this before R35.
