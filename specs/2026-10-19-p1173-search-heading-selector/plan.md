---
id: p1173-search-heading-selector-plan
title: "Category search heading, compact department selector, Sign In icon and collapsible sidebar (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-19
visibility: internal
summary: "Follow-up to #1169 (#1173): a category search is headed and highlighted like the category page, the department selector becomes a compact styled native select, Sign In gets a round user icon, and the browse sidebar collapses to show one more product column."
tags: [search, header, accessibility, storefront, p10]
related: [p1169-search-footer-polish-plan, p1131-storefront-navigation-catalogue]
---

# Category search heading, compact department selector, Sign In icon and collapsible sidebar (plan)

**Goal:** four owner follow-ups to `#1169`, reported on staging with screenshots on 2026-10-19
(`#1173`). They touch the storefront search and category pages, the header and the product grid.
No schema change, no migration, no new dependency.

## What is true today (2026-10-19, staging at `4f7a35d`)

1. **`/search` heading.** `app/(storefront)/search/page.tsx` sets
   `heading = query ? "Results for “…”" : "All products"`. So `/search?category=fruit-veg` is
   headed "All products" while `/categories/fruit-veg` is headed "Fruit & Veg".
2. **Highlighting.** On `/search`, `CollectionNav` gets `activeHref` `/search` (or
   `/search?featured=1`), so "All products" is highlighted even with a category selected, and
   `DepartmentScroller` gets `activeSlug={null}`. On `/categories/[slug]`, no collection is
   highlighted, and the strip highlights the department: `category.parent?.slug ?? category.slug`.
3. **Selector width and list.** `DepartmentSearchBar`'s `<select>` has fixed `w-24 sm:w-36`, so
   "All" sits in a wide box. Its open list is the browser's native list, which cannot be styled
   with ordinary CSS.
4. **Customisable select is available.** Chrome and Edge 135+ support `appearance: base-select`,
   which makes a native `<select>`'s button and picker stylable (`::picker(select)`, `::checkmark`,
   `::picker-icon`, `:open`) while keeping it a real select. Local Chrome is 155. Safari and Firefox
   ignore it inside an `@supports` guard and keep the native list. `field-sizing: content` sizes a
   select to its selected option, and is likewise Chromium-only. The repo's CSS pipeline (Tailwind
   v4, Lightning CSS) passes these selectors through unchanged; checked at Spec with a direct
   `lightningcss` transform.
5. **Sign In** uses lucide `LogIn` in `components/layout/Header.tsx`.
6. **The browse sidebar.** `/search` and `/categories/[slug]` put a `md:w-60` left column beside
   the results, holding `CollectionNav` (Browse) and `FilterPanel` (filters). `FilterPanel` is a
   Server Component with **zero client JavaScript** by design (`#568`, and `specs/design-system.md`,
   "Disclosure surfaces"). Below `md` the filters sit in a closed native `<details>`; at `md` and
   above they sit in an always-open `aside`. The form is rendered twice for that reason. The
   design-system rules that bind this slice:
   - the filters must stay usable with JavaScript off;
   - a landmark (`nav`, `aside`, anything with an `aria-label`) renders once, never in both
     branches;
   - Browse stays visible on a narrow viewport, because "an entry point hidden by default is not an
     entry point".
7. **The grid's columns follow the viewport,** not the space beside the sidebar.
   `lib/product-grid-density.ts` maps each vendor density to fixed breakpoint classes (Standard
   `grid-cols-2 lg:grid-cols-4`, Compact `… lg:grid-cols-4 xl:grid-cols-6`, Spacious
   `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`). Hiding the sidebar alone would make cards wider
   and taller, so fewer would fit on screen. The owner chose one more column when it is hidden.
8. **Browser storage is registered and disclosed.** Every name the storefront stores lives in
   `lib/storage-keys.ts` (`#1080`), and `/privacy` lists each one, exempt items included (`#1107`).
   The CSP allows inline scripts (`script-src 'self' 'unsafe-inline'`, `next.config.mjs`).

## Scope (this slice)

**A. Category search heading and highlights** (`search/page.tsx`)
- **Heading:**
  - with a search term: unchanged, `Results for “<term>”`;
  - with no term and a resolved `category`: **the category's name**. A subcategory shows its own
    name, as `/categories/<sub>` does;
  - otherwise: "All products".
- **Sidebar:** when `category` resolves, `CollectionNav` gets no `activeHref`, so nothing is
  highlighted, matching the category page. Otherwise it behaves as today.
- **Department strip:** when `category` resolves, `DepartmentScroller` gets
  `activeSlug = selectedCategory.parent?.slug ?? selectedCategory.slug`, the same rule as the
  category page. Otherwise it stays `null`.

**B. Compact, modern department selector** (`DepartmentSearchBar.tsx`, `app/globals.css`)
- **It stays a native `<select name="category">`** (the owner's ruling, and `#1131`'s
  no-JavaScript, phone-picker and accessibility guarantees). The options, values, indentation and
  URL selection from `#1169` are unchanged.
- The fixed `w-24 sm:w-36` classes are replaced by a `department-select` class, defined in
  `app/globals.css`:
  - **Fallback for every browser:** a compact fixed width of `5.5rem`, plus the existing
    truncation.
  - **Under `@supports (field-sizing: content)`:** `field-sizing: content`, `width: auto`, a
    `min-width` of `3.5rem` and a `max-width` of `10rem`, so "All" makes a small button and a long
    name stops at a sensible width.
  - **Under `@supports (appearance: base-select)`:**
    - the select and its `::picker(select)` use `appearance: base-select`;
    - the picker is a rounded panel (`0.75rem` radius) with a soft shadow, a thin border, a
      `max-height` of about `22rem` with scrolling, and a white background;
    - options have comfortable padding and a hover/focus background of `var(--color-action-tint)`;
    - the checked option is bold, with a `::checkmark` tick;
    - the `::picker-icon` arrow turns when `:open`.
  - Colours come from design tokens (`--color-primary`, `--color-action-tint`,
    `--color-surface-muted`), which `brandStyle()` sets per vendor. There are no raw brand hex
    values, so SriMart's colours apply on SriMart.
- The select keeps its accessible name ("Search department"), `name`, `data-tap-surface`, its
  44px tap height below `lg`, and its focus ring.

**C. Sign In icon** (`Header.tsx`)
- `LogIn` is replaced by lucide `CircleUserRound`, with the same size, colour and position. The
  link text "Sign In" and `href="/login"` are unchanged.

**D. Collapsible browse sidebar** (`/search`, `/categories/[slug]`)
- **Desktop (`md` and up): a JavaScript enhancement over today's open sidebar.**
  - A new client component wraps the left column. Once hydrated, it shows a small "Hide filters"
    button (lucide `PanelLeftClose`, `aria-expanded="true"`, `aria-controls` the column) at the
    top of the column.
  - Pressing it collapses the column to a slim rail holding one "Show filters" button
    (`PanelLeftOpen` with a `SlidersHorizontal` cue, `aria-expanded="false"`). The results take the
    freed width.
  - **Without JavaScript the button never renders and the sidebar stays open,** so nothing is lost.
    Keyboard focus moves to the counterpart button after each toggle.
  - The width change animates only `width` (named property, per the design-system motion rules),
    with `motion-reduce:transition-none`.
- **Remembered for the visit only** (the owner's ruling).
  - The state is saved in `sessionStorage` under a new `lib/storage-keys.ts` name,
    `FILTERS_COLLAPSED_KEY = "store_filters_collapsed"` (value `"1"` when collapsed, removed when
    shown).
  - A tiny inline script, rendered just before the column, reads it and sets
    `data-filters-collapsed` on `<html>` before first paint. So a later page arrives already
    collapsed, with no flash.
  - The script is wrapped in `try/catch`; when storage is blocked, the sidebar simply starts open.
  - Session-only interface customisation the shopper asked for is the ICO's own example of an
    exempt item, so the consent banner is unchanged. `/privacy` still lists it: "Remembers whether
    you hid the filters, until you close the tab. Shown in your browser as
    `store_filters_collapsed`."
- **One more column when collapsed.** `ProductGrid` gains a `data-density` attribute. Under
  `html[data-filters-collapsed]`, `app/globals.css` adds one column, inside the collapsible layout
  only:

  | Density | Breakpoint | Open | Collapsed |
  |---|---|---|---|
  | Standard | `lg` and up | 4 | 5 |
  | Compact | `lg` | 4 | 5 |
  | Compact | `xl` | 6 | 7 |
  | Spacious | `lg` | 2 | 3 |
  | Spacious | `xl` | 4 | 5 |

  Below `lg`, nothing changes. The staff density form (`/staff/storefront`) gains one sentence
  saying a shopper who hides the filter sidebar sees one more product per row on wide screens.
- **Mobile (below `md`): stays a native `<details>`,** still closed by default and still
  JavaScript-free. It gets a modern summary: a full-width rounded button with `SlidersHorizontal`,
  the panel's heading, and a chevron that turns when open (`motion-reduce` respected).
  - `CollectionNav` stays outside the disclosure and is not collapsed on mobile (design-system rule
    above).
  - The desktop collapse never applies below `md`. The `<html>` attribute is ignored there, so a
    phone after a desktop-width session still shows its normal layout.
- `/bundles` (Browse only, no filters) is out of scope; see below.

## Deliberately excluded

- **A JavaScript dropdown.** The owner chose the styled native select. Safari and Firefox
  therefore show their own list. That is accepted, not a defect.
- **The NBSP indent in the trigger.** When a subcategory is selected, the button shows the
  option's text including its two leading no-break spaces, because `#1169`'s R2 requires that
  indent for browsers without customisable select. Accepted. Removing it would mean styling
  options per browser, which this slice does not do.
- **The heading with a search term,** the "Newest first" line, and the featured collection's
  heading.
- **Other header icons and controls.**
- **`/bundles`.** Its left column holds Browse only, with no filters to hide, so collapsing it
  would buy little. It keeps today's layout.
- **Remembering the sidebar beyond the visit,** a filter-count badge on the toggle, and a
  slide-over drawer on mobile. The mobile panel stays a disclosure, per `#568`'s no-JavaScript
  rule.
- **The staging catalogue data the owner's screenshots show** (for example tea and cashews under
  Fruit & Veg). Both pages list the same products, so that is category assignment in staging's
  data, not this code.

## Open items carried forward

None.
