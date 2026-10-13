# P10 #1083/#1078/#1079 — Collection minimum, editable banner headline, honest referral copy (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Unit tests cover the resolver, the two form parsers, the header's two branches and the referral
> strings. The rest is proven live under `npm run preview` (never `npm run dev`, which cannot load
> the WASM Prisma engine). The live rows are the ones that matter: production refuses real collection
> orders today.

`BASE` below is the merge base: `git merge-base HEAD origin/staging`. Before any live row, apply the
migration to the local dev database (`npx prisma migrate deploy` against the dev `DIRECT_URL`) and
run `npm run preview`. Sign in to `/staff/storefront` as each vendor's demo admin, using the local
credentials in `docs/developer-portal/env-setup.md`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Static | `git diff BASE -- prisma/schema.prisma` shows exactly two added lines inside `model VendorConfig`: `collectionMinimumOrderPence Int @default(0)` and `bannerHeadline String?`, with optional trailing comments. There are no removed lines and no other hunks, apart from comment lines. |
| R2  | Static | `git diff --name-only --diff-filter=A BASE -- prisma/migrations` lists exactly one `migration.sql`. Read it: only `ALTER TABLE "VendorConfig" ADD COLUMN` statements for the two columns. `grep -ciE -e drop -e 'create index' -e 'update ' FILE` (FILE being that migration.sql) prints `0`. |
| R3  | Static | Read `getVendorProfile` in `lib/repositories/vendor.ts`: both fields are in the `config` select, and the returned object has `collectionMinimumOrderPence: vendor?.config?.collectionMinimumOrderPence ?? 0` and `bannerHeadline: … ?? null`. The `VendorProfile` type declares both. |
| R4  | Unit/Static | Read `resolveDeliveryRules`: the parameter type has a non-optional `collectionMinimumOrderPence: number`, and the `COLLECTION` branch returns it as `minimumOrderPence`. `npm run typecheck` exits 0, which proves every caller supplies it. The R5 tests and every pre-existing test in `tests/delivery-pricing.test.ts` pass. |
| R5  | Unit | `npx vitest run tests/delivery-pricing.test.ts` exits 0, and the file contains the two named cases (read them). |
| R6  | Static | Read `lib/delivery-pricing-service.ts`: the object passed to `resolveDeliveryRules` includes `collectionMinimumOrderPence: profile?.collectionMinimumOrderPence ?? 0`. |
| R7  | Unit | `npx vitest run tests/place-order-delivery-pricing.test.ts` (or the file the build notes name) exits 0. Read the two collection cases: subtotal below the delivery minimum, with collection minimum 0 not refused, and with collection minimum above the subtotal refused as below the minimum. |
| R8  | Unit | `npx vitest run tests/help-facts-and-faq-form.test.ts` (or the file the build notes name) exits 0, with the named 1500/0 case present. |
| R9  | E2E (preview) | As Aheed's admin on `/staff/storefront`: set Minimum delivery order `15.00`, tick Offer Click & Collect (filling in the location if empty), set Collection minimum order `0.00`, and save. As a shopper on Aheed, choose Collection, add items totalling under £15.00 and open `/cart`: no "more to reach the minimum" or shortfall message is shown. Open `/checkout`: no shortfall message, and submitting the form does not return "Your order is below this store's minimum." (any later step, such as payment, is fine). |
| R10 | E2E (preview) | Same state as R9. Open Aheed's `/help`: the collection section reads "There is no minimum for collection orders.", and the delivery section's Minimum Order line states £15.00. |
| R11 | E2E (preview) | Set Aheed's Collection minimum order to `20.00` and save. With the R9 collection basket (under £20), `/cart` shows the below-minimum shortfall, and `/help` reads "Collection orders must reach £20.00.". Set it back to `0.00` afterwards. |
| R12 | E2E (preview) | On `/staff/storefront`, with Offer Click & Collect ticked: the "Collection minimum order (£)" input (`#collectionMinimumOrder`) is visible with the stored value, plus the 0.00 help line. Untick the box: the input is gone from the DOM (devtools, or `document.getElementById("collectionMinimumOrder") === null`). |
| R13 | Unit | `npx vitest run tests/delivery-rules-form.test.ts` exits 0, and the file contains the three named cases. `grep -n "export const COLLECTION_MINIMUM_FIELD" lib/delivery-rules-form.ts` matches. |
| R14 | E2E (preview) | Aheed `/staff/storefront`: with collection ticked, set Collection minimum order `3.00` and save. Untick collection and save. Re-tick: the field shows `3.00`. Restore `0.00` and save. |
| R15 | E2E (preview) | On the same form, the delivery minimum's label reads "Minimum delivery order (£)", and its help line mentions that it does not apply to Click & Collect. |
| R16 | E2E (preview) | With Aheed's delivery minimum at £15.00, Aheed's `/` hero shows a badge reading "£15.00 minimum delivery order". Set the minimum to `0.00`: the badge is absent. Restore the original value. |
| R17 | Unit | The header test named in the build notes (for example `tests/header-brand.test.tsx`) exits 0 under `npx vitest run <file>`. It asserts that a set `bannerHeadline` renders and the derived line does not, and that with `null` the derived line renders exactly (with and without collection). |
| R18 | E2E (preview) + Static | On `/staff/storefront`, the "Banner Headline" input (`#bannerHeadline`) sits beside Banner Note with the blank-fallback help line. Read its `placeholder` in `components/staff/StorefrontConfigForm.tsx`: it contains no vendor name and no product or trade word. `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0. |
| R19 | Unit | `npx vitest run tests/brand-colour-validation.test.ts` (or the file the build notes name) exits 0, with the valid, blank and 121-character cases present. |
| R20 | Static | Read `updateVendorConfig`: `bannerHeadline` is written from the branding input the same way `bannerNote` is, so `null` is stored for blank. R21's clear-and-save step proves it live. |
| R21 | E2E (preview) | As Aheed's admin, enter a banner headline (any test text) and save. Aheed's `/` and `/help` both show that text as the banner's first line. SriMart's `/` still shows SriMart's derived line (the name, then "local delivery across", then the locality). Clear the field and save: Aheed's `/` shows its derived line again. |
| R22 | Unit | `npx vitest run` on the accordion test named in the build notes exits 0. Read `components/rewards/WaysToEarnAccordion.tsx`: the referral paragraph uses `formatPrice(...)` of the constant or prop, with no `£` literal. |
| R23 | Unit | `npx vitest run tests/referrals.test.ts` (or the file the build notes name) exits 0, with assertions that the share message and email body contain the formatted minimum and do not match `/first order/i`. Read `components/rewards/ReferralCard.tsx`'s `navigator.share` `text:` value: it does not say "first order". Comment lines are out of scope. |
| R24 | Static | `git diff BASE -- docs/store-admin-guide/admin-tabs-guide.md` shows a version bump, a description of Collection minimum order and of Banner Headline, and the removal or correction of the sentence saying Click & Collect always uses the store defaults. |
| R25 | Static | `git diff BASE -- CHANGELOG.md` shows an entry naming `#1083`, `#1078` and `#1079`. |
| R26 | Gates | Run each and read its real exit code (not through a pipe): `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate`, `npm run build`, then `npx vitest run` alone, then `npm run kms:assemble:internal` followed by `npx next build --webpack` run inside `kms/site-internal`. CI on the PR is the ground truth. |
