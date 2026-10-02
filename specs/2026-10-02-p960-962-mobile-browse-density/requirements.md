# #960, #961, #962 — Mobile browse density (requirements / acceptance criteria)

These close **#960** (the sticky header is a third of a phone screen), **#961** (primary shopping
controls are 24–32px) and **#962** (the grid's odd 3-column step, plus per-vendor density). They
come from the seventh Discover pass (`docs/research/discovery-log.md`, 2026-10-02) and were
approved at `/propose` on 2026-10-02, with the owner choosing vendor presets for #962.

In one line: only the logo, nav and search stays sticky; the named controls are at least 44px
below `lg`; and every product listing renders through one `ProductGrid` whose columns come from a
per-vendor `ProductGridDensity` preset. The reasoning is in `plan.md`. Read its preset table and its
section 4 (the measuring script) before validating.

**Definitions used below:**

- **Viewport W×H** means a headless-Chrome emulated viewport (`mobile: true`) as set by
  `scripts/verify-mobile-layout.ts`.
- **Below `sm`** means under 640px wide, **below `lg`** under 1024px, and **`xl`** 1280px and up.
- **Category page** means `/categories/<slug>` for a top-level category of that vendor that renders
  at least 6 product cards on its first page (R18's six columns need six cards). In the seeded dev
  database that is `/categories/fruit-veg` for Aheed (12 cards) and `/categories/sri-electronics`
  for SriMart (6 cards). _Amended at Build: this read "at least 3", which would let a validator pick
  SriMart's 5-card `sri-home` and fail R18 for want of products, not for a defect._
- **Aheed** is `http://localhost:8787` and **SriMart** is `http://srimart.localhost:8787` (port
  included; see `docs/developer-portal/local-dev-playbook.md`), both under `npm run preview`.

## Measuring instrument

R1. `scripts/verify-mobile-layout.ts` exists. It runs with `npx tsx` and adds no new package to
    `package.json`.
    - **Inputs:** `--base <url>`, `--path <path>`, `--widths <comma list>` (height fixed at 844),
      and an optional `--add-first`.
    - **Browser:** it launches the locally installed Chrome headless (path from `CHROME_PATH`, or
      the default Windows install path) and drives it over the DevTools protocol.
    - **`--add-first`:** clicks the first product card's Add button, waits for the action to
      settle, and reloads before measuring.
    - **Output:** one JSON object per width on stdout, with these keys:
      - `viewportWidth`
      - `headerTopAfterScroll` and `headerHeightAfterScroll`: the `header` element's rect after
        `scrollTo(0, 600)`.
      - `bannerBottomAfterScroll`: the `[data-header-banner]` rect bottom after the same scroll.
      - `headerBottomAtTop` and `locationTopAtTop`: at scroll 0. `locationTopAtTop` is `null` when
        no `[data-header-location]` element is displayed.
      - `gridColumns`: the number of distinct rounded `left` values among the
        `[data-product-grid]` children whose `top` equals the first child's `top`.
      - `controls`: an array of `{ name, width, height, displayed }`. It covers every `button`
        inside the first `[data-product-grid]` child, named by `aria-label`, else trimmed text.
        That includes the mobile Quick View button and the pre-add or in-cart quantity buttons.
        It also covers every link inside the header's `nav`, named by its `href` (`/categories`,
        `/shop-your-list`, `/login` or `/account`). `displayed` is false when the element's
        computed `display` is `none` or its rect has zero width.
      - `firstCardStepperLabel`: the `aria-label` of the in-cart stepper's quantity readout in the
        first card (the element whose label ends `in cart`), or `null` when there is none.
    - **Exit code:** 0 when every page loaded. It prints no PASS/FAIL verdicts.

## Header split (#960)

R2. `components/layout/Header.tsx` renders three sibling elements in this order:
    1. a banner `<div data-header-banner>` holding the trust bar;
    2. one `<header>` element whose class list contains `sticky` and `top-0`, holding the
       logo/nav row and the below-`sm` search form;
    3. a below-`sm` `<div data-header-location>` holding `LocationControl`. It is not rendered
       when `isPortal` is true.

    The class token `sticky` appears in exactly one `className` in the file, the `<header>`'s.
    Neither the banner nor the location `div` is a descendant of the `<header>`.
R3. On the Aheed category page and on the SriMart category page, at viewports 360×844 and 390×844,
    `scripts/verify-mobile-layout.ts` reports all of the following:
    - `headerTopAfterScroll` equal to 0 (±1);
    - `headerHeightAfterScroll` ≤ 128;
    - `bannerBottomAfterScroll` ≤ 0;
    - `locationTopAtTop` ≥ `headerBottomAtTop` − 1 (the location row sits below the sticky
      header).

    The baseline before this slice was a 234px sticky header (`plan.md` section 4).
R4. On the same two pages at viewport 768×844, `headerTopAfterScroll` is 0 (±1),
    `headerHeightAfterScroll` ≤ 80, and `locationTopAtTop` is `null`. From `sm`, `LocationControl`
    and search sit inside the sticky row.
R5. `components/layout/Header.tsx` still renders the logo `<img>` with the class `aspect-9/5`
    inside a container whose class list contains `h-10` and `overflow-clip`. This is #329's
    reserved-box fix.

## Touch targets (#961)

R6. `design-system/tokens/tokens.css`'s `@theme` block declares `--spacing-tap: 2.75rem;`. The
    built stylesheet from `npm run build` contains at least one rule using
    `calc(var(--spacing-tap)` or `var(--spacing-tap)`.
R7. On the Aheed category page at viewport 390×844, with no item of the first card's product in
    the cart, the first card's Add button and Quick View button each report `displayed: true` and
    `width` ≥ 44 and `height` ≥ 44.
    - The card's pre-add "Decrease quantity" and "Increase quantity" buttons report
      `displayed: false`.
    - The header links `/categories`, `/shop-your-list` and `/login` (signed out) each report
      `width` ≥ 44 and `height` ≥ 44.
    - The `/account` link (signed in) gets the same treatment in code; R7 does not measure it,
      because the script runs signed out.
R8. On the same page at viewport 390×844 with `--add-first`, `firstCardStepperLabel` starts with
    `1 ` and ends with `in cart`. The first card's stepper decrease button (named `Remove <product> from cart` at quantity 1,
    `Decrease quantity of <product>` above it) and its button named `Increase quantity of <product>`
    each report `width` ≥ 44 and `height` ≥ 44. _Amended at Build: this named only the
    `Decrease quantity of` form, which the stepper never uses at quantity 1._
R9. On the same page at viewport 768×844 with no item of that product in the cart:
    - the first card's pre-add "Decrease quantity" and "Increase quantity" buttons report
      `displayed: true`, with `width` ≥ 44 and `height` ≥ 44;
    - its Add button reports `height` ≥ 44.
R10. On the same page at viewport 1280×844, the first card's Add button reports `height` equal to
    32 (±1), and the in-cart stepper's buttons (measured with `--add-first`) report `height` equal
    to 24 (±1). Desktop sizes are unchanged.

## Shared grid and density presets (#962)

R11. `lib/product-grid-density.ts` exists and has no `"use server"` directive. It exports:
    - the presets `COMPACT`, `STANDARD`, `SPACIOUS`;
    - a class-string lookup returning exactly the strings in `plan.md`'s preset table;
    - a label and a description for each preset;
    - `parseProductGridDensity`, which returns the preset for each of the three exact enum names
      and an error result for any other input, including `""`, `"standard"` and `null`.

    `tests/product-grid-density.test.ts` asserts each of those values and passes.
R12. `components/product/ProductGrid.tsx` exists and renders a `div` (default) or a `ul`. Its
    `className` is the lookup's class string for the given density, and it carries the
    `data-product-grid` attribute.
    - `app/(storefront)/categories/[slug]/page.tsx`, `app/(storefront)/search/page.tsx` and
      `app/(storefront)/bundles/page.tsx` each render their product (or bundle) cards through
      `ProductGrid`, and none of the three contains the substring `grid-cols-`.
    - No `.tsx` file under `app/` or `components/` contains the substring
      `sm:grid-cols-3 lg:grid-cols-4`.
    - A test (`tests/product-grid-usage.test.ts`) asserts all three facts by reading the files and
      passes.
R13. The built stylesheet from `npm run build` contains a rule for every column class in the
    preset table: `.grid-cols-1{`, `.grid-cols-2{`, `.sm\:grid-cols-2{`, `.lg\:grid-cols-4{`,
    `.xl\:grid-cols-4{` and `.xl\:grid-cols-6{`, matched with the opening brace so `grid-cols-1`
    cannot match `grid-cols-12`. This proves Tailwind found the literal strings in `lib/`.
R14. `prisma/schema.prisma` declares `enum ProductGridDensity { COMPACT STANDARD SPACIOUS }` and
    `VendorConfig.productGridDensity ProductGridDensity @default(STANDARD)`.
    - Exactly one new migration directory exists under `prisma/migrations/`. Its `migration.sql`
      creates the type and adds the column with default `'STANDARD'` and `NOT NULL`.
    - It contains no `DROP` statement of any kind; in particular it does not drop the hand-authored
      `pg_trgm` indexes.
R15. `VendorProfile` (`lib/repositories/vendor.ts`) has a `productGridDensity` field.
    - `fetchVendorProfile` selects it from `VendorConfig`.
    - It resolves to `STANDARD` when the vendor has no config row.
    - A unit test asserts that fallback and passes.
R16. With both vendors at the default after the migration, the category page at viewports 390×844,
    768×844, 1100×844 and 1280×844 reports `gridColumns` of 2, 2, 4 and 4 respectively, on both
    Aheed and SriMart.
R17. After SriMart's store admin saves **Spacious** through `/staff/storefront`, SriMart's category
    page reports `gridColumns` of 1, 2, 2 and 4 at 390, 768, 1100 and 1280. Aheed's category page
    still reports R16's values, which proves vendor isolation.
R18. After SriMart's store admin saves **Compact**, SriMart's category page reports `gridColumns`
    of 2, 2, 4 and 6 at 390, 768, 1100 and 1280. After saving **Standard** again, it reports R16's
    values.

## Staff control and guide

R19. `features/admin/storefront.ts` exports an async `updateProductGridDensity(prevState, formData)`.
    - It calls `requireVendorRole("ADMIN")` and on refusal returns an error state without writing.
    - It takes the vendor id only from that call, never from `formData`.
    - It parses `formData.get("productGridDensity")` with `parseProductGridDensity`, and on a parse
      error returns an error state without writing.
    - On success it writes only `productGridDensity` through `updateVendorStorefrontConfig`, and
      revalidates `/staff/storefront` and `/` (`"layout"`).
    - The file still exports only async functions, and no constant or form-state value is added to
      it.
    - `tests/admin-only-authorization.test.ts` includes this action in its refusal cases and passes.
R20. `/staff/storefront` renders a section headed "Product grid layout" containing one form.
    - The form has a radio group named `productGridDensity` with three options labelled "Compact",
      "Standard" and "Spacious". Each shows its description from `lib/product-grid-density.ts`.
    - The vendor's current value is pre-selected.
    - Submitting a different option shows a saved confirmation, and reloading the page shows the
      new option selected.
    - Submitting the other storefront forms on the page (branding, delivery rules, social links,
      product labels) leaves `productGridDensity` unchanged.
R21. No preset label or description, and no new staff copy, names a vendor, a product, or a trade.
    `tests/vendor-neutral-copy.test.ts` passes.
R22. `docs/store-admin-guide/admin-tabs-guide.md`'s Storefront section has a paragraph naming the
    "Product grid layout" section and its three options by their on-screen labels, with each
    option's columns on phones and on the widest screens matching `plan.md`'s table. Every claim
    in it traces to R20's control or R16–R18's behaviour.

## Persistent documentation

R23. `specs/design-system.md` (version bumped, `updated` set to the build date) records:
    - the `tap` spacing token and the rule that the controls listed in R7–R9 are at least 44×44
      below `lg`;
    - the rule that product listings render only through `ProductGrid`, with the preset table and
      the even-column rule (multi-column steps are even; four columns never start before `lg`).

    `npm run kms:validate` reports 0 failing.

## Gates

R24. `CHANGELOG.md` has an entry for this slice referencing #960, #961 and #962 (Gate 4).
R25. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` (run on its own)
    and `npm run build` all exit 0. `npm run kms:assemble:internal` followed by a real Next build in
    `kms/site-internal` succeeds.
