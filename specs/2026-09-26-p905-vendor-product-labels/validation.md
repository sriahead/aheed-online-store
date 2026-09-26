# #905 — Per-vendor product labels, store description for AI, delivery-area examples (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

1. **Unit.** The pure modules carry the logic, and each has its own test file:
   - `catalogue-settings-form`;
   - `product-label-settings`;
   - `store-description` plus the three prompt builders;
   - `delivery-area-examples`;
   - `delivery-area-form`;
   - `referrals`.
2. **Integration.** The migration against the real dev database (R2–R4), and the save path writing
   through Prisma (R34(b)).
3. **E2E.** `npm run preview` on both vendor hosts (R34, R35).
4. **Regression.** `vendor-neutral-copy` (R30), the full suite, and CI.
5. **Security.** Label stripping happens server-side, from the vendor's own settings (R11, R12(b)).
   The store description is inserted into prompts only as a quoted, one-line, length-capped value
   (R15, R20(c)).

## Before you start

- This slice carries a **migration**. Apply it to dev before any live row:
  `npx prisma migrate deploy` with `DIRECT_URL` from `.env`.
  - First diff `.env` and `.dev.vars` against `secrets/staging.vars` to confirm dev is the
    database you think it is (CLAUDE.md, Config & secrets).
  - Never accept a `prisma migrate dev` reset prompt (`#895`).
- DB-touching rows need `npm run preview`, never `npm run dev`.
- The SriMart host needs its port: `srimart.localhost:8787` (`local-dev-playbook.md`). Without
  the port it silently falls through to Aheed.
- Sign-in details for the demo accounts are in `docs/developer-portal/local-dev-playbook.md`.
  - Aheed's store admin is `demo-store-admin@example.com`.
  - SriMart's is `demo-srimart-admin@example.com`.
  - Server actions can be driven with `curl` as that playbook describes, or through the browser
    extension.
- Run `npx vitest run` alone, never beside or straight after a build.
- Exclude the generated `app/(admin)/staff/runbook/docs.ts` from every `grep`; it quotes spec prose.
- **Database checks: use a throwaway script, and don't commit it.** Rows marked "query" need a
  `tsx` script in the session scratchpad. It must build `@prisma/client` (bare specifier, Node)
  with `@prisma/adapter-neon` from `.env`'s `DIRECT_URL`, and print the rows the step names.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `model VendorConfig` in `prisma/schema.prisma`: the seven fields exist with the exact types and defaults in R1. `git diff origin/staging...HEAD -- prisma/schema.prisma` shows added lines only inside `model VendorConfig`. |
| R2  | Integration | `git diff --name-only origin/staging...HEAD -- prisma/migrations/` lists exactly one `migration.sql`. Read it: only `ALTER TABLE "VendorConfig" ADD COLUMN` (×7) and `UPDATE "VendorConfig"` statements. `grep -n -i -E "drop\|create index\|alter index" <that file>` prints nothing. |
| R3  | Unit | Read the `UPDATE` statements: each boolean is set from `EXISTS (SELECT 1 FROM "Product" p WHERE p."vendorId" = "VendorConfig"."vendorId" AND p."<field>" = true)`, with no `isActive` filter. `showHmcCertification` also requires the vendor's halal result. `grep -n -i -E "aheed\|srimart\|slug" <that file>` prints nothing. |
| R4  | Integration | After `npx prisma migrate deploy` on dev, query: for every `VendorConfig` row, recompute R3 from `Product` and compare with the stored six booleans. Zero mismatches. SriMart's (`slug = 'srimart'`) six are all `false`. |
| R5  | Unit | `grep -n '"use server"' lib/catalogue-settings-form.ts` prints nothing. `npx vitest run tests/catalogue-settings-form.test.ts` passes, with a case for each of R5(a)–(d): `" a\n\n b "` becomes `"a b"`; `"   "` becomes `null`; exactly 200 characters is accepted; 201 characters is refused with the exact message; HMC on with Halal off is refused with the exact message and field. |
| R6  | Unit | Read `features/admin/storefront.ts`: `updateCatalogueSettings` matches R6, and every export is an `async function`. Read the other three actions: none puts a key starting `show` or `storeDescription` in the object passed to `updateVendorStorefrontConfig`. Read `lib/repositories/vendor.ts`: the seven optional keys are in `VendorStorefrontConfigInput` and in the `vendorConfig.update` data. |
| R7  | Unit | Read `StorefrontConfigForm.tsx`: a fourth `<form>` bound to `updateCatalogueSettings`, with the heading, six named checkboxes, the `storeDescription` field (`maxLength={200}`, label `What this store sells`), the three help statements, and field-error rendering. |
| R8  | Unit | Read `lib/repositories/vendor.ts`: the seven fields are in `VendorProfile`, in `fetchVendorProfile`'s `config.select`, and mapped with `?? false` / `?? null`. |
| R9  | Unit | `npx vitest run tests/product-label-settings.test.ts` passes (covered with R12). Read `lib/product-label-settings.ts`: no `"use server"`, no I/O imports. |
| R10 | Unit | Read `ProductWriteInput`: exactly the eight governed fields gained `\| undefined`. Read both repository functions: those fields are passed directly (`isOrganic: input.isOrganic`), with no `?? false` coercion. `npm run typecheck` exits 0. |
| R11 | Unit | Read `saveProduct`: it resolves the settings via `getCurrentVendorProfile()` (or the vendor-service equivalent) and `labelSettingsFromProfile`, reads nothing about labels from `form` except the fields `parseProductForm` already reads, and calls `applyProductLabelSettings` before both repository calls. |
| R12 | Unit | `npx vitest run tests/product-label-settings.test.ts` passes, with one named case for each of R12(a)–(d). |
| R13 | Unit | A render test (`tests/product-form-labels.test.tsx`, or an existing ProductForm test file) passes. It asserts: (1) with all settings off, no `isHalal`/`isFresh`/`isOrganic`/`isVegetarian`/`isGlutenFree`/`isHmcCertified` input and the heading `Visibility`; (2) with all on, all six inputs are present; (3) with `halal: true, hmc: false`, no `isHmcCertified`. `isFeatured` and `isActive` are present in all three. |
| R14 | Unit | `grep -n "labels={labelSettingsFromProfile" "app/(admin)/staff/products/new/page.tsx" "app/(admin)/staff/products/[id]/page.tsx"` prints one line per file. |
| R15 | Unit | Covered by R20's test file. Read `lib/store-description.ts`: no `"use server"`, no imports beyond pure helpers. |
| R16 | Unit | Read `buildNormalisationPrompt` and `normaliseList`: the second parameter is required (no `?` and no default), and the first line is the R16 string. `git diff origin/staging...HEAD -- lib/list-normalisation.ts` shows the prompt body below the first line unchanged apart from the inserted description line. |
| R17 | Unit | Read `lib/search-synonym-proposals.ts`: `buildSynonymPrompt` is exported, and `proposeSynonyms`'s third parameter is required. The first line is the R17 string. |
| R18 | Unit | Read `lib/net-content-suggester.ts`: `storeDescription` is required on both input types, and the first line is the R18 string. `git diff origin/staging...HEAD -- lib/net-content-suggester.ts` shows no rule line (lines starting `"- `) changed. |
| R19 | Unit | `npm run typecheck` exits 0; the required parameters make a missing argument a type error. Read each of the five callers named in R19: the value passed is the vendor's real description, not a literal (the literal `null` in `scripts/verify-list-normalisation.ts` only). |
| R20 | Unit | `npx vitest run tests/store-description-prompts.test.ts` passes, with named cases for R20(a)–(d) across all three builders. |
| R21 | Unit | Read `lib/referrals.ts`: the signature is as in R21, and the three messages use `formatPrice(discountOffPence)`. The vendor-neutral test (R30) proves no `£5 off` literal remains. |
| R22 | Unit | `grep -n "discountOffPence = 500\|?? 500" components/rewards/ReferralCard.tsx components/rewards/RewardsPanel.tsx` prints nothing. `grep -n "REFERRAL_DISCOUNT_PENCE" components/rewards/ReferralCard.tsx components/rewards/RewardsPanel.tsx` prints at least one line per file. Read `ReferralCard`: `buildShareLinks(displayUrl, storeName, discountOffPence)`. |
| R23 | Unit | `npx vitest run tests/referrals.test.ts` passes, including the 750-pence case asserting `£7.50` present and `£5` absent in all three decoded texts. |
| R23a | Unit | `grep -n '"REF-AHEED"' lib/referrals.ts` prints nothing. `npx vitest run tests/referrals.test.ts` passes, including both R23a assertions. |
| R24 | Unit | `npx vitest run tests/delivery-area-examples.test.ts` passes, with the five named cases. |
| R25 | E2E | Covered live by R35. Read the page: the example comes from R24 using `VendorLocation` and the listed areas, and both intro variants are present. |
| R26 | Unit | `grep -n "MK" components/staff/DeliveryAreaManager.tsx` prints nothing. Read `AddDeliveryAreaForm`: the prop is required and typed `DeliveryAreaExamples \| null`, and both placeholder and help-text variants match R26. |
| R27 | Unit | `npx vitest run tests/delivery-area-form.test.ts` passes (or the file holding its existing tests, found with `grep -rln parsePrefixListInput tests/`). It includes the `RG1-RG0` → `RG1-RG10` case and the `null` case asserting no `e.g.` and no `like`. Read `features/admin/delivery-areas.ts`: `exampleArea` is resolved as R25 describes, before parsing. |
| R28 | Unit | `grep -n 'placeholder="Town or city"\|placeholder="Full postcode"' components/staff/StorefrontConfigForm.tsx` prints two lines. |
| R29 | E2E | Covered live by R35. Read `app/(storefront)/help/page.tsx`: both sentence variants, and no `Milton Keynes` literal. |
| R30 | Regression | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. Then add `const x = "Milton Keynes";` to `lib/delivery-area-form.ts` and re-run: it **fails**, naming that file. Revert with `git checkout -- lib/delivery-area-form.ts`, or undo the one line if the file has uncommitted slice work, and confirm it passes. |
| R31 | Unit | Read both vendors' `config` in `prisma/seed.ts`: seven fields set as R31 says. Measure each description's length (for example `node -e "console.log('<text>'.length)"`): 200 or fewer. |
| R32 | Unit | Read the `/staff/storefront` section of `docs/store-admin-guide/admin-tabs-guide.md`: the four statements in R32 are present. Each one matches a control or behaviour confirmed in R7 and R34. |
| R33 | Unit | Read `docs/developer-portal/app-conventions.md` "User-facing copy": the "tracked as `#905`" bullet is gone, and the replacement states the three things in R33. |
| R34 | E2E | Under `npm run preview`, following R34 steps (a)–(e) exactly. For (b): before changing anything, query a product on the Aheed vendor with `isOrganic = true` and note its id and slug. After saving, re-query: `isOrganic` is still `true`. `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/products/<slug>` contains the Organic badge text. For (e): re-open `/staff/storefront` and confirm the settings match what was noted before (a). |
| R35 | E2E | Under `npm run preview`: (1) signed in as the SriMart admin, fetch `/staff/delivery-areas` on the SriMart host and save it to a file. The intro and add form show `RG`, `RG1`, `RG1-RG10`, and no `MK` appears in rendered text (read the saved HTML, ignoring script payloads). (2) The same as the Aheed admin on the Aheed host shows `MK`, `MK1`, `MK1-MK10`. (3) `curl -s -H "Host: srimart.localhost:8787" http://127.0.0.1:8787/help` contains `Reading` and does not contain `Milton Keynes`. |
| R36 | Unit | `grep -n "PR #910" specs/roadmap.md` prints the new row citing `556e273`. `npm run sdd:audit` prints no line containing both `PR #910` and `pending carry-forward`. |
| R37 | Unit | Read `docs/model-handoff.md`: `#729` is described as promoted via PR #910 (`556e273`), and the front-matter `updated`/`version` changed (`git diff origin/staging...HEAD -- docs/model-handoff.md`). |
| R38 | Unit | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. `npm run kms:build-index`, then `npm run kms:check-generated`, exits 0. `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack`, exits 0. Read the real exit status; don't pipe through `tail`. |
| R39 | Unit | `git diff origin/staging...HEAD -- CHANGELOG.md` shows a new entry citing `#905` and `#907`. |
| R40 | Unit | At Ship: `gh pr view <n> --json body -q .body` contains a closing keyword before `#905` and `#907`, and none before `#729`, `#911` or `#912`. |
| R41 | Regression | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run` (alone) exits 0, with its summary showing every test file executed. CI's `quality` job on the PR is the ground truth. |
