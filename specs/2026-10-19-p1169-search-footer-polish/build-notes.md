# Search selector, search pills, footer contact icons, payment logos and Quick Shop examples (build notes)

Spec commit `20fea41`; build commit `cc89788`, on `feature/p1169-search-footer-polish` (cut from
`origin/staging` at `f2281b7`). Closes `#1169`.

## What changed and why

- **A. Header search selector**
  - `components/layout/DepartmentSearchBar.tsx`:
    - `ALL_DEPARTMENTS_LABEL = "All"`.
    - `SearchDepartment` gained `isSubcategory?: boolean`. A subcategory's option text is
      `SUBCATEGORY_INDENT` (`"  "`, written as an escape, not raw characters) plus its
      name.
    - The URL-selection comment now says any listed slug is selected. The code was already
      "selected if in the list", so passing subcategories made R4 work with no logic change.
  - `components/layout/search-departments.ts` (new): `toSearchDepartments(tree)` flattens
    `listTree()` into departments, each followed by its subcategories.
  - `components/layout/Header.tsx` calls `toSearchDepartments(await getCategoryRepository().listTree())`.
    The portal still skips the read.
  - Tests:
    - `tests/department-search-bar.test.tsx`: the label became "All"; new cases for the
      accessible name (R1), indented subcategories (R2) and selecting a subcategory or a
      department from the URL (R4).
    - `tests/search-departments.test.ts` (new): includes a child listed before its parent, and an
      orphan.
    - `tests/header-shopping-list.test.tsx`: the mock moved from `listTopLevel` to `listTree`,
      with one subcategory (R3).
- **B. Search pills**
  - `components/product/SubcategoryLinks.tsx` gained an optional `hrefFor` that defaults to
    `/categories/<slug>`. The category page passes nothing.
  - `app/(storefront)/search/page.tsx` renders `SubcategoryLinks` after the heading area and before
    `FilterChips`, only when `selectedCategory` resolved:
    - `tabs` is `parent?.children ?? children`;
    - `parentSlug` is `parent?.slug ?? slug`;
    - `activeSlug` is the selected slug;
    - `hrefFor` is `(slug) => categoryFilterHref(params, slug)`.
  - Tests: `tests/subcategory-links.test.tsx` (R5, an `hrefFor` case) and `tests/search-href.test.ts`
    (R8: `q` and `inStock` kept, one `category`, and `cursor` dropped even when present in the
    input).
- **C. Footer** (`components/layout/StorefrontFooter.tsx`)
  - `FooterContactChannels` moved to the end of "Visit & contact us".
  - `hasAddressDetails` (location, phone or email) gates the `<address>`, and
    `showContact = hasAddressDetails || channels.length > 0` gates the column.
  - The file's header comment now states the new column rule.
  - Tests: `tests/storefront-footer.test.tsx` (R10, R11).
- **D. Payment logos**
  - `public/payment-methods/{visa,mastercard,amex,apple-pay,google-pay}.svg` were regenerated from
    **Simple Icons 16.35.0**: slugs `visa`, `mastercard`, `americanexpress`, `applepay`, `googlepay`.
    Brand colours from Simple Icons' data are `#1A1F71`, `#EB001B`, `#2E77BC`, `#000000` and
    `#4285F4`.
  - Each file is the 48x30 white tile with one `<path>` scaled from 24x24 to 22x22 and centred
    (`translate(13 4) scale(0.9166667)`). Each carries a comment naming the slug, CC0 and
    "official artwork may replace this file".
  - The generator ran from the scratchpad and is not committed. It accepted a downloaded file
    only if it had `viewBox="0 0 24 24"` and exactly one `<path>` whose `d` contained only
    path-command characters, so nothing else from the download reached the repo.
  - Test: `tests/payment-badge-files.test.ts` (R12).
- **E. Quick Shop** (`components/cart/ShopYourList.tsx`)
  - With an example: "For example: **2 N** or **N x2** (up to 100 items, one per line)".
  - Without one: "For more than one, put 2 before the item or x2 after it (up to 100 items, one
    per line)".
  - Tests:
    - `tests/quick-shop-copy.test.tsx` covers R15 (both branches, and the two bold spans) and R16
      (the test named for R16: `parseListLine` on `2 Apple Juice 1L` / `Apple Juice 1L x2`, and on
      `Desk Lamp`).
    - `tests/shop-list-review-copy.test.tsx`'s placement test now checks that both new hint
      openings precede `<textarea`. It had keyed on the old wording.
- **F.** The `specs/roadmap.md` 1.164.0 row for PR #1168. `sdd:audit` reports it cited.

## Decisions taken during the build

- **`toSearchDepartments` does its own grouping instead of reusing `toCategoryOptionGroups`.**
  The plan named the shared helper, but it groups in one pass and silently drops a child that
  arrives before its parent. `listTree()` orders both tiers together by `sortOrder` then `name`,
  so that order is reachable. The new helper collects children first, and its test covers the
  case. **Confirmed** with a throwaway test (not committed): given `[child, dept]`, the shared
  helper returns `[["dept", []]]`, so the child is gone. The shared helper's own exposure, in the staff
  pickers, is filed as **#1170** and left alone here.
- **No empty `<address>`.** A column showing only icons renders no `<address>` element.
- **`hrefFor` is a function prop** on a server component (`SubcategoryLinks` has no
  `"use client"`), so no serialisation concern arises.
- **R11's test uses `getByRole("region", { name })`, not a CSS attribute selector.** In jsdom,
  `footer.querySelector('section[aria-label="Visit & contact us"]')` returned `null` for the
  bare-vendor fixture while `closest()` with the same selector worked in R10, and the section
  demonstrably existed. The cause was not found. The role query is the more robust assertion
  anyway. **Validation should not copy the CSS-selector form from `validation.md`'s R10/R11 rows
  into a jsdom test; on served HTML it is fine.**
- **Mastercard is single-colour.** Simple Icons glyphs are monochrome, so it is two red circles,
  not the red-and-orange pair. That follows from the owner's choice; official artwork can replace
  the file.

## Deviations from the spec

- **`plan.md` (A) said the grouping would come from `toCategoryOptionGroups`.** The build uses
  `toSearchDepartments`' own grouping, for the reason above. R2's observable requirement is
  unchanged.

## Known-shaky areas

- **The live rows (R6–R9, R11 live, R14, R17) have not been run.** R14 was previewed during the
  build: the five tiles were screenshotted at 4x in headless Chrome and all five showed the
  expected mark. That is not a substitute for the validator's own screenshot.
- **SriMart's subcategories.** Whether SriMart has any is unknown. R17 says to record N/A rather
  than pass if it has none.
- **The served-HTML selector.** `DepartmentSelectFromUrl` uses `useSearchParams` under `Suspense`.
  Whether preview's server HTML already marks the URL's option `selected` was not checked. R4 is
  proven by unit test, and the live check should not fail R4 on server HTML alone.
- **Full-suite flakes, under load.** Two full `npx vitest run`s each had 4–6 failures, mostly
  5-second timeouts in unrelated files (`motion-reduce-coverage`, `token-alpha-purity`,
  `storefront-chrome-rewards-gate`, `pagination-guard-coverage`, `add-to-cart-feedback`). Each set
  differed, and every one of them passed run alone. The one real failure, in
  `shop-list-review-copy`, was fixed. The earlier slice saw the same flake today. A third full run
  was not clean either, so **the validator should run the full suite, re-run any failures alone,
  and treat CI as authority.**
- **The production `DIRECT_URL` is still exported** in this shell. This slice ran no database
  command.

## Validation pass 1 (2026-10-19)

**Not independent.** Validated in the same Opus session that wrote the spec and the build, at the
owner's explicit choice ("validate here anyway"). There was no Clear and no Sonnet switch.

**Pre-flight:**
- `npm run lint`, `npm run format:check` and `npx tsc --noEmit`: all exit 0.
- Full `npx vitest run`: 281/283 files and 3,553/3,555 tests. The two failures
  (`add-to-cart-feedback`, `product-grid-usage`) both passed run alone (17/17), the same
  load-flake pattern as the Build notes.
- The preview build compiled.

**Static rows, all PASS:**
- **R1:** the constant is `"All"`, and the accessible-name test passes.
- **R2:** the indented-option test, plus `tests/search-departments.test.ts`.
- **R3:** `Header.tsx` has no `listTopLevel`, and both `departments=` props come from
  `searchDepartments` (from `listTree()`).
- **R4:** unit cases for a department, a subcategory and an unknown slug.
- **R5:** the `hrefFor` test passes, and the category page's call has no href prop.
- **R8 (unit):** the test passes.
- **R10, R11 (unit):** pass.
- **R12:** `tests/payment-badge-files.test.ts`, 5/5.
- **R13:** no diff in `lib/payment-badges.ts`, `package.json` or `package-lock.json`.
- **R15, R16:** `tests/quick-shop-copy.test.tsx` passes, and `shop-list-review-copy` passes.
- **R18:** one row, and `sdd:audit` reports PR #1168 as cited.
- **R19:** the CHANGELOG cites `#1169`.

**Live rows, under `npm run preview`** (both vendors through `Host:`; script in the scratchpad):

- **Aheed, `localhost:8787`:**
  - **R1/R2:** the first option is "All". 33 options, 23 of them indented subcategories across 8
    departments.
  - **R6** (`beverages`): one pill row. "All" is first, current and links to
    `/search?category=beverages`. 4 links (1 + 3 subcategories), all `/search?`, slugs in
    selector order, one current.
  - **R7** (`water-mixers`): the same 4 hrefs. Only `water-mixers` is current, and "All" points
    at `beverages`.
  - **R8:** with `q=juice&inStock=1&cursor=24`, every pill keeps `q` and `inStock` and drops
    `cursor`.
  - **R9:**
    - no pill row for `/search?q=juice`, `no-such-slug`, or `frozen-foods` (a department with no
      subcategories);
    - the department chip is still rendered.
  - **R17 footer:** "Contact us" is inside "Visit & contact us" and not in "Shop with us". All
    five badge images are served 200 with the Simple Icons content.
  - **R17 Quick Shop:** "For example: 2 Sultanas 500g or Sultanas 500g x2 (up to 100 items, one
    per line)".
- **SriMart, `srimart.localhost:8787`:**
  - **R1/R2:** 7 options, 4 indented, across 2 departments.
  - **R6** (`sri-electronics`): 3 links, "All" current, all into search.
  - **R7** (`sri-chargers-cables`): the same hrefs, and only it is current.
  - **R8:** pass.
  - **R9:** the negatives pass. A department with no subcategories is **N/A**, because SriMart has
    none.
  - **R17 footer: N/A.** SriMart's dev data has no address, phone, email, contact channel or
    badge. The only footer section is "Shop with us", which is R11's "none of the four" case
    behaving correctly.
  - **R17 Quick Shop:** "For example: 2 microSD Card 128GB or microSD Card 128GB x2 …", SriMart's
    own product.
- **R4 after hydration** (headless Chrome over CDP, reading `select.value`):
  - `water-mixers` gives "  Water & Mixers";
  - `beverages` gives "Beverages";
  - `no-such-slug` gives "All";
  - SriMart's `sri-chargers-cables` gives "  Chargers & Cables".

  The **server** HTML shows the `Suspense` fallback ("All") for every URL, and four
  `Search department` selects on every `/search` URL: the fallback is streamed beside the
  resolved select. This slice did not change it. Recorded as information, not a finding.
- **R14:** a fresh 4x headless-Chrome screenshot of the five files. Visa, Mastercard (red,
  single-colour), American Express, Apple Pay and Google Pay each show their mark on a white tile.
- **R20:** every local gate passes. The docs-site build exited 0 on `f2408ac`.
  - **CI `gates` is unverified until the branch is pushed.**

Preview's `workerd` and wrangler `node` processes were stopped by command line, so other Node
tools were left running. No database writes were made.
