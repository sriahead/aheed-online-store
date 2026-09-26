# #905 — Per-vendor product labels, store description for AI, delivery-area examples (requirements / acceptance criteria)

Slice 2 of `#729`, with `#907` folded in. Read `plan.md` in this directory for the reasoning and
the four owner decisions (2026-09-26); this file is the checklist.

In summary:

- each vendor chooses which of the six grocery labels its staff product form shows;
- a label switched off keeps every product's stored value;
- an optional store description replaces the hardcoded "grocery" framing in three AI prompts;
- delivery-area examples and the help page's locality come from the vendor;
- referral share messages format the real discount.

One additive migration. The storefront's badges and facets are unchanged.

Terms used below:

- **The six label settings**: the new `VendorConfig` columns `showHalalLabel`, `showFreshLabel`,
  `showOrganicLabel`, `showVegetarianLabel`, `showGlutenFreeLabel` and `showHmcCertification`.
- **Label fields**: the `Product` write fields each setting governs.
  - `showHalalLabel` governs `isHalal`.
  - `showFreshLabel` governs `isFresh`.
  - `showOrganicLabel` governs `isOrganic`.
  - `showVegetarianLabel` governs `isVegetarian`.
  - `showGlutenFreeLabel` governs `isGlutenFree`.
  - "HMC shown" means `showHalalLabel` **and** `showHmcCertification` are both true. It governs
    `isHmcCertified`, `hmcReference` and `hmcVerifiedAt`.
- **Aheed host** is `localhost:8787` and **SriMart host** is `srimart.localhost:8787`, both under
  `npm run preview`.

## Schema and migration

R1. In `prisma/schema.prisma`, `model VendorConfig` has seven new fields:
    - `showHalalLabel`, `showFreshLabel`, `showOrganicLabel`, `showVegetarianLabel`,
      `showGlutenFreeLabel` and `showHmcCertification`, each `Boolean @default(false)`;
    - `storeDescription String?`.

    No other model's fields change.

R2. Exactly one new directory exists under `prisma/migrations/`. Its `migration.sql` consists only
    of:
    - `ALTER TABLE "VendorConfig" ADD COLUMN` statements for the seven R1 columns;
    - `UPDATE "VendorConfig"` statements that backfill the six booleans.

    It contains no `DROP`, no `CREATE INDEX`, no `ALTER INDEX`, and no statement that writes to any
    other table.

R3. The backfill sets each vendor's settings from its own products (active and inactive):
    - each of `showHalalLabel`, `showFreshLabel`, `showOrganicLabel`, `showVegetarianLabel` and
      `showGlutenFreeLabel` is `true` exactly when at least one `Product` row with that `vendorId`
      has the governed field true;
    - `showHmcCertification` is `true` exactly when such a row has `isHmcCertified = true` **and**
      the same vendor's `showHalalLabel` backfills to `true`.

    The SQL names no vendor id, slug or name.

R4. After the migration is applied to the dev database, every `VendorConfig` row satisfies R3 when
    recomputed independently from `Product`. On dev, SriMart's six label settings are all `false`.

## Label settings: parsing, action, form, profile

R5. A new module `lib/catalogue-settings-form.ts` (no `"use server"` directive) exports
    `parseCatalogueSettings`. It is pure, takes the submitted values, and returns either the seven
    fields or a field error:
    - (a) Each label setting is `true` exactly when its submitted value is `"on"`.
    - (b) `storeDescription` is processed in this order:
      1. trimmed;
      2. every run of whitespace, including newlines, collapsed to one space;
      3. `""` becomes `null`.
    - (c) A `storeDescription` longer than 200 characters **after** (b) is refused. The error is on
      field `storeDescription`, with message
      `Keep the store description to 200 characters or fewer.`
    - (d) `showHmcCertification` on with `showHalalLabel` off is refused. The error is on field
      `showHmcCertification`, with message
      `HMC certification needs the Halal label switched on.`

R6. `features/admin/storefront.ts` exports an async server action `updateCatalogueSettings(prev,
    formData)`.
    - It calls `requireVendorRole("ADMIN")` and returns a refusal message rather than throwing when
      that fails.
    - It parses with R5.
    - On success it passes exactly the seven R1 fields to `updateVendorStorefrontConfig`.
    - It revalidates `/staff/storefront`, `/staff/products` and the `/` layout.

    Also:
    - `VendorStorefrontConfigInput` in `lib/repositories/vendor.ts` declares the seven fields as
      optional, and `updateVendorStorefrontConfig` writes them.
    - `updateStorefrontConfig`, `updateDeliveryRules` and `updateSocialContact` pass none of the
      seven keys.
    - The file still exports only async functions.

R7. `components/staff/StorefrontConfigForm.tsx` renders its own `<form>` bound to
    `updateCatalogueSettings`. It is separate from the branding, delivery-rules and social-links
    forms, and has the heading `Product labels & store description`. It contains:
    - six checkboxes named after the six label settings, labelled `Halal`, `Fresh`, `Organic`,
      `Vegetarian`, `Gluten free` and `HMC certification`, each `defaultChecked` from the vendor's
      stored value;
    - an input or textarea with `id` and `name` `storeDescription`, labelled
      `What this store sells`, with `maxLength={200}` and the stored value as its default;
    - help text that says:
      - switching a label off hides it on the product form but keeps the value already saved on each
        product;
      - HMC certification needs Halal;
      - the description is given to the store's AI features.
    - a field-level error rendered against the input named in the returned error.

R8. `VendorProfile` in `lib/repositories/vendor.ts` has seven new fields:
    - `showHalalLabel`, `showFreshLabel`, `showOrganicLabel`, `showVegetarianLabel`,
      `showGlutenFreeLabel` and `showHmcCertification`, each `boolean`;
    - `storeDescription: string | null`.

    `fetchVendorProfile` selects them. For a vendor with no `VendorConfig` row it returns `false`
    for each boolean and `null` for the description.

## Staff product form and save path

R9. A new pure module `lib/product-label-settings.ts` exports:
    - a `ProductLabelSettings` type with boolean keys `halal`, `fresh`, `organic`, `vegetarian`,
      `glutenFree` and `hmc`, where `hmc` means "HMC shown" as defined above;
    - `labelSettingsFromProfile(profile)`, which builds that type from a `VendorProfile`;
    - `applyProductLabelSettings(values, settings)`. It returns the product write input with each
      disabled label's governed fields set to `undefined`, and leaves every other field unchanged.

R10. `ProductWriteInput` in `lib/repositories/products.ts` types each governed field as possibly
     `undefined`. `createProductForVendor` and `updateProductForVendor` pass the fields straight to
     Prisma. So an `undefined` field is:
     - left unchanged by an update;
     - set to the schema default (`false`, or `null` for the two HMC detail fields) by a create.

     No other field of `ProductWriteInput` changes type.

R11. `saveProduct` in `features/admin/catalogue.ts` reads the vendor's label settings server-side,
     from the current vendor profile and never from the submitted form. It passes the parsed values
     through `applyProductLabelSettings` before both `createProductForVendor` and
     `updateProductForVendor`.

R12. `tests/product-label-settings.test.ts` exists and passes, covering:
     - (a) all six settings on: the values come back unchanged;
     - (b) `organic` off: `isOrganic` is `undefined`, even when the input had `isOrganic: true` (a
       crafted field), and every other label field is unchanged;
     - (c) `hmc` off: `isHmcCertified`, `hmcReference` and `hmcVerifiedAt` are all `undefined`;
     - (d) `labelSettingsFromProfile` gives `hmc: false` when `showHmcCertification` is `true` but
       `showHalalLabel` is `false`.

R13. `components/staff/ProductForm.tsx` requires a `labels: ProductLabelSettings` prop.
     - It renders the `isHalal`, `isFresh`, `isOrganic`, `isVegetarian` and `isGlutenFree`
       checkboxes only when their setting is on.
     - It renders the whole `HMC certification` section only when `labels.hmc` is true.
     - It always renders `isFeatured` and `isActive`.
     - When none of the five label checkboxes renders, the section heading reads `Visibility`
       instead of `Labels & visibility`.

R14. `app/(admin)/staff/products/new/page.tsx` and `app/(admin)/staff/products/[id]/page.tsx` pass
     `labels={labelSettingsFromProfile(profile)}`, using the current vendor's profile.

## Store description in AI prompts

R15. A new pure module `lib/store-description.ts` exports `storeDescriptionPromptLine(description:
     string | null): string | null`.
     - For `null` or an all-whitespace value it returns `null`.
     - Otherwise it applies R5(b)'s whitespace rule, truncates to 200 characters, replaces each `"`
       with `'`, and returns exactly `The shop describes itself as: "<value>"`.

R16. `lib/list-normalisation.ts`: `buildNormalisationPrompt(lines, storeDescription)` takes a
     required second parameter of type `string | null`, and `normaliseList(lines,
     storeDescription)` forwards it.
     - The first line of the prompt is
       `You read UK shopping lists that shoppers typed for an online shop.`
     - When R15 returns a line, it is the prompt's second line.
     - The rest of the prompt (numbered lines, keys, rules) is unchanged.

R17. `lib/search-synonym-proposals.ts` exports `buildSynonymPrompt(queries, vocabulary,
     storeDescription)`, and `proposeSynonyms(queries, vocabulary, storeDescription)` takes the same
     required third parameter.
     - The prompt's first line is
       `You map words UK shoppers type into the words this shop's catalogue uses.`
     - When R15 returns a line, it is the prompt's second line.

R18. `lib/net-content-suggester.ts`: `buildNetContentPrompt`'s input and `SuggesterInput` each gain
     a required `storeDescription: string | null`, and `buildNetContentRequestBody` forwards it.
     - The prompt's first line is
       `You read the net content (pack size) of one product for a UK shop's catalogue.`
     - When R15 returns a line, it is the prompt's second line.
     - Every rule line in the existing prompt is unchanged, including the "electrical item sold
       singly" rule.

R19. Every caller passes the vendor's real description:
     - `features/cart/match-list.ts` passes the current vendor profile's `storeDescription` to both
       `buildNormalisationPrompt` and `normaliseList`;
     - `lib/search-synonyms-service.ts` reads the vendor's `VendorConfig.storeDescription` for the
       `vendorId` it was given and passes it to `proposeSynonyms`;
     - `lib/net-content-run.ts` takes `storeDescription: string | null` in its dependencies and puts
       it in every `suggest` call;
     - `scripts/suggest-net-content.ts` reads each vendor's `config.storeDescription` and passes it
       per vendor;
     - `scripts/verify-list-normalisation.ts` passes `null`.

R20. `tests/store-description-prompts.test.ts` exists and passes, covering:
     - (a) with `null`, each of the three prompt builders produces a prompt that does not match
       `/grocer|south asian/i`;
     - (b) with `"Phones & chargers"`, each prompt's second line is exactly
       `The shop describes itself as: "Phones & chargers"`;
     - (c) with the value `'Line one\n\nsays "hi"'`, the line is
       `The shop describes itself as: "Line one says 'hi'"`;
     - (d) a 300-character value yields a quoted value of exactly 200 characters.

## Referral share text (`#907`)

R21. `buildShareLinks(referralUrl, storeName, discountOffPence)` in `lib/referrals.ts` takes a
     required third parameter `discountOffPence: number`. The X, WhatsApp and email messages each
     contain `formatPrice(discountOffPence)`. No string literal in `lib/referrals.ts` contains
     `£5`.

R22. `components/rewards/ReferralCard.tsx` passes its `discountOffPence` to `buildShareLinks`, and
     its `discountOffPence` default is `REFERRAL_DISCOUNT_PENCE`, not a numeric literal.
     `components/rewards/RewardsPanel.tsx` falls back to `REFERRAL_DISCOUNT_PENCE`, not `500`.

R23. `tests/referrals.test.ts` asserts that with `discountOffPence = 750`:
     - the decoded X, WhatsApp and email texts each contain `£7.50`;
     - none of them contains `£5`.

     It passes.

R23a. `generateReferralCode` in `lib/referrals.ts` returns `"REF_NOCAPED"` for an empty or
      non-string user id; before this slice it returned `"REF-AHEED"`. `tests/referrals.test.ts`
      asserts:
      - `generateReferralCode("")` equals `"REF_NOCAPED"`;
      - `extractReferralPrefix("REF_NOCAPED")` is `null`.

## Delivery-area examples and help-page locality

R24. A new pure module `lib/delivery-area-examples.ts` exports two functions and one type.
     - `exampleAreaFor({ storePostcode, deliveryPrefixes })` returns, in this order:
       1. the postcode area of `storePostcode` when it parses (`postcodeAreaOf`);
       2. otherwise the leading letters of the alphabetically first entry of `deliveryPrefixes`;
       3. otherwise `null`.
     - `deliveryAreaExamples(area)` returns `null` for `null`. Otherwise it returns
       `{ area, district: area + "1", list: area + "1, " + area + "3, " + area + "5", range: area +
       "1-" + area + "10" }`.
     - The `DeliveryAreaExamples` type describes that object.

     `tests/delivery-area-examples.test.ts` passes, covering:
     - `"RG1 1AA"` → `RG`;
     - a `null` postcode with `["RG1", "MK"]` → `MK`;
     - an unparseable postcode with `["RG1"]` → `RG`;
     - `null` with `[]` → `null`;
     - the full example object for `RG`.

R25. `app/(admin)/staff/delivery-areas/page.tsx` resolves the example area with R24, from the
     vendor's `VendorLocation.postcode` (or `null` when there is no row) and the listed areas'
     prefixes.
     - With an area, its intro paragraph reads
       `An area such as <area> covers every district in it; a district such as <district> covers
       only that one.`
     - With none, it reads `An area covers every district in it; a district covers only that one.`
     - The rest of the paragraph is unchanged.
     - The page contains no hardcoded `MK` in rendered text.

R26. `AddDeliveryAreaForm` in `components/staff/DeliveryAreaManager.tsx` takes a required prop
     `examples: DeliveryAreaExamples | null`.
     - **Placeholder.** With examples it is `<area>, <district> or <range>`; with `null` it is
       `Postcode areas, districts or a range`.
     - **Help text.** It keeps its four rules: an area, a district, a list or range, and "to leave a
       district out". With examples, each rule shows the matching example value. With `null`, it
       shows no example values.
     - The component's code contains no `MK`.

R27. `parsePrefixInput(raw, exampleArea)` and `parsePrefixListInput(raw, exampleArea)` in
     `lib/delivery-area-form.ts` take a required `exampleArea: string | null`.
     - With an example area, every error message that used an MK example uses that area's R24
       examples instead.
     - With `null`, the `(e.g. …)` and `like …` clauses are omitted, and the rest of the message is
       unchanged.
     - `features/admin/delivery-areas.ts` resolves `exampleArea` the same way R25 does before
       parsing.
     - The existing delivery-area form tests are updated.
     - New cases assert the message for `"RG1-RG0"` names `RG1-RG10`, and the message for an
       invalid entry with `null` contains neither `e.g.` nor `like`.

     All pass.

R28. In `components/staff/StorefrontConfigForm.tsx`, the collection-address placeholders
     `e.g. Milton Keynes` and `e.g. MK9 3QA` are `Town or city` and `Full postcode`.

R29. `app/(storefront)/help/page.tsx` reads the current vendor profile. Its Delivery Zones sentence
     reads:
     - `We currently deliver across <localityName> and surrounding local areas.` when
       `localityName` is non-empty;
     - `We deliver to the postcode areas this store serves.` when it is empty.

     In both cases it is followed by the existing eligibility sentence. The page contains no
     `Milton Keynes` literal.

## Guards, seed and documentation

R30. `tests/vendor-neutral-copy.test.ts`:
     - `FILES` also includes `lib/list-normalisation.ts`, `lib/search-synonym-proposals.ts`,
       `lib/net-content-suggester.ts` and `lib/delivery-area-form.ts`;
     - `FORBIDDEN` also includes `UK grocery`, `South Asian grocery`, `Milton Keynes`, `MK1-MK10`,
       `MK9 3QA` and `£5 off`.

     The test passes.

R31. `prisma/seed.ts` sets all seven R1 fields in both vendors' `config`.
     - Aheed has all six label settings `true`, and a `storeDescription` that names South Asian
       groceries and says shoppers use Hindi, Urdu and Punjabi names and transliterations.
     - SriMart has all six `false`, and a `storeDescription` that names consumer electronics and
       accessories.
     - Both descriptions are 200 characters or fewer.

R32. The `/staff/storefront` section of `docs/store-admin-guide/admin-tabs-guide.md` documents the
     R7 form. Each of these statements is present and traceable to a real control:
     - the six labels and what switching one off does (hidden on the product form, stored values
       kept, storefront unchanged);
     - HMC needs Halal;
     - the description is used by shopping-list matching, search-synonym suggestions and
       net-content suggestions;
     - the description is limited to 200 characters.

R33. In the "User-facing copy" section of `docs/developer-portal/app-conventions.md`, the bullet
     saying the grocery attributes and AI "UK grocery" framing are "tracked as `#905`, not a copy
     fix" is replaced. The new text states:
     - the label settings and the store description;
     - that a disabled label is stripped server-side in `saveProduct`;
     - that example values come from the vendor's own data (R24).

## Live proof

R34. Under `npm run preview` against the dev database, as a store admin:
     - (a) On the SriMart host, `/staff/products/new` shows none of Halal, Fresh, Organic,
       Vegetarian, Gluten free or the HMC section. On the Aheed host it shows all of them.
     - (b) On the Aheed host, switching Organic off at `/staff/storefront` and then saving, unchanged,
       a product whose `isOrganic` is `true` leaves `isOrganic` `true` in the database. That
       product's storefront page still shows its Organic badge.
     - (c) Saving the R7 form with HMC on and Halal off shows the R5(d) message and changes no
       stored value.
     - (d) Saving a 201-character description shows the R5(c) message.
     - (e) Every setting changed in (b) to (d) is restored afterwards.

R35. Under `npm run preview`:
     - signed in as the SriMart admin, `/staff/delivery-areas` on the SriMart host shows `RG`
       examples and no `MK`;
     - signed in as the Aheed admin, the same page on the Aheed host shows `MK` examples;
     - `/help` on the SriMart host contains `Reading` and not `Milton Keynes`.

## Carry-forward, KMS, gates

R36. `specs/roadmap.md` has a change-log row citing PR #910 and merge `556e273`. `npm run
     sdd:audit` prints no line containing both `PR #910` and `pending carry-forward`.

R37. `docs/model-handoff.md` no longer says `#729` is In Review or unpromoted. It states that `#729`
     was promoted via PR #910 (`556e273`), and its `updated:` date and `version` are bumped.

R38. `npm run kms:validate` exits 0 with no failing front-matter.
     - After `npm run kms:build-index`, `npm run kms:check-generated` exits 0.
     - `npm run kms:assemble:internal`, followed by `npx next build --webpack` in
       `kms/site-internal`, exits 0.

R39. `CHANGELOG.md` has a new entry on this branch citing `#905` and `#907` (Gate 4).

R40. The pull request body uses a closing keyword only for `#905` and `#907`. It mentions `#729`,
     `#911` and `#912` without a closing keyword.

R41. `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run`,
     run alone, exits 0 with every test file executed. CI's `quality` job on the PR is green.
