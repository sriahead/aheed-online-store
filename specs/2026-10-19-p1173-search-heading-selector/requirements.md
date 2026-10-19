# Category search heading, compact department selector, Sign In icon and collapsible sidebar (requirements / acceptance criteria)

This slice closes `#1173`, the owner's follow-ups to `#1169`. In one line: a category search is
headed by the category's name and highlighted like the category page; the header's department
selector becomes a compact native select, styled with customisable-select CSS where the browser
supports it; Sign In shows a round user icon; and the browse sidebar on `/search` and
`/categories/[slug]` can be hidden on desktop to show one more product column, remembered for the
visit. `plan.md` records today's behaviour and the
owner's rulings. No schema change, no migration, no new dependency. Every UI requirement holds for
**both** vendors, Aheed and SriMart.

**A. Heading and highlights**

R1. The `/search` heading is decided by one pure, exported function (Build names it and its file
    in `build-notes.md`) that takes the trimmed query and the resolved category's name (or none).
    Its outputs are:
    - a non-empty query gives `Results for “<query>”`, unchanged, whether or not a category is
      given;
    - an empty query with a category name gives exactly that name;
    - an empty query with no category gives `All products`.

    `app/(storefront)/search/page.tsx` renders its result in the page's `h1`.
R2. On `/search`, when `category` resolves, `CollectionNav` receives no `activeHref`. When it does
    not resolve, `activeHref` is `/search?featured=1` if `featured=1`, else `/search`, as today.
R3. On `/search`, when `category` resolves, `DepartmentScroller` receives
    `activeSlug = <parent slug>` for a subcategory and `<its own slug>` for a department. When it
    does not resolve, `activeSlug` is `null`.

**B. Department selector**

R4. The selector is still a native `<select name="category" aria-label="Search department">`, with
    the same options, values, U+00A0 indentation and URL selection as `#1169` (its tests still
    pass). Its `className` no longer contains `w-24` or `sm:w-36`, and it contains
    `department-select`.
R5. `app/globals.css` defines `.department-select` with:
    - a fallback `width` of `5.5rem`;
    - an `@supports (field-sizing: content)` block setting `field-sizing: content`, `width: auto`,
      a `min-width` and a `max-width: 10rem`;
    - an `@supports (appearance: base-select)` block setting `appearance: base-select` on the
      select and on its `::picker(select)`, and styling `::picker(select)` (border radius, shadow,
      max height with overflow), `option` (padding, hover/focus background),
      `option:checked::checkmark`, and `::picker-icon` with an `:open` state.

    Every colour in these blocks is a `var(--color-…)` token, with no hex or `rgb` brand colour;
    a neutral shadow (black at low alpha) is allowed.
R6. In Chrome under `npm run preview`, on both vendor hosts:
    - with `All` selected, the select's rendered width is at most `96px`;
    - `getComputedStyle(select).appearance` is `base-select`;
    - an opened picker, captured in a screenshot, shows a rounded, shadowed panel with indented
      subcategories, the selected option ticked, and the vendor's own colours on hover or the
      selected option.
R7. The select keeps `data-tap-surface="search"`, its `min-h-tap` (below `lg`) and its
    `focus-visible` ring classes. With `field-sizing` unsupported, its width falls back to
    `5.5rem`; this is checked by reading the CSS.

**C. Sign In icon**

R8. In `components/layout/Header.tsx`, the signed-out Sign In link renders lucide
    `CircleUserRound` (`w-4 h-4 text-primary`), and `LogIn` is no longer imported or rendered.
    The link's `href` is still `/login`, and its text is still `Sign In`.

**D. Both vendors, live**

R9. Under `npm run preview`, on Aheed (`localhost:8787`) and SriMart (`srimart.localhost:8787`):
    - `/search?category=<a department>` has an `h1` equal to that department's name;
    - `/search?category=<one of its subcategories>` has an `h1` equal to the subcategory's name;
    - `/search?q=<term>&category=<department>` keeps `Results for “<term>”`;
    - `/search` alone keeps `All products`;
    - on the category searches, the Collections nav has no `aria-current`/active item for "All
      products", and the department strip's active item is that department;
    - the signed-out header shows the new icon (an `svg` with lucide's `lucide-circle-user-round`
      class inside the `/login` link).

**E. Collapsible browse sidebar**

R10. On `/search` and `/categories/[slug]`, the left column is wrapped by one new client
     component, which Build names in `build-notes.md`.
     - **Once hydrated, at `md` and up:** it renders a toggle `button` labelled `Hide filters`
       (`aria-expanded="true"`, `aria-controls` = the column's `id`) while open, and `Show filters`
       (`aria-expanded="false"`) while collapsed.
     - **Before hydration and without JavaScript:** it renders no toggle button, and the column is
       visible exactly as today.
     - After each toggle, focus is on the counterpart button.
R11. Collapsing at `md` and up hides the whole column (Browse and filters) except a rail holding
     the `Show filters` button, and sets `data-filters-collapsed` on `document.documentElement`.
     Showing it removes the attribute. Below `md`, the attribute changes nothing: the column, the
     Browse nav and the mobile filter disclosure render as they do with it absent.
R12. `lib/storage-keys.ts` exports `FILTERS_COLLAPSED_KEY = "store_filters_collapsed"`.
     - Collapsing writes `sessionStorage[FILTERS_COLLAPSED_KEY] = "1"`, and showing removes it.
     - Nothing writes it to `localStorage` or to a cookie.
     - Every storage access is inside `try/catch`, so blocked storage leaves the sidebar open with
       no error.
R13. Both pages render, before the column, an inline script that sets `data-filters-collapsed` on
     `<html>` when `sessionStorage` holds `"1"` under `FILTERS_COLLAPSED_KEY`. It reads the name
     from `lib/storage-keys.ts` (the literal appears only there and in tests) and is wrapped in
     `try/catch`. A page loaded in a tab that collapsed earlier therefore renders collapsed from
     first paint.
R14. `/privacy`'s list of stored items gains one entry: "Remembers whether you hid the filters,
     until you close the tab", followed by "Shown in your browser as" and the name rendered from
     `FILTERS_COLLAPSED_KEY`. The consent banner and its categories are unchanged.
R15. `ProductGrid` renders `data-density="<COMPACT|STANDARD|SPACIOUS>"`. `app/globals.css` adds
     exactly these column counts while `html[data-filters-collapsed]` is set, inside the
     collapsible layout only:
     - Standard: 5 at `lg` and up;
     - Compact: 5 at `lg`, 7 at `xl`;
     - Spacious: 3 at `lg`, 5 at `xl`.

     Below `lg`, and with the attribute absent, the existing classes apply unchanged.
     `productGridClassName` is unchanged, so `tests/product-grid-density.test.ts` and
     `tests/product-grid-usage.test.ts` still pass.
R16. The staff density form on `/staff/storefront` shows one sentence saying that a shopper who
     hides the filter sidebar sees one more product per row on wide screens.
R17. Below `md`, `FilterPanel` is still a native `<details>`, closed by default, with no client
     JavaScript (`tests/filter-panel.test.tsx` still passes). Its `summary` shows
     `SlidersHorizontal`, the panel heading, and a chevron that rotates when open, with a
     `motion-reduce` variant on the rotation. `CollectionNav` still renders exactly once per page,
     outside the disclosure.

**Gates**

R18. `CHANGELOG.md` updated (Gate 4).
R19. `lint`, `typecheck`, `test` (`npx vitest run`, run alone; re-run any failure alone before
     calling it real), `format:check` and `kms:validate` all exit 0. `npm run build` succeeds,
     which proves the new CSS passes the Tailwind/Lightning CSS pipeline.
     `npm run kms:assemble:internal` followed by a real Next build in `kms/site-internal` exits 0.
     CI `gates` on the PR is green.
