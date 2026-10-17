# Storefront navigation and catalogue: hidden departments, Fish, department search, list entry (build notes)

Written at the end of Build (2026-10-17), before the Clear. Branch
`feature/p1131-storefront-navigation-catalogue`, cut from `origin/staging` at `f433843`. Commits:
spec `fac3ca1`, implementation `a19c3b7`, tests `0cc2978` and `e0a5b88`, header breakpoint and
staff guide `1de9b77`, KMS index `bea922f`, then this file and the CHANGELOG.

## What changed and why

**Visibility (R1–R6a).** `lib/category-visibility.ts` exports `visibleCategoryWhere` (active, and
either top-level or under an active parent). It is applied:
- to every `isActive: true` literal above the `Admin catalogue path` marker in
  `lib/repositories/products.ts`, which is twelve literals. That covers listing, search candidates,
  facets, suggestions, list matching, spotlights (both the `groupBy` and the winners read),
  unit-price sort, active slugs for the sitemap, name tokens, and `getProductBySlug`;
- in `lib/repositories/categories.ts`, to `getCategoryBySlug` (spread), `listCategoryTreeForStorefront`
  (spread) and `suggestCategories` (under `AND`, because that query has its own `OR` for terms).

`listTopLevelCategories` is unchanged: `parentId: null, isActive: true` is already the full rule
for a department. The landing carousel and its campaign lookup are keyed on that list, so a hidden
department's promotion drops out without code (R6a). `tests/category-visibility.test.ts` asserts
both the list and the landing source.

**Staff hiding (R7, R8).** The #159 refusal in `updateCategoryForVendor` is deleted. The function
now reads only `{ id }` to check the category exists. `countHiddenWithCategory` (repository plus the
`lib/categories-service.ts` wrapper) counts:
- active products directly in the category, or in an active child;
- active children.

`app/(admin)/staff/categories/[id]/page.tsx` passes the counts to `CategoryForm`, which renders the
R8 sentence (`hiddenWithCategoryNote`, exported for its test) linked from the checkbox by
`aria-describedby`. The page's subtitle, which said hiding needed products moved first, was rewritten.

**Refused save keeps values (R12).** `CatalogueFormState` gains an optional `submittedCategory`
(raw strings plus a boolean). `readSubmittedCategory(form)` sits in `lib/catalogue-form.ts`, not the
`"use server"` file. `saveCategory` echoes it on parse refusals and repository refusals.
`CategoryForm` uses it as the defaults and keys the `<form>` on the refusal, so the fields remount
with those defaults. This also fixes the no-JS path: the server re-render reads the same state, and
that was confirmed live (see R13).

**Header search (R15–R24).**
- `components/layout/DepartmentSearchBar.tsx` (new, client) is a `GET /search` form with
  `data-header-search` and `role="search"`. In order it holds:
  - a native `select name="category"`, labelled "Search department", with "All Departments" and
    value `""` first;
  - `SearchSuggest`;
  - a `button type="submit"` labelled "Search", carrying the lucide `Search` icon.
- The select reads `useSearchParams` under `Suspense`. The fallback is the same select with nothing
  chosen, and a changed `key` remounts it on client navigation.
- `SearchSuggest` lost its decorative icon and its rounding, and became the bar's middle segment.
- `Header` builds `searchDepartments` from `getCategoryRepository().listTopLevel()`. That read is
  request-memoised, so pages that also list departments share the one query. It is skipped for the
  portal.
- The old local `SearchForm` is gone.

**Shopping List (R25–R27).**
- The header's `/shop-your-list` link renders on the landing route too, with
  `aria-label="Shopping list"` and the visible text "Shopping List".
- `Header` no longer destructures `isLanding`; the prop stays on the type because the route groups
  still pass it.
- `ShopYourList` renders "Sign in to save this list for next time." and a `/login` link when
  `canSave` is false and a list has been matched.

**Fish and the data script (R9–R11).**
- `prisma/department-changes.ts` (new, pure) holds `DEPARTMENTS_TO_HIDE`, `FISH_DEPARTMENT`,
  `OWNER_SEARCH_PLACEHOLDER`, `planDepartmentChanges(state, "apply" | "restore")` and
  `describeChange`.
- `prisma/seed.ts` adds `FISH_DEPARTMENT` to Aheed's `CATALOGUE`. `seedCatalogue` is idempotent per
  category and `seedSubcategories` creates the children, so an already-seeded database gets Fish too.
- `scripts/apply-department-changes.ts` follows `scripts/seed-footer-defaults.ts`: `DIRECT_URL`,
  prints the host, dry run by default, `--apply`, `--restore`. Every write is a singular
  `update`/`create` with no nested writes (CLAUDE.md's `getPrisma()` rule does not bind a Node
  script, but nothing here needs a transaction anyway).

**Measurement (R23).** `scripts/verify-mobile-layout.ts` prints `headerSearch`: the boxes of the
form, select, input and button, each as `{top, left, width, height}`.

**Docs (R30).**
- `specs/architecture.md` 1.41.0 records the visibility rule beside the Category model.
- `docs/staff-playbook/staff-tabs-guide.md` 2.11.0 says what hiding does and how to bring a
  department back (see Deviations for why this file and not the admin guide).

### R13 — reproduction of the owner's "category creation and selection" problem

Run 2026-10-17 under `npm run preview` on the **original** code. The built output still contained
"Hiding a category needs its products…" and none of the new symbols. Setup:
- dev database `ep-dry-morning`, confirmed against `secrets/staging.vars` and
  `secrets/production.vars` as neither of those;
- signed in as `demo-staff@example.com` through curl, since no browser extension was connected;
- forms submitted the no-JS way, using the playbook's `useActionState` recipe with
  `$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1` and `$ACTION_KEY`.

1. **Refused create.** `POST /staff/categories` with name `Zz Repro Dup`, slug `international`,
   sortOrder `4` and `isActive=on`:
   - returned 200 and showed "Another category in this store already uses that web address.";
   - came back with `name value=""`, `slug value=""` and `sortOrder value="0"`, so everything typed
     was lost. **R12 explains it.**
2. **Create and propagation.** Created `Zz Repro` (`zz-repro`, top level, sortOrder 90), then
   `Zz Repro Sub` (`zz-repro-sub`, parent `Zz Repro`). Both returned 303 to their edit pages.
   Immediately afterwards:
   - `/staff/products/new` had `<optgroup label="Zz Repro">` with both;
   - `/categories` linked `/categories/zz-repro`, and `/` contained `Zz Repro`;
   - `/search?category=zz-repro` and `/categories/zz-repro` both returned 200.

   **Propagation already worked.** R14 is therefore a regression check, not a fix.
3. **Hiding.**
   - Saving `Zz Repro` without `isActive` was refused: "This category still has 1 active
     sub-category. Deactivate or move those first."
   - `Baby & Kids` was refused the same way: "…2 active products…".
   - So the owner could not hide any department that has stock. **R7 explains it.**

No symptom that R7 and R12 do not explain, so there is no `R13a`.

**Re-checked on the new build (preview, same database):**
- The same refused create re-rendered `Zz Repro Dup`, `international` and `4`.
- `/staff/categories/<Zz Repro>` showed "Turning this off also hides its 1 sub-category…".
- Saving it without `isActive` returned "Category saved", and `/categories/zz-repro-sub` then
  returned 404.

## Fix after first Validate (2026-10-17)

- **F1: the playbook said a hidden department is not listed on the Promotions page. It is.**
  `listCategoriesForAdmin` and `getCategoryForAdmin` carry no `isActive` filter, and the page was
  never changed, so `/staff/promotions` lists hidden departments and their promotion stays
  editable. Observed live: all five hidden departments were listed. The sentence in
  `docs/staff-playbook/staff-tabs-guide.md` now says so, and that shoppers do not see the promotion
  until the department is shown. The doc was wrong, not the code: R6a requires the promotion row to
  survive hiding. No `validation.md` row was loosened.
- R14 wording amended on the owner's instruction: R14 "removes it from every one of
  those places" does not hold for the staff product picker, which has always listed inactive
  categories marked "(inactive)" so staff can still assign products to them. R14 and its validation
  row now name the picker as the one exception; no code changed.

## Fix after second Validate (2026-10-17)

- **F2: the CHANGELOG still listed `#1140` as a deferred gap.** It said a hidden department's
  promotion is not listed on `/staff/promotions`. Validate fetched that page with the five
  departments hidden and it listed all 16 categories, hidden ones included. F1 had corrected the
  playbook but not the CHANGELOG. The CHANGELOG now states the real behaviour and no longer defers
  `#1140`. No code and no `validation.md` row changed; the CHANGELOG was wrong, not the code.
- **Open, for the owner:** issue `#1140`'s own body repeats the false claim. Closing or
  correcting it is a GitHub write, so it is left for the user (see the hand-over in the reply).
- **Corrections to "Dev database state left by Build" above:** the five departments are **hidden**
  (not visible), and `Zz Probe` (hidden, with `Zz Probe Sub` under it) exists alongside `Zz Repro`.
- **Spec wording, not a defect:** R20 writes the query as `q=…&category=…`; the form serialises
  `category` first (`?category=bakery&q=bread`) because R15 puts the select before the input.

## Decisions taken during the build

- **One scan rule for R2, a superset of the requirement's wording.**
  - It covers every `isActive: true` literal above the marker, wherever it sits: in a
    `prisma.product.*` call, in a `findPage(...)` argument, or in `combineWhere(...)` / a `base`
    variable.
  - The single exemption is a literal whose nearest enclosing `prisma.*` call is on `category`
    (the spotlights' child lookup), since a category has no `category` relation.
  - Mutation-checked: removing the predicate from `getProductBySlug` fails the test, naming
    `getProductBySlug (line 1390)`.
- **Hidden counts include products in active children.** "Hides its N products" means everything
  that stops showing, and a department hides its whole subtree.
- **`countHiddenWithCategory` is a separate read, not extra fields on `AdminCategoryDetail`.** That
  type is shared by the promotions page, the campaign-image route and action, and two tests mock it.
- **The placeholder change lives in the script, not a code default.** The default stays
  `Search products…`, which is vendor-neutral.
- **The script's restore leaves Fish and the placeholder alone.** The owner called only the hiding
  temporary.
- **The planner refuses to treat a same-slug sub-category as a department to hide.** The rule is
  written into the planner and tested.
- **Search button colour is `bg-accent`.** It is the closest token to the reference's highlighted
  button, and `brandStyle()` can override it per vendor.
- **The no-JS submit includes `category=` even for "All Departments".** `/search` already ignores
  an empty value, and R21 relies on that.

## Deviations from the spec

1. **The search bar sits inline only from `xl` (1280px); below that it takes the full-width row
   under the header** (`hidden xl:block` and `mx-auto max-w-7xl … xl:hidden`).
   - Plan section F implied inline from `sm`, the old behaviour.
   - Measured with `scripts/verify-mobile-layout.ts`, inline left the field 9px wide at 768 and
     81px at 1024, because the row holds the logo, LocationControl, the new select and the nav.
   - Final readings on `/search`, given as width form/select/input/button, top, and pinned header
     height (`headerHeightAfterScroll`), with no horizontal overflow at any width:

     | Width | Form/select/input/button | Top | Header |
     |---|---|---|---|
     | 360 | 328/96/188/44, all 44 tall | 139 | 119 |
     | 390 | 358/96/218/44 | 139 | 119 |
     | 768 | 736/144/548/44 | 159 | 139 |
     | 1024 | 992/144/808/40, 39 tall | 143 | 134 |
     | 1100 | 1068/144/884/40 | 119 | 134 |
     | 1280 | 521/144/337/40, inline | 55 | 89 |

   - R23's thresholds are met at every width it names.
   - **Cost:** the pinned header is taller from 640 to 1279px than when search sat inline, but it
     is unchanged in structure below 640.
2. **The visible link text is "Shopping List"** (was "Shop List"). R25 fixed
   `aria-label="Shopping list"`, and keeping the old text would have broken WCAG 2.5.3 (label in
   name).
3. **R30 names `docs/store-admin-guide/admin-tabs-guide.md`, but it has no Categories section.**
   Categories are documented in `docs/staff-playbook/staff-tabs-guide.md` (the page is
   staff-and-admin), so that file was updated. It also wrongly claimed a hidden department's
   products stayed in search; that is corrected. **Validate R30 against the staff playbook.**
4. **Plan "What Orient found" item 5 was half wrong.** The landing header already rendered the
   search form; only "Shop List" was hidden there. The landing page therefore shows the new bar
   (`headerSearch` is non-null at `--path /`), and the plan's "Deliberately excluded: search on the
   landing page" is moot. No requirement depended on it.
5. **R7's "refusal test that asserted the old error" did not exist.** No test covered the refusal,
   so R7's test file is new (`tests/category-repository.test.ts`), and nothing was removed or
   inverted.
6. **R28: one existing test was edited.** In `tests/search-repository.test.ts`,
   `listProductNameTokens`'s exact query-shape assertion now includes
   `category: visibleCategoryWhere`. That is the R2 change; no assertion was weakened. No other
   existing test was edited.

## Known-shaky areas

- **R22's server HTML.** `?category=baby-kids` streams the `Suspense` fallback first, with "All
  Departments" selected, then the resolved select with `baby-kids` selected (`<!--$?-->` plus a
  `<template id="B:0">`). So a `curl | grep selected` sees both. Check the value in a browser, as
  `validation.md` R22 says.
- **R12 in a real browser was not exercised.** No extension was connected. The jsdom test and the
  live no-JS path both pass, but the JS path's React form reset plus remount has only jsdom behind
  it. Do R12's browser step.
- **R20 and R27 browser steps, and R6a, were not run during Build.** R6a needs a campaign headline
  set at `/staff/promotions`.
- **Full-suite timeouts (#1125).**
  - The first `npx vitest run` had `tests/storefront-chrome-rewards-gate.test.tsx` time out twice
    at 5000ms, plus one more failure in a file whose name was not captured.
  - The same file passed alone, and the immediate rerun was green: 267 files and 3369 tests.
  - That test mocks `Header`, so this slice cannot reach it. Rerun before calling it a regression.
- **Dev database state left by Build** (`ep-dry-morning`):
  - the five departments are **visible** (applied, then restored);
  - Fish, Fresh Fish and Frozen Fish exist;
  - Aheed's `searchPlaceholder` is the owner's text;
  - probe categories `Zz Repro` (**hidden**, parent) and `Zz Repro Sub` (visible, under it) remain.

  `prisma db seed` was **not** run during Build (it re-uploads placeholder images), so R9's seed
  path is unexercised; validation Setup step 3 runs it.
- **The production rollout is a user-run step.** After deploy, someone runs the script against
  staging, then production, with `DIRECT_URL` from `secrets/<env>.vars`. Nothing in CI does it, so
  shipping the code alone changes no department.
