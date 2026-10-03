# #960, #961, #962 — Mobile browse density (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is a UI and layout change with one additive migration and one staff write path.

- **Unit:** the preset module, the profile fallback, the action's refusal.
- **Static guards:** the grid usage and the header structure. Both are file reads.
- **System:** emulated-viewport measurement under `npm run preview` (the layout claims cannot be
  proven any other way), and the staff control driven in a real browser.
- **Accessibility:** target sizes (R7–R10), and checking that the `banner` landmark still exists.

---

## Setup (once, before the System rows)

1. Run `npm ci`, then `npm run db:generate`.
2. Apply the slice's migration to the dev database: `npx prisma migrate deploy`, run against the
   `DIRECT_URL` in `.env`. This must be the dev project; diff against `secrets/*.vars` first
   (CLAUDE.md).
3. Kill any leftover `node`/`workerd` processes, then run `npm run preview` and wait until
   `http://localhost:8787` serves.
4. **Measuring command (`M`):**

   ```
   npx tsx scripts/verify-mobile-layout.ts --base <base> --path <path> --widths <list> [--add-first]
   ```

5. **Category paths:**
   - Aheed: `--base http://localhost:8787 --path categories/fruit-veg`.
   - SriMart: `--base http://srimart.localhost:8787 --path categories/sri-electronics`. If the
     seed has changed, take any top-level SriMart category with at least 6 product cards on its first
     page, and record the slug in the validation report.
   - **Write `--path` without its leading slash in Git Bash.** MSYS rewrites a bare `/categories/x`
     argument into `C:/Program Files/Git/categories/x`. The script refuses such a path with exit 2,
     but the slash-less form avoids it. PowerShell is unaffected.
   - `srimart.localhost` resolves inside Chrome but not necessarily for `curl` on Windows. For any
     non-browser request to SriMart, use `127.0.0.1:8787` with a `Host: srimart.localhost:8787`
     header.
6. **Cart state:** the Aheed guest cart must not contain the first card's product before R7 and R9.
   The script uses a fresh browser profile per run, so a run without `--add-first` starts with an
   empty cart.
7. **Staff sign-in for R17–R20:** the SriMart store admin is `demo-srimart-admin@example.com`. Its
   password is in `.env`/`secrets/staging.vars` as `DEMO_ACCOUNT_PASSWORD` (see
   `docs/developer-portal/env-setup.md`, "Demo accounts"). Confirm it with a live sign-in before
   relying on it.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `git diff origin/staging -- package.json package-lock.json` shows no added dependency. Run `M` once against Aheed with `--widths 390`. It exits 0 and prints one JSON object containing every key listed in R1. Read the script and confirm it prints measurements only, with no PASS/FAIL logic. |
| R2  | Unit | Read `components/layout/Header.tsx`'s returned JSX and confirm the three siblings in R2's order, with neither `div` nested in `<header>`. Then run `grep -o 'className="[^"]*\bsticky\b[^"]*"' components/layout/Header.tsx \| wc -l`; it prints `1`, and that match also contains `top-0`. |
| R3  | E2E | Run `M --widths 360,390` against Aheed and against SriMart. In each of the four objects: `headerTopAfterScroll` is within 0±1, `headerHeightAfterScroll` ≤ 128, `bannerBottomAfterScroll` ≤ 0, and `locationTopAtTop` ≥ `headerBottomAtTop` − 1. Any one value outside its bound fails the row. |
| R4  | E2E | Run `M --widths 768` against Aheed and SriMart. In each: `headerTopAfterScroll` is 0±1, `headerHeightAfterScroll` ≤ 80, and `locationTopAtTop` is `null`. |
| R5  | Unit | `grep -n 'aspect-9/5' components/layout/Header.tsx` matches the logo `<img>`. Its nearest enclosing `div` has a class list containing both `h-10` and `overflow-clip`; read the lines to confirm. |
| R6  | Unit | `grep -n -- '--spacing-tap: 2.75rem;' design-system/tokens/tokens.css` matches inside the `@theme` block. After `npm run build`, `grep -rl 'spacing-tap' .next/static/css` returns at least one file. |
| R7  | E2E | Run `M --widths 390` against Aheed, without `--add-first`. In `controls`: the first card's add control and its Quick View control each have `displayed: true`, `width` ≥ 44 and `height` ≥ 44. The entries named `Decrease quantity` and `Increase quantity` for that card have `displayed: false`. The entries named `/categories`, `/shop-your-list` and `/login` each have `width` ≥ 44 and `height` ≥ 44. Read `Header.tsx` and confirm the `/account` link uses the same `tap` sizing below `lg`. |
| R8  | E2E | Run `M --widths 390 --add-first` against Aheed. `firstCardStepperLabel` starts with `1 ` and ends with `in cart`. The stepper's two `controls` entries, named `Remove <product> from cart` (the decrease button at quantity 1) and `Increase quantity of <product>`, each have `width` ≥ 44 and `height` ≥ 44. |
| R9  | E2E | Run `M --widths 768` against Aheed, without `--add-first`. The first card's pre-add `Decrease quantity` and `Increase quantity` have `displayed: true`, `width` ≥ 44 and `height` ≥ 44, and its add control has `height` ≥ 44. |
| R10 | E2E | Run `M --widths 1280` against Aheed: the first card's add control `height` is 32±1. Then run `M --widths 1280 --add-first`: both stepper buttons have `height` 24±1. |
| R11 | Unit | `head -3 lib/product-grid-density.ts` shows no `"use server"`. `npx vitest run tests/product-grid-density.test.ts` passes. Read the test and confirm it asserts all three class strings character-for-character against `plan.md`'s table, plus the parse cases `COMPACT`, `STANDARD`, `SPACIOUS`, `""`, `"standard"` and `null`. |
| R12 | Unit | `npx vitest run tests/product-grid-usage.test.ts` passes. Independently, `grep -c 'grid-cols-' 'app/(storefront)/categories/[slug]/page.tsx' 'app/(storefront)/search/page.tsx' 'app/(storefront)/bundles/page.tsx'` prints `0` for all three, and `grep -rl 'sm:grid-cols-3 lg:grid-cols-4' app components --include=*.tsx` prints nothing. Read `components/product/ProductGrid.tsx` and confirm it supports `div`/`ul` and the `data-product-grid` attribute. |
| R13 | Integration | After `npm run build`, run `grep -rl -F '<selector>' .next/static/css` for each of the six selectors listed in R13, written exactly as listed there (each includes its backslash and opening brace, e.g. `.xl\:grid-cols-6{`). Each returns at least one file. |
| R14 | Integration | Run `git diff --name-only origin/staging -- prisma/migrations`; it lists exactly one new `migration.sql`. Read it: it contains `CREATE TYPE "ProductGridDensity"`, `ALTER TABLE "VendorConfig" ADD COLUMN "productGridDensity"` with `NOT NULL DEFAULT 'STANDARD'`, and no `DROP`. `grep -n 'ProductGridDensity' prisma/schema.prisma` shows the enum and the field with `@default(STANDARD)`. |
| R15 | Unit | Find the test asserting the no-config fallback: `grep -rn 'productGridDensity' tests/`. It passes under `npx vitest run <that file>`. Read `fetchVendorProfile` and confirm the column is in its `select`. |
| R16 | E2E | The migration gives every vendor `STANDARD`. If an earlier validation attempt changed SriMart, save **Standard** on its `/staff/storefront` first. Then run `M --widths 390,768,1100,1280` against Aheed and against SriMart. `gridColumns` is `2,2,4,4` for both. |
| R17 | E2E | In a browser at normal desktop width, sign in at `http://srimart.localhost:8787/login` as the SriMart store admin. Open `/staff/storefront`, choose **Spacious** under "Product grid layout", and save. Then run `M --widths 390,768,1100,1280` against SriMart: `gridColumns` is `1,2,2,4`. Run the same against Aheed: it is still `2,2,4,4`. |
| R18 | E2E | Same session: save **Compact** and run `M` against SriMart; it reports `2,2,4,6`. Save **Standard** and run it again; it reports `2,2,4,4`. Leave SriMart on Standard. |
| R19 | Unit | `npx vitest run tests/admin-only-authorization.test.ts` passes, and the file imports and exercises `updateProductGridDensity`. Read the action and confirm it does not read a vendor id from `formData`, returns before writing on a refusal or a parse error, and revalidates both paths. `grep -nE '^export (const\|let\|var\|function [^a]\|class)' features/admin/storefront.ts` prints nothing; every export is `export async function`. |
| R20 | E2E | In the R17 session, `/staff/storefront` shows the "Product grid layout" heading, three radios labelled Compact, Standard and Spacious each with a description, and the current value checked. After a save, a saved confirmation appears; a reload shows the saved value checked. Then, with the value on Spacious, re-save the **Product labels & store description** form unchanged and reload: Spacious is still checked. Restore Standard afterwards. |
| R21 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes, run on its own (CLAUDE.md: never beside a build). Read the three labels and descriptions in `lib/product-grid-density.ts`: none names a vendor, a product or a trade. |
| R22 | Acceptance | Read the new paragraph in `docs/store-admin-guide/admin-tabs-guide.md` under "Storefront — `/staff/storefront`". It names "Product grid layout" and Compact, Standard and Spacious. Each column count it states (phones, widest screens) matches `plan.md`'s table, and nothing in it describes a control R20 did not find. |
| R23 | Acceptance | `git diff origin/staging -- specs/design-system.md` shows the version bumped, `updated` changed, a `tap`-token / 44px-below-`lg` rule, and a `ProductGrid` rule with the preset table. `npm run kms:validate` reports `0` failing. |
| R24 | Acceptance | `git diff origin/staging -- CHANGELOG.md` shows an entry naming #960, #961 and #962. |
| R25 | Regression | Run `npm run lint`, `npm run typecheck` and `npm run format:check`; each exits 0. Run `npx vitest run` alone (no build running) and it exits 0 with no file reported as failed to start. `npm run build` exits 0. `npm run kms:assemble:internal`, then the Next build in `kms/site-internal`, both exit 0. CI on the PR (`quality / quality`, `quality / kms`, `docs-gates`) is green; CI, not local output, is ground truth. |
