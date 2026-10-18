# Storefront navigation and catalogue: hidden departments, Fish, department search, list entry (requirements / acceptance criteria)

Slice A of the owner's 2026-10-17 "Website Updates" brief. Closes `#1131`, which absorbs `#1132`
(header search) and `#1133` (Shopping List icon); both are already closed. It does **not** close
`#1134` (slice B) or `#1135` (slice C). The reasoning, and what was found in the code first, is in
`plan.md`. Everything is Aheed data and vendor-neutral code (ADR-004).

Terms used below. **A visible category** is one that is active and either has no parent or has an
active parent. **A department** is a top-level category. **Aheed** is the vendor with slug
`aheed-food-centre`, served locally at `http://localhost:8787`; **SriMart** is `srimart`, at
`http://srimart.localhost:8787`. **The five departments** are the Aheed categories with slugs
`international`, `household`, `health-beauty`, `baby-kids` and `pet-supplies`. Live checks run under
`npm run preview` against the dev database, never `npm run dev`.

## A. A hidden department hides its products

R1. `lib/category-visibility.ts` exists, is not a `"use server"` module, imports no request context,
    and exports `visibleCategoryWhere`, a constant equal to
    `{ isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] }`.
    `tests/category-visibility.test.ts` asserts that exact value.

R2. In `lib/repositories/products.ts`, every object literal containing `isActive: true` inside the
    arguments of a `prisma.product.*` call above the `Admin catalogue path` section marker (including
    one passed to a helper such as `combineWhere`) also carries `category: visibleCategoryWhere`. `tests/storefront-product-visibility.test.ts`
    parses the file with the TypeScript compiler API (the technique in
    `tests/repository-client-injection.test.ts`), enumerates those calls, asserts the list is
    non-empty, and fails naming any call that lacks the key. The `groupBy` in
    `categorySpotlights` is included: its result is checked against R1's predicate.

R3. In `lib/repositories/categories.ts`, `getCategoryBySlug` returns `null` for a department whose
    `isActive` is false and for a subcategory whose parent's `isActive` is false, even when the
    subcategory's own `isActive` is true; `suggestCategories` and `listCategoryTreeForStorefront`
    return no such subcategory either. `tests/category-visibility.test.ts` proves all three with a
    stubbed Prisma client that implements the `where` it is given.

R4. **Live.** After `npx tsx scripts/apply-department-changes.ts --vendor aheed-food-centre --apply`
    (R10) has run against the dev database, on Aheed: `/categories/baby-kids` returns HTTP 404;
    `/products/baby-wipes-80pk` returns HTTP 404; `/search?q=baby+wipes` returns 200 and its HTML
    does not contain `/products/baby-wipes-80pk`; `/sitemap.xml` contains neither
    `/categories/baby-kids` nor `/products/baby-wipes-80pk`; and `/categories` and the header's
    department selector list none of the five departments.

R5. **Live.** After `... --restore` (R10) runs, the five pages in R4 return to their pre-hide
    state: `/categories/baby-kids` and `/products/baby-wipes-80pk` return 200 and the search HTML
    contains `/products/baby-wipes-80pk`. The count of `Product` rows with `isActive = true` for
    Aheed is identical before the hide, while hidden, and after the restore, so hiding rewrote no
    product.

R6. **Live.** While the five departments are hidden on Aheed, SriMart's `/categories` page links
    the same set of `/categories/<slug>` paths as before the hide, and `/search?q=<a product name
    taken from SriMart's own `/search` before the hide>` links the same `/products/<slug>` paths.

R6a. **Live, promotions.** A department's promotion (its `DepartmentCampaign`: headline, subtitle,
     image) shows in the landing page's department carousel only while the department is visible.
     With `baby-kids` given the headline `Zz Promo` at `/staff/promotions`, `curl -s
     http://localhost:8787/` contains `Zz Promo` before R4's `--apply`, does not contain it while
     the five departments are hidden, and contains it again after `--restore`. The count of
     `DepartmentCampaign` rows for Aheed is the same at all three points and the row's headline
     is unchanged, so hiding deletes no promotion. The hero's `listTopLevel()`-derived department
     list is what excludes it; no campaign row is touched. `tests/category-visibility.test.ts`
     also asserts that a campaign map keyed by a hidden department's id is never requested, by
     checking the landing page builds its campaign ids from the visible departments only.

## B. Staff can hide a department that has products

R7. `updateCategoryForVendor` returns `{ ok: true }` when an active department with active
    products and active subcategories is submitted with `isActive: false`, writes the change, and
    touches no `Product` or child `Category` row. `tests/category-repository.test.ts` asserts the
    return value and that `product.update`, `product.updateMany`, `category.updateMany` and a child
    `category.update` were not called. The refusal test that asserted the old error is removed or
    inverted, not left failing.

R8. `CategoryForm`, in edit mode, renders next to the "Visible in the shop" checkbox the sentence
    `Turning this off also hides its N products and M sub-categories from shoppers. They come back
    when you turn it on.` with the real counts and correct singular forms (`1 product`,
    `1 sub-category`). It renders no such sentence when both counts are zero or in create mode. The
    text names no vendor and no product type. `tests/category-form.test.tsx` asserts the sentence
    for counts of (3, 2), (1, 1) and (0, 0), and in create mode.

## C. Fish department and the data script

R9. `prisma/seed.ts` creates, for Aheed, an active top-level category named `Fish` with slug `fish`
    and two active subcategories whose `parentId` is Fish's id: `Fresh Fish` (`fresh-fish`) and
    `Frozen Fish` (`frozen-fish`). Running `npx prisma db seed` twice in a row leaves exactly one
    row of each of the three slugs for Aheed and none for SriMart. The seed does not set `isActive`
    to false on any of the five departments.

R10. `scripts/apply-department-changes.ts` takes `--vendor <slug>` (required) and the flags
    `--apply` and `--restore`.
     - With no `--apply`, it prints the changes it would make and writes nothing: the row counts of
       `Category` and `VendorConfig` are unchanged after the run.
     - With `--apply`, it sets `isActive = false` on exactly the five departments of that vendor,
       creates the Fish tree of R9 where it is missing, and sets `VendorConfig.searchPlaceholder`
       to exactly `Type your product, we will find it for you`. A second `--apply` run reports no
       changes and writes nothing.
     - With `--apply --restore`, it sets `isActive = true` on the five departments of that vendor
       and changes nothing else.
     - It exits non-zero and writes nothing for an unknown vendor slug, and no write ever names a
       vendor other than the one given.
     - Its decisions come from a pure function, tested in `tests/apply-department-changes.test.ts`
       against fixtures for: nothing done yet, already applied, Fish partly present, a vendor
       without some of the five departments (it skips them and says so), and restore.
     - It issues no raw SQL. It builds its client the way `scripts/seed-footer-defaults.ts` does
       (bare `@prisma/client` with `PrismaNeon` on `DIRECT_URL`), prints the target database host
       before any write, and exits non-zero without writing when `DIRECT_URL` is empty.

R11. **Live.** On Aheed after R10's `--apply`, `/categories/fish` returns 200 and its HTML contains
     links to `/categories/fresh-fish` and `/categories/frozen-fish`, and `/` returns 200 with
     `Fish` in the department hero and in the header's department selector. The department has
     no products and no page renders an error state for it.

## D. Category management

R12. When `saveCategory` refuses a submission (a duplicate web address, an invalid parent, a
     missing name), its returned state carries the submitted `name`, `slug`, `parentId`,
     `sortOrder` and `isActive`, and `CategoryForm` renders those as its field values. In
     `tests/category-form.test.tsx`, with `saveCategory` mocked to refuse, submitting the form with
     name `Test`, slug `dup`, a chosen parent, sort order `4` and the checkbox cleared leaves all
     five inputs holding exactly those values and shows the error. The `CatalogueFormState` type and
     its initial value stay in `lib/catalogue-form.ts`, not in a `"use server"` file.

R13. Before changing category code, Build reproduces the owner's "category creation and selection"
     problem in `npm run preview` as signed-in demo staff, and `build-notes.md` records what was
     done, what happened, and whether R12 explains it. A symptom that R12 does not explain is
     recorded on `#1131` as a comment, and is either fixed in this slice with its own added
     requirement `R13a` and test, or filed as a new issue on the board with Phase P10.

R14. **Live, propagation.** Creating at `/staff/categories` a top-level category named `Zz Probe`
     (slug `zz-probe`) and a subcategory `Zz Probe Sub` (slug `zz-probe-sub`, parent `Zz Probe`),
     both visible, makes all of the following true on the next request with no restart or deploy:
     the header department selector has an `Zz Probe` option; `/categories` links to
     `/categories/zz-probe`; `/` shows `Zz Probe` in the department hero; the staff product form's
     category picker at `/staff/products/new` has an optgroup labelled `Zz Probe` containing
     `Zz Probe Sub`; and `/search?category=zz-probe` returns 200 with a filter chip naming
     `Zz Probe`. Toggling the department invisible removes it from every one of those places except the
     staff product form's category picker, which keeps listing inactive categories, marked
     "(inactive)", so staff can still file products under a hidden department.
     Both probe categories are left hidden afterwards, and the validator records that they remain.

## E. Header search

R15. `components/layout/DepartmentSearchBar.tsx` is a client component that renders one
     `<form method="GET" action="/search">` containing, in DOM order: a native `<select
     name="category">`, the existing `SearchSuggest` input (`name="q"`, `role="combobox"`
     unchanged), and a `<button type="submit">`. The button's accessible name is `Search`, it
     contains the search icon, and the icon is no longer drawn inside the input. The `Header` uses
     it in both the desktop slot and the below-`sm` row.
     `tests/department-search-bar.test.tsx` asserts the order, the types and the accessible names.

R16. The select's first option has value `""` and text `All Departments`. It is followed by one
     option per entry of the `departments` prop, in the order given, with `value` equal to the
     department's slug and text equal to its name, and by no other option. Its accessible name is
     `Search department`. It is a native `<select>` with no `size` attribute and no custom
     listbox, so a list longer than the viewport scrolls natively and a phone uses its own
     picker. `tests/department-search-bar.test.tsx` asserts each of these with a three-entry and a
     thirty-entry `departments` array.

R17. `Header` builds `departments` from `getCategoryRepository().listTopLevel()` and from nothing
     else, so the list is whatever the database holds as active departments. The new file
     `components/layout/DepartmentSearchBar.tsx` contains none of the case-insensitive strings
     `fish`, `baby`, `pet supplies`, `household` or `international`, and `Header.tsx` contains
     `listTopLevel` in the code that builds the prop.

R18. **Live, no JavaScript.** On Aheed, `curl -s http://localhost:8787/search` returns HTML whose
     header form has `action="/search"`, `method="GET"`, a `<select` named `category` whose first
     `<option` has `value=""`, an `<input` named `q`, and a `<button` of type `submit`. The page is
     usable with scripting off because nothing in the form depends on client code.

R19. **Live.** The `<input name="q">` in Aheed's `/search` HTML has
     `placeholder="Type your product, we will find it for you"` after R10's `--apply`, and
     SriMart's HTML for the same page still has SriMart's own placeholder. With a vendor that has
     no `searchPlaceholder`, the placeholder is `Search products…`, asserted in
     `tests/department-search-bar.test.tsx` through the prop path.

R20. Submitting the form navigates to `/search?q=<term>&category=<slug>`: by the submit button,
     and by Enter in the input when no suggestion is highlighted, which `SearchSuggest` already
     leaves to the form. In `tests/department-search-bar.test.tsx`, clicking the button in jsdom
     dispatches the form's `submit` event once, and pressing Enter in the input with no option
     highlighted does not call `preventDefault`. **Live**, in a real browser at 1280px on Aheed:
     choosing `Pet Supplies` and typing `baby wipes` and clicking the button lands on a URL whose
     query is `q=baby+wipes&category=pet-supplies` and whose page does not link
     `/products/baby-wipes-80pk`; the same search with `Baby & Kids` chosen, submitted with Enter,
     does link it. Both run before R10's `--apply`.

R21. Choosing `All Departments` submits `category=` empty, and `/search` treats it as no
     department. `GET /search?q=baby+wipes&category=` returns 200 and links
     `/products/baby-wipes-80pk`. A bare `GET /search?category=baby-kids` with no `q` returns 200
     and lists that department's products (browse mode, #501).

R22. On `/search`, the select shows the department named in the URL: `?category=baby-kids` selects
     the `baby-kids` option, and an unknown slug, a subcategory slug, or no parameter selects `All
     Departments`. The component reads the parameter with `useSearchParams` under a `Suspense`
     boundary that renders the select with `All Departments` selected as its fallback, and the
     server-rendered HTML of every page still contains the whole form. Asserted in
     `tests/department-search-bar.test.tsx` with a mocked `useSearchParams`, and **live** by reading
     the select's value in a browser at `/search?q=a&category=baby-kids`.

R23. **Layout, measured.** Using `npx tsx scripts/verify-mobile-layout.ts --base
     http://localhost:8787 --path /search --widths 360,390,768,1280`, extended in this slice to
     also print the box of `[data-header-search]` (the form), of its select, input and button, and
     the page's `scrollWidth` against its viewport width, the printed values satisfy at every
     width: the page does not scroll horizontally (`scrollWidth <= viewport width`); the button is
     at least 44 by 44 CSS px below 1024px; the input is at least 120px wide at 360 and 390; at
     1280 the form is at least 480px wide; and select, input and button share one row (their tops
     differ by at most 2px). The hook `data-header-search` is added to the form by this slice.

R24. The header's existing controls are unchanged by this slice other than the search bar and R25:
     `tests/header-brand.test.tsx` and the LocationControl accessible-name tests from `#1091` pass
     unmodified, and `/search`'s own filter panel and department strip render exactly as before
     for a vendor with no hidden departments.

## F. Shopping List entry and guest prompt

R25. `Header` renders the link to `/shop-your-list` on the landing route as well as on every other
     non-portal route, with `aria-label="Shopping list"` on that link at every viewport width
     (its visible text stays hidden below `sm`). Asserted in a header test that renders `Header`
     with `isLanding` true and with it false, and **live** with
     `curl -s http://localhost:8787/ | grep` for `href="/shop-your-list"`. The link on the
     landing page has a box of at least 44 by 44 CSS px at 360 and 390px, read with
     `verify-mobile-layout.ts` at `--path /`.

R26. `ShopYourList` with `canSave` false and a matched list shows the sentence
     `Sign in to save this list for next time.` and a link to `/login` with the text `Sign in`.
     It shows neither before a list has been matched. With `canSave` true it renders the existing
     save form and no sign-in prompt. `tests/shop-your-list-save-prompt.test.tsx` asserts all
     three states. The sentence names no vendor.

R27. A guest can still match a list and add matched lines to the cart exactly as before: the
     existing shop-your-list tests pass unmodified, and **live**, in a guest browser session on
     Aheed, matching `rice` on `/shop-your-list` shows the review, the sign-in prompt from R26 and
     no save form, and `/account/lists` for the same guest redirects to `/login`.

## G. Preserving what works, and the delivery gates

R28. `npx vitest run`, run alone, passes with no skipped or deleted tests beyond those R7 and R25
     name; any other existing test edited is listed in `build-notes.md` with the reason, and no
     existing assertion was weakened to pass.

R29. `package.json` and `package-lock.json` are byte-identical to `origin/staging`'s. No file
     under `app/`, `components/`, `lib/` or `features/` contains `runtime = "edge"`, and
     `git diff origin/staging -- app components lib features` adds no `$queryRaw`,
     `$executeRaw` or `Prisma.sql`.

R30. `specs/architecture.md` states, in the Category section, that a category is visible only if it
     and its parent are active, that hiding a category hides its products without altering them,
     and that deactivation no longer requires emptying the category (superseding #159's refusal).
     The store admin guide (`docs/store-admin-guide/admin-tabs-guide.md`) says the same in its
     Categories section in operator language, and every capability sentence it adds traces to a
     real control: the "Visible in the shop" checkbox and the note from R8. `npm run kms:validate`
     exits 0 with `invalid front-matter (failing): 0`.

R31. After the documentation edits, `npm run kms:build-index`, `npm run kms:check-generated`,
     `npm run kms:assemble:internal`, and a real Next build in `kms/site-internal` all exit 0
     (CLAUDE.md: `gates` never builds the docs site). This slice's `plan.md` contains no bare `<`
     directly before a digit.

R32. `CHANGELOG.md` is updated on the branch (Gate 4), naming `#1131` and saying the header search,
     the Shopping List entry and the department changes are included. No commit message and no pull
     request body on this branch uses a closing keyword directly before `#1134`, `#1135`, `#1132`
     or `#1133`; the pull request base is `staging` and its body says `Closes #1131`.

R33. `npm run lint`, `npm run typecheck`, `npx vitest run` (alone) and `npm run format:check` all
     exit 0, and so does `npm run build`.
