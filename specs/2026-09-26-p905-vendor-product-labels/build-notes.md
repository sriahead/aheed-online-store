# #905 — Per-vendor product labels, store description for AI, delivery-area examples (build notes)

Written at the end of Build (2026-09-26, Opus 5.5), before the pre-validation Clear. Commits on
`feature/905-vendor-product-labels`:

- `3e4642c`: the spec.
- `b05b619`: a spec amendment to R34/R35 and a new R35a (see Deviations).
- `cd07e50`: the build.
- The build-notes commit that carries this file.

## What changed and why

**Schema and migration**
- Seven new `VendorConfig` columns (R1).
- Migration `prisma/migrations/20260926180000_p905_vendor_product_label_settings/migration.sql`:
  - generated with `prisma migrate diff --from-schema-datamodel <origin/staging schema>
    --to-schema-datamodel prisma/schema.prisma --script`, never `migrate dev`, because of the
    `#895` reset trap;
  - Prisma proposed nothing beyond the seven columns (no `pg_trgm` drop this time);
  - the two backfill `UPDATE`s were appended by hand. The second sets `showHmcCertification` from
    the first's halal result.
- **Applied to dev** (`ep-dry-morning-zab7dx08`, confirmed separate from staging and production
  before applying) with `npx prisma migrate deploy`. A throwaway scratch query recomputed R3 for
  every `VendorConfig` row:
  - 0 mismatches;
  - `aheed-food-centre` has all six on;
  - `srimart` and every test vendor have all off;
  - every `storeDescription` is null. The seed sets it, but dev was not re-seeded.

**Settings**
- `lib/catalogue-settings-form.ts` is the pure parser (R5).
- `lib/store-description.ts` holds the whitespace-collapse and 200-character limit, shared by the
  parser and the prompts.
- `updateCatalogueSettings` is in `features/admin/storefront.ts` (R6).
- The fourth `<form>` is in `components/staff/StorefrontConfigForm.tsx` (R7). It reads the six
  booleans straight from `initialConfig`, which is the Prisma `VendorConfig` row.
- `VendorProfile` and `VendorStorefrontConfigInput` carry the new fields (R6, R8).

**Label gating**
- `lib/product-label-settings.ts` (R9) holds `ProductLabelSettings`, `labelSettingsFromProfile` and
  `applyProductLabelSettings`.
- `ProductWriteInput`'s eight governed fields are now `| undefined` (R10). The repository create
  and update already passed them straight through, so they needed no change.
- `saveProduct` strips disabled labels before both writes (R11).
- `ProductForm` requires a `labels` prop (R13). The HMC section is wrapped in `labels.hmc &&`; the
  large `numstat` for `ProductForm.tsx` is that re-indentation, not new logic.
- The two product pages pass the prop (R14).

**AI prompts**
- `buildNormalisationPrompt`/`normaliseList`, the new exported `buildSynonymPrompt`/`proposeSynonyms`,
  and `buildNetContentPrompt`/`SuggesterInput` each take a required description (R16–R18).
- Callers (R19):
  - `features/cart/match-list.ts` gets it from `getCurrentVendorProfile()`;
  - `lib/search-synonyms-service.ts` from `getVendorConfig(prisma, vendorId)`;
  - `lib/net-content-run.ts`'s `RunDependencies.storeDescription`, which
    `scripts/suggest-net-content.ts` fills per vendor from `vendor.config.storeDescription`;
  - `scripts/verify-list-normalisation.ts` passes `null`.

**Referrals (`#907`, R21–R23a)**
- `buildShareLinks` takes a required `discountOffPence` and formats it with `formatPrice`.
- `ReferralCard` and `RewardsPanel` fall back to `REFERRAL_DISCOUNT_PENCE`.
- `generateReferralCode("")` returns `REF_NOCAPED`.

**Delivery examples (R24–R28)**
- `lib/delivery-area-examples.ts` is the pure resolver.
- `exampleDeliveryAreaForVendor(vendorId)` in `lib/delivery-areas-service.ts` reads `VendorLocation`
  and the vendor's delivery areas. Both the page and `addDeliveryArea` use it, so the placeholder,
  help text and error messages always agree.
- `parsePrefixInput`/`parsePrefixListInput` take a required `exampleArea`.
- The store-address placeholders are neutral.

**Help page (R29)**
- `/help` reads `getCurrentVendorProfile().localityName`. Its comment deliberately avoids naming the
  town, so R29's absence check doesn't match the comment.

**Guards, seed and docs**
- The vendor-neutral denylist and file list are extended (R30).
- Seed values are set for both vendors (R31):
  - Aheed's description is 123 characters and carries the South Asian and transliteration context
    that used to be hardcoded;
  - SriMart's is 100 characters.
- Admin guide 2.5.0 (R32), app-conventions 1.2.0 (R33), the roadmap PR #910 row (R36) and handoff
  1.39.0 (R37).
- **Persistent doc:** `specs/architecture.md` 1.34.0 gains the standing rule that a prompt learns
  what the shop sells only from the vendor (in the AI section, after `#900`'s paragraph).

**New tests**
- `tests/catalogue-settings-form.test.ts`
- `tests/product-label-settings.test.ts`
- `tests/store-description-prompts.test.ts`
- `tests/delivery-area-examples.test.ts`
- `tests/product-form-labels.test.tsx`

These existing tests were updated for the new signatures, and some gained cases:
- `delivery-area-form` (R27 cases);
- `referrals` (R23, R23a);
- `net-content-run` (the R19 pass-through case);
- `net-content-suggester`;
- `list-normalisation`;
- `vendor-neutral-copy`.

**Checks run at Build** (proof that the build is wired correctly, not validation):
- `npm run typecheck`, `npm run lint` and `npm run format:check` each exit 0.
- The 12 affected test files pass (217 tests). **The full suite was not run.**
- Under `npm run preview`:
  - `/help` shows Milton Keynes on the Aheed host and Reading on the SriMart host;
  - signed in as Aheed's admin (via the curl `api/auth/sign-in/email` route with an
    `Origin: http://localhost:8787` header), `/staff/products/new` renders all eight checkbox
    names;
  - `/staff/delivery-areas` shows `An area such as MK` and placeholder `MK, MK1 or MK1-MK10`;
  - `/staff/storefront` renders the new form and the two neutral placeholders.

## Decisions taken during the build

- **`saveProduct` and both product pages read the settings with `fetchVendorProfile(auth.vendorId)`,
  not `getCurrentVendorProfile()`.** This keys them on the vendor the session is authorised for,
  the same id the write uses, rather than on the request host. R11's validation row allows "the
  vendor-service equivalent".
- **The settings action revalidates `/staff/products` as a layout,** so every product edit page
  picks up a changed label set.
- **When the resolver falls through to delivery areas, "first" means alphabetically first**
  (`[...prefixes].sort()[0]`), then that prefix's leading letters. It does not mean the most
  recently added area. It is deterministic and matches R24's test.
- **The settings form uses a `<fieldset>` with a `<legend>`** for the six checkboxes, and marks
  `aria-invalid` on the field the error names.
- **The new product-form test mocks** `@/features/admin/catalogue`, `ProductImageUploader` and
  `ProductImageManager`, following `quick-view.test.tsx`'s pattern.
- **The description is inserted with `"` replaced by `'`**, as R15 says, and truncated in
  `storeDescriptionPromptLine` as well as in the parser, as defence in depth.

## Deviations from the spec

- **R34(a) and R35's signed-in SriMart rows were amended at Build (commit `b05b619`), and R35a was
  added.**
  - `docs/developer-portal/local-dev-playbook.md` records that Better Auth refuses sign-in on the
    made-up `srimart.localhost` alias. The original rows could never be executed.
  - R34(a) now proves the gate by switching Aheed's own labels off.
  - R35a moves the SriMart signed-in check to SriMart's staging host after merge. It runs at Ship.
    **Staging's demo accounts have never been checked** (handoff); if no SriMart admin exists
    there, R35a records that and stops.
- **R27, null-example branch.** The invalid-entry message without an example area reads `"<entry>"
  is not a postcode area or district. Use 1-2 letters, optionally followed by numbers, or a range of
  districts.` The original ended `or a range like MK1-MK10`, and simply dropping `like …` would have
  left the sentence ending on "a range". This satisfies R27's checks (no `e.g.`, no `like`, names
  the entry); the wording changed slightly more than "the rest unchanged" implies.
- **R37.** The handoff's `updated:` was already `2026-09-26` and cannot move within the same day.
  `version` was bumped (1.38.0 → 1.39.0), and R37's `git diff` shows the front-matter changed.

## Known-shaky areas

- **R34(b), the core promise, has only unit and code-read proof.** A disabled label must survive a
  real product save. Prisma is expected to treat `undefined` as "no change" on `update` inside the
  WebSocket `$transaction`, but the live save-then-query has not been run. Run R34(b) exactly as
  written, and check the database, not the form.
- **Create path with labels off.** A new product for a vendor with labels off relies on Prisma
  giving `undefined` the column default in a nested `product.create`. This has not been exercised
  live.
- **`match-list.ts` now calls `getCurrentVendorProfile()` on every shopping-list submission**, before
  the rate-limit check. It is a per-request cached read that other storefront paths already make,
  so it should be cheap, but it is a new DB read on the public path.
- **No live AI call was made with a description.** Only the prompt text is proven, by unit tests.
  Whether Gemma or Llama behaves differently with the new neutral first line, especially Aheed's
  shopping-list matching quality, is unmeasured. `#901`'s production pilot would read this
  slice's prompt if both land first.
- **The production backfill runs against production data nobody has measured** (handoff:
  "Production was not measured" for net content). If production Aheed products carry no labels,
  every Aheed label starts off there. The admin guide tells the admin to switch them on; worth
  checking at Ship with a read-only query.
- **The R30 denylist includes `Milton Keynes`, scanned across `app/**/*.tsx`.** Any future
  legitimate Aheed-specific literal in a `.tsx` would trip it. Today, Aheed's locality comes from
  the DB, so none exists.

## Fix (2026-09-26, Sonnet 5)

`/validate` ran the full suite alone (never done at Build — see above) and found one regression:
`tests/delivery-areas-actions.test.ts` (5 tests, pre-existing, untouched by this branch's diff)
threw `No "exampleDeliveryAreaForVendor" export is defined on the "@/lib/delivery-areas-service"
mock` on every `addDeliveryArea` case. R27's own change — `features/admin/delivery-areas.ts` now
calls that function before parsing — was correct; the test's `vi.mock("@/lib/delivery-areas-service",
...)` factory simply predated it and only stubbed `getDeliveryAreaRepository`.

**Root cause, not the check:** the missing coverage was the mock, not the production code, so the
fix is entirely in the test file — `exampleDeliveryAreaForVendor: vi.fn().mockResolvedValue(null)`
added to that mock factory. `null` matches what every case in that file already exercises (valid
single prefixes, ranges, and charge validation, none of which reach the example text), so no
existing assertion changed. `npx vitest run tests/delivery-areas-actions.test.ts` now passes (8/8),
and `npx vitest run` (alone, full suite) passes at 180/180 files, 2378/2378 tests — no other row
regressed.

No observable behaviour changed (test-only fix), so no `CHANGELOG.md` entry.

Also resolved by `/validate`'s live pass, superseding the two bullets above it were raised against:
**R34(b) and R35's core promise were proven live** (Organic disabled, an unchanged save of a real
`isOrganic: true` product left it `true` in the database and the storefront still showed the
Organic badge) — the create-path-with-labels-off risk was not separately exercised and remains
open.
