---
id: p1169-search-footer-polish-plan
title: "Search selector, search pills, footer contact icons, payment logos and Quick Shop examples (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-19
visibility: internal
summary: "Owner polish request #1169: the header search selector reads All and lists subcategories, /search shows the category page's subcategory pills, the footer's contact icons move under Visit & contact us, real payment logos replace text placeholders, and Quick Shop shows both quantity forms."
tags: [search, header, footer, quick-shop, storefront, p10]
related: [p1131-storefront-navigation-catalogue, p1145-quick-shop, sdd-workflow]
---

# Search selector, search pills, footer contact icons, payment logos and Quick Shop examples (plan)

**Goal:** four storefront changes the owner asked for on 2026-10-19 (`#1169`, with a screenshot of
the header and footer). Each is small. They share a slice because they are all copy or layout on
the shared storefront chrome, and none touches the database schema, a migration or a secret.

## What Orient and Propose established

These are facts about the repository and production on 2026-10-19, so the validator need not
re-derive them.

1. **`/search` already includes a department's subcategory products.** With `?category=<slug>`,
   `app/(storefront)/search/page.tsx` narrows to the department's id plus its children's ids. On
   production `/search?category=beverages` and `/categories/beverages` both return the same 8
   products. What the owner saw missing is the **subcategory pills**: `/categories/<slug>` renders
   `SubcategoryLinks` ("All", then each subcategory, the current one highlighted), and `/search`
   renders nothing like it.
2. **The header selector lists departments only.** `components/layout/Header.tsx` passes
   `getCategoryRepository().listTopLevel()` to `DepartmentSearchBar`. A subcategory slug in the URL
   selects "All Departments" (`DepartmentSelectFromUrl`). `getCategoryRepository().listTree()`
   already returns every visible department and subcategory in one request-memoised read, ordered
   by `sortOrder` then `name`, and `toCategoryOptionGroups` (`lib/catalogue-form.ts`) already groups
   such a list into departments with their children.
3. **`categoryFilterHref(params, slug)`** (`components/product/search-href.ts`) already builds a
   `/search` link that keeps `q` and every active filter, replaces `category` and drops `cursor`.
   Nothing renders it today.
4. **The footer's contact-channel buttons** (`FooterContactChannels`, a `ul` named "Contact us")
   sit at the end of the "Shop with us" column in `components/layout/StorefrontFooter.tsx`. The
   "Visit & contact us" column renders only when an address, phone or email is set (`showContact`).
5. **The five payment badge files are text placeholders.** Each of
   `public/payment-methods/{visa,mastercard,amex,apple-pay,google-pay}.svg` is a white rounded
   rectangle with the brand name as `<text>`, `aria-label="… (placeholder)"`, and a comment saying
   to replace the file and keep its name. The footer renders them through `ImageWithFallback` on a
   40x24 white tile.
6. **A bare trailing number is not a quantity.** `parseListLine` (`lib/shopping-list.ts`) reads
   `2 X`, `2x X`, `X x2` and `X x 2` as quantities, but not `X 2`. That is deliberate: a trailing
   number is often a pack size ("Eggs 12"). The owner's suggested example "Apple Juice 1L 2" would
   have produced one item searched as "apple juice 1l 2". At Gate 1 the owner chose to show the
   `x2` form instead and leave the parser alone.

## Scope (this slice)

**A. Header search selector** (`DepartmentSearchBar.tsx`, `Header.tsx`)
- The empty-value first option reads **All**. `ALL_DEPARTMENTS_LABEL` becomes `"All"`. The
  select's accessible name stays "Search department", so the short label still reads clearly
  to a screen reader.
- The option list is every visible department in `listTree()` order, each followed immediately
  by its visible subcategories.
  - A subcategory's option text is two non-breaking spaces (U+00A0) followed by its name, which
    indents it under its department in a native select on desktop and mobile.
  - Its value is its slug. `/search` already accepts a subcategory slug.
  - The type passed to the bar gains a way to tell a subcategory from a department (Build picks
    the shape, for example a `depth` or `isSubcategory` field).
- `Header.tsx` reads `listTree()` instead of `listTopLevel()`. It is request-memoised and already
  read by `/search` and `/bundles`, so those pages add no query. The portal still skips the read.
- **A subcategory in the URL now selects its own option.** Any slug in the passed list is
  selected; an unknown slug still selects All.
- The select keeps its native element, its width classes and its truncation. Making the label
  shorter is the change; the width is not.

**B. Subcategory pills on `/search`** (`search/page.tsx`, `SubcategoryLinks.tsx`)
- When `category` resolves, `/search` renders `SubcategoryLinks` between the heading area and the
  filter chips, with the same rules as `/categories/[slug]`:
  - for a **department**, the pills are "All" plus its subcategories, with "All" active;
  - for a **subcategory**, the pills are "All" (its department) plus its department's
    subcategories, with that subcategory active.
- **On `/search` every pill links back into search, not to the category page.** Each href is
  `categoryFilterHref(params, slug)`, so the shopper's query and filters survive and the cursor
  is dropped. "All" uses the department's slug.
- `SubcategoryLinks` gains an optional prop that maps a slug to an href. Without it, the links
  are `/categories/<slug>` exactly as today, so the category page is unchanged.
- No pills render when `category` is absent or unresolved, or when the department has no
  subcategories (`SubcategoryLinks` already returns `null` for an empty list).
- The existing removable category chip in `FilterChips` stays. It is how a shopper clears the
  category.

**C. Footer contact icons** (`StorefrontFooter.tsx`)
- `FooterContactChannels` moves from the end of "Shop with us" to the end of "Visit & contact us",
  after the `<address>`.
- That column now also renders when the vendor has no address, phone or email but does have at
  least one contact channel, so the icons never disappear. "Shop with us" keeps its links and
  loses only the icon row.

**D. Payment logos** (`public/payment-methods/*.svg`)
- The five files are replaced in place, with the same names and `PAYMENT_BADGE_DETAILS`
  unchanged. Each becomes a 48x30 `viewBox` SVG: the white rounded tile the placeholders used,
  with the brand's Simple Icons glyph (simpleicons.org, CC0) centred inside and filled with that
  brand's Simple Icons hex colour.
  - No `<text>` element, and an `aria-label` naming the brand with no "(placeholder)".
  - A comment naming the Simple Icons slug and saying official artwork may replace the file
    under the same name.
- Simple Icons slugs to use: `visa`, `mastercard`, `americanexpress`, `applepay`, `googlepay`.
  Build copies the path data from the published Simple Icons SVGs (for example
  `cdn.jsdelivr.net/npm/simple-icons/icons/<slug>.svg`). It does **not** add the `simple-icons`
  package as a dependency. Build records the Simple Icons version used in `build-notes.md`.
- If a slug no longer exists in Simple Icons, Build records it and draws that tile from the
  nearest available glyph. It never invents a logo shape.

**E. Quick Shop hint** (`components/cart/ShopYourList.tsx`)
- **With an example product:** `For example: 2 <name> or <name> x2 (up to 100 items, one per line)`, with
  both examples in bold. `<name>` is still the vendor's own in-stock product name
  (`buildListExamples`).
- **Without one:** "For more than one, put 2 before the item or x2 after it (up to 100 items, one
  per line)".
- A test feeds both example forms through `parseListLine` and asserts quantity 2 with identical
  terms, so the hint can never advertise a form the parser rejects.

**F. Carry-forward.** The roadmap change-log row for the `#1161`/`#1162`/`#1119` promotion
(PR #1168, merge `a182d6d`), which `sdd:audit` flagged at Orient.

## Deliberately excluded

- **Changing the list parser** to read a bare trailing number. The owner chose the `x2` example
  instead (Gate 1). Pack sizes like "Eggs 12" are the reason.
- **Official card-brand artwork.** The owner chose Simple Icons. Visa's and Mastercard's guidelines
  prefer their own acceptance marks. Replacing the files later needs no code change, and the files
  say so.
- **Which badges show.** Staff already choose them on `/staff/storefront`. Nothing here changes the
  stored list or the order.
- **Department-scoped autocomplete,** the selector's width, and a custom (non-native) dropdown.
- **Any other footer layout change,** including headings, column order, and the bottom bar.
- **The category page's own pills.** They keep linking to `/categories/<slug>`.

## Open items carried forward

None created by this slice.
