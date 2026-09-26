# #729 — Vendor-neutral UI copy, slice 1 (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before you start

- **Two vendors matter here.** Run the live rows against **both** local hosts under
  `npm run preview`:
  - Aheed: `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/<path>`
  - SriMart: `curl -s -H "Host: srimart.localhost" http://127.0.0.1:8787/<path>`

  Several rows pass trivially against Aheed alone, because the old copy *was* Aheed's.
- Use `npm run preview`, never `npm run dev`. `next dev` cannot load `@prisma/client/wasm` and
  silently renders an error state (CLAUDE.md, Database).
- Rendered HTML escapes `&`, `'` and `"`. Grep for `Loyalty &amp; Rewards`, not
  `Loyalty & Rewards` (`docs/developer-portal/local-dev-playbook.md`, the grep-escaping entry).
- Run `npx vitest run` alone, never beside or straight after a build (CLAUDE.md, Windows shell).
- Exclude the generated `app/(admin)/staff/runbook/docs.ts` from every `grep`. It quotes spec
  prose, including this one.
- R20 needs a signed-in store admin under `npm run preview`. Drive the server action as
  `local-dev-playbook.md` describes, or through the browser extension if one is connected.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | For each of the seven files named in R1, `grep -n "export const metadata" <file>` prints nothing, and `grep -n "export async function generateMetadata" <file>` prints one line. Read each function: it calls `getCurrentVendorProfile()`, keeps the R1 text before the dash, and falls back to `"Aheed Food Centre"` only on a null profile. |
| R2  | E2E | Under `npm run preview`, for `/login` and `/register`: `curl -s -H "Host: srimart.localhost" http://127.0.0.1:8787/login \| grep -o "<title>[^<]*</title>"` prints a title containing `SriMart` and not `Aheed`. The same command with `-H "Host: localhost:8787"` prints a title containing `Aheed Food Centre`. |
| R3  | Unit | `grep -rn "Aheed Club" components/` prints nothing. Read `StorefrontChrome.tsx`, `RewardsLauncher.tsx` and `RewardsPanel.tsx`: `vendorName` is passed through, typed `string`, and not optional. The new `RewardsPanel` test in R24 renders `SriMart Club`. |
| R4  | Unit | Read `ReferralCard.tsx`: `storeName: string` is a required prop, `buildShareLinks(displayUrl, storeName)` is called, the share `title` is `` `${storeName} referral` ``, and `grep -n -i "grocer" components/rewards/ReferralCard.tsx` prints nothing. `grep -n "storeName=" components/rewards/RewardsPanel.tsx "app/(storefront)/account/loyalty/page.tsx"` prints one line in each file. |
| R5  | Unit | `grep -n 'storeName = ' lib/referrals.ts` prints nothing. `tests/referrals.test.ts` asserts that each of the four decoded links contains the passed store name and does not match `/grocer/i`. `npx vitest run tests/referrals.test.ts` passes. |
| R6  | E2E | `curl -s -H "Host: srimart.localhost" http://127.0.0.1:8787/orders/lookup \| grep -c "Delivery progress"` prints `1` or more. `grep -rn "Delivery Pipeline" app/ components/` prints nothing. |
| R7  | Unit | `grep -n "We automatically adjust them to guarantee they are" components/staff/StorefrontConfigForm.tsx` prints one line. `grep -n "Aheed automatically" components/staff/StorefrontConfigForm.tsx` prints nothing. |
| R8  | Unit | `grep -n "A multi-vendor online store with local delivery." app/layout.tsx` prints one line. `grep -n '"Aheed Online Store"' app/layout.tsx` prints one line. `git diff origin/staging -- app/layout.tsx` shows only the description line changed. |
| R9  | Unit | `grep -n '^"use server"' lib/shopping-list-examples.ts` prints nothing. The new unit test covers: (a) trim, empty-drop, case-insensitive dedupe and the cap of 3, including 5 names in with only 3 used; (b) 1, 2 and 3 names each produce the exact placeholder and `exampleName`; (c) `[]` produces exactly `"2x first item\nsecond item\nthird item x 3"` and `null`. `npx vitest run tests/shopping-list-examples.test.ts` passes. |
| R10 | Unit | `grep -n -E "PLACEHOLDER\|chicken\|basmati\|milk\|apples" components/cart/ShopYourList.tsx` prints nothing. Read the hint JSX: both R10 branches are present, with `MAX_LIST_LINES` interpolated. |
| R11 | E2E | Read `app/(storefront)/shop-your-list/page.tsx`: it makes the R11 `list(...)` call and passes `exampleNames`. `git diff --name-only origin/staging -- lib/repositories/ prisma/` prints nothing. Under `npm run preview`, `curl -s -H "Host: srimart.localhost" http://127.0.0.1:8787/shop-your-list \| grep -o 'placeholder="[^"]*"'` shows a textarea placeholder starting `2x ` followed by a real SriMart product name, not `chicken`. The same command on the Aheed host shows an Aheed product name. |
| R12 | Unit | `grep -n "That search is too short. Try at least two characters.</" "app/(storefront)/search/page.tsx"` prints one line (whitespace between the text and the tag may differ after formatting; confirm by reading the line). `grep -n "atta" "app/(storefront)/search/page.tsx"` prints nothing. |
| R13 | Unit | Each new string in R13 is found by `grep -n` in its file, and `grep -rn -i "grocer" "app/(storefront)/account/" components/rewards/ "app/(storefront)/orders/lookup/page.tsx"` prints nothing. |
| R14 | Unit | Read `app/(storefront)/terms/page.tsx` §4: the sentence matches R14 (it may wrap across lines). `git diff origin/staging -- "app/(storefront)/terms/page.tsx"` touches only that sentence's lines. |
| R15 | Unit | Read `app/(storefront)/privacy/page.tsx` §3: the sentence matches R15 (it may wrap across lines). `git diff origin/staging -- "app/(storefront)/privacy/page.tsx"` touches only that sentence's lines. |
| R16 | Unit | For each row of R16's table, `grep -n` finds the new placeholder in that file and the old value no longer appears in it. |
| R17 | Unit | Read `StorefrontConfigForm.tsx`: an `<input id="searchPlaceholder" name="searchPlaceholder">` sits inside the `<form action={saveBranding}>` element (not the delivery or social forms), labelled "Search box text", with `defaultValue={initialConfig.searchPlaceholder \|\| ""}` and the R17 placeholder. |
| R18 | Unit | `npx vitest run tests/brand-colour-validation.test.ts` passes, with cases for `"  Find it  "` → `"Find it"`, an 80-character value accepted, an 81-character value refused with the exact R18 error, and `""`/`"   "` → `null`. |
| R19 | Unit | Read `lib/repositories/vendor.ts`: `searchPlaceholder?: string \| null` is in `VendorStorefrontConfigInput`, and `searchPlaceholder: data.searchPlaceholder` is inside `updateVendorStorefrontConfig`'s `vendorConfig.update` data. Read `features/admin/storefront.ts`: the delivery-rules and social-links actions build their input objects without a `searchPlaceholder` key. |
| R20 | E2E | Under `npm run preview`, on the Aheed host (`localhost:8787`), signed in as the demo store admin:<br>1. Note the current value on `/staff/storefront`.<br>2. Save the branding form with Search box text `Find something good`. `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/ \| grep -c 'placeholder="Find something good"'` prints `1` or more.<br>3. Save the delivery-rules form unchanged. Re-run the curl; it still prints `1` or more.<br>4. Save the branding form with the field empty. `grep -c 'placeholder="Search products…"'` on the same page prints `1` or more.<br>5. Restore the value noted in step 1. |
| R21 | Unit | Read `docs/store-admin-guide/admin-tabs-guide.md`'s `/staff/storefront` section: both sentences from R21 are present. |
| R22 | Unit | `npx vitest run tests/category-icon.test.ts` passes, asserting `categoryIcon("chargers") === Tag` and `categoryIcon("fruit-veg") === Apple`. `grep -n "ShoppingBasket" components/product/category-icon.ts` prints nothing. |
| R23 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. Then insert `placeholder="halal lamb"` into `components/staff/CategoryForm.tsx`, re-run, and confirm it **fails**, naming that file. Revert with `git checkout -- components/staff/CategoryForm.tsx` and confirm it passes again. |
| R24 | Unit | `npx vitest run tests/category-icon.test.ts tests/rewards-components.test.tsx tests/referrals.test.ts tests/shopping-list-examples.test.ts tests/brand-colour-validation.test.ts` passes. `tests/rewards-components.test.tsx` renders `RewardsPanel` open with `vendorName="SriMart"` and finds `SriMart Club`. |
| R25 | Unit | `grep -n "PR #904" specs/roadmap.md` prints the new change-log row, citing `a156039`. `npm run sdd:audit` prints no line containing both `PR #904` and `pending carry-forward`. |
| R26 | Unit | `git diff --name-only origin/staging...HEAD -- prisma/` prints nothing. |
| R27 | Unit | `git diff origin/staging...HEAD -- CHANGELOG.md` shows a new entry citing `#729`. |
| R28 | Regression | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0, and `npx vitest run` (run alone) exits 0, with its summary showing every test file executed. CI's `quality` job on the PR is the ground truth. |
