---
id: p1131-storefront-navigation-catalogue
title: "Storefront navigation and catalogue: hidden departments, Fish, department search, list entry (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-17
visibility: internal
summary: "Slice A of the 2026-10-17 website brief (#1131, absorbing #1132, #1133): hidden departments hide their products, Aheed gets a Fish department, category forms keep typed values, header search becomes a department-scoped bar, and the landing page gets a Shopping List entry with a guest sign-in prompt."
tags: [catalogue, departments, categories, header, search, shopping-list, mobile, p10]
related: [p1090-1091-list-notice-and-control-names, p1096-1030-department-spotlights, architecture]
---

# Storefront navigation and catalogue: hidden departments, Fish, department search, list entry (plan)

Slice A of three that came out of the owner's "Website Updates" brief (2026-10-17). Slice B
(`#1134`: Rewards off, feature-switch gating, marketing cookie wording) and slice C (`#1135`:
free-text custom lines) are separate specs. `#1132` (header search) and `#1133` (Shopping List
icon) were filed separately and then absorbed here, because search reads the department list this
slice changes and the landing header is the same component.

**Goal:** the owner can take five departments off the storefront and bring them back, add a Fish
department, and shoppers can search inside one department from a header bar that looks and works
like the Amazon pattern the owner supplied. Everything is Aheed data; no vendor name enters code
(ADR-004).

## What Orient found, which the requirements rest on

These are facts about the repository on 2026-10-17, so the validator need not re-derive them.

1. **Hiding a department does not hide its products today.** `Category.isActive` is read by the
   category listings (`lib/repositories/categories.ts`), but the storefront product reads in
   `lib/repositories/products.ts` filter only `Product.isActive`. A product in a deactivated
   department still appears in `/search`, the featured and new-arrival rows, `/products/<slug>`,
   the sitemap and shop-your-list matching. Deactivating the five departments as asked would
   have changed the navigation and nothing else.
2. **The staff form refuses to hide a department that has active products or subcategories**
   (`updateCategoryForVendor`, "Deactivate or move them first", #159). The five departments all
   have products, so the owner cannot hide them from `/staff/categories` at all.
3. **The header's search icon is decorative.** `components/layout/SearchSuggest.tsx` renders a
   `lucide` `Search` glyph with `aria-hidden` inside the input; there is no submit button, so
   "search works when users click the search icon" is a missing control, not a broken one. Enter
   already submits the surrounding `GET /search` form.
4. **`/search` already scopes by department.** `?category=<slug>` resolves a department to itself
   plus its active children (`app/(storefront)/search/page.tsx`), and ignores an unknown slug. The
   header only has to send the parameter.
5. **The landing header shows no search and no Shop List link** (P8.5f: the postcode checker takes
   the search slot, and `Header.tsx` hides "Shop List" when `isLanding`). That is why the owner
   sees no Shopping List entry on the landing page.
6. **A guest on `/shop-your-list` is shown no way to save and no reason.** `canSave` gates the
   save form and nothing renders in its place. `/account/lists` redirects a guest to `/login`.
   `/login` has no return-to parameter; a successful sign-in lands on `/account`.
7. **No open issue describes the "category creation and selection" bug.** Reading the code found
   one candidate defect that fits the symptom: `CategoryForm` uses uncontrolled inputs under
   `useActionState`, and `saveCategory` returns only an error string, so React 19's post-action
   form reset clears every field the user typed whenever a save is refused (duplicate web
   address, invalid parent). The spec fixes that and requires Build to reproduce the owner's
   exact symptom first, so a second defect is not left behind (R13).

## Scope (this slice)

**A. Department visibility is real.** One shared Prisma predicate, "visible category", means the
category is active and, if it has a parent, the parent is active too. It is applied to every
storefront product read in `lib/repositories/products.ts` that filters `isActive: true`, to
`getCategoryBySlug` (so a hidden department's page and a subcategory under a hidden department
both 404), and to `app/sitemap.ts` through those reads. A source-scanning test (the same
technique as `tests/repository-purity.test.ts`) fails if a storefront product read omits it, so a
future read cannot quietly reintroduce the leak. Re-enabling is the existing "Visible in the
shop" checkbox on `/staff/categories/<id>`, and it restores everything because nothing was
deleted or rewritten. That includes a department's promotion: the landing carousel builds its
slides and campaign lookups from the visible departments only (`app/(landing)/page.tsx`), so a
hidden department's promotion drops out of the carousel while its `DepartmentCampaign` row stays
and returns with the department (R6a). It is asserted, not assumed.

**B. Staff can hide a department that has products.** The "still has N active products" refusal
in `updateCategoryForVendor` is removed, because (A) is what makes hiding safe: the products are
not touched, they stop being reachable. The form instead says, in a non-blocking note, how many
products and subcategories the change will take off the storefront. This reverses a #159 rule
deliberately; the rule existed to avoid silently rewriting unseen rows, and nothing is rewritten
any more. It is the one place this slice changes existing behaviour.

**C. Fish department.** A top-level `Fish` category (slug `fish`) with two subcategories, `Fresh
Fish` (`fresh-fish`) and `Frozen Fish` (`frozen-fish`), for Aheed. Delivered two ways: the dev seed
(`prisma/seed.ts`) gains them so a clean local database has them, and a one-off,
dry-run-by-default, idempotent script (`scripts/apply-department-changes.ts`) applies the Fish
creation, the five hides and the new search placeholder to a named vendor on staging and
production. The script is run by the
user, not by CI, and never by this assistant against production (project memory: production
commands need the user). The seed does **not** hide the five departments; local fixtures and tests
rely on their products.

**D. Category forms keep what the user typed.** `saveCategory` returns the submitted values with
an error, and `CategoryForm` renders them as defaults, so a refused save leaves the form as it
was. The same candidate defect is checked in the other staff catalogue forms that share the
pattern, and fixed only where it reproduces (R13).

**E. New categories reach every list.** An end-to-end check, not new code unless it fails: a
department and a subcategory created at `/staff/categories` appear in the header department
selector, `/categories`, the landing hero, the staff product form's category picker, and
`/search`'s `category` filter, on the next request with no deploy.

**F. Header search.** One `<form method="GET" action="/search">` holding, left to right: a native
`<select name="category">` ("All Departments" first, then every active top-level department in
`sortOrder`), the existing `SearchSuggest` input (`name="q"`), and a real
`<button type="submit">` carrying the search icon with the accessible name "Search". A native
select is scrollable when long, is the Amazon pattern, works with JavaScript off, and gives
mobile its own picker. The list is read from `getCategoryRepository().listTopLevel()`, which is
request-memoised and already filters inactive departments, so new departments appear and hidden
ones vanish with no extra code. The placeholder is the exact text the owner gave; it replaces the
vendor `searchPlaceholder` for Aheed: the same script writes it to `VendorConfig.searchPlaceholder`
(the field `/staff/storefront` already edits, limit 80 characters), and the code default
`Search products…` stays as it is, vendor-neutral.
On `/search` the select shows the department already in the URL. Desktop widens the field to take
the free space; below `sm` the bar keeps one row, the select truncates, and the button keeps the
44px tap target.

**G. Shopping List entry and guest prompt.** `Header.tsx` stops hiding "Shop List" on the landing
page, so the icon is there. On `/shop-your-list`, a guest who has matched a list sees a sign-in
prompt where the save form would be, linking to `/login`, instead of nothing. Signed-in users see
exactly what they see now.

## Deliberately excluded

- **Search on the landing page.** P8.5f gave that slot to the postcode checker and nothing here
  changes it; the owner asked for the icon on the landing page, not the bar. If they want the bar
  there too it is a one-line follow-up in `Header.tsx`.
- **Department-scoped suggestions.** The autocomplete keeps searching the whole store; only the
  submitted search is scoped. Scoping `/api/search/suggest` is a route-contract change with its
  own tests.
- **A return-to path after sign-in.** The prompt links to `/login`, and sign-in lands on
  `/account`, as it does for every other entry. Adding `next` handling touches auth redirects
  (open-redirect risk) and is its own slice.
- **Carts, orders and bundles that already hold a hidden-department product.** Hidden means "not
  browsable". An existing cart line still checks out, and a bundle containing one still lists.
  Reconciling those is a decision for the owner and is recorded below.
- **A department image, subcategory icons beyond what `category-icon` already derives, and Fish
  products.** The department ships empty.
- **SriMart.** No SriMart data is changed; the script takes a vendor argument and the owner chose
  Aheed only.
- **Slice B and C items:** Rewards visibility, feature-switch gating, cookie wording, free-text
  lines, and the "existing free-text that is broken" report (owner deferred it).

## Decisions made on the owner's behalf, to confirm at approval

1. **Hide means products too** (A). The alternative, hiding only the navigation, is what the data
   change alone would have done; the owner's "temporarily hide" reads as a shop that no longer
   sells those items.
2. **Remove the staff deactivation refusal** (B), rather than ship a script as the only way to
   hide a department.
3. **Fish is created by seed plus script, not by a migration.** The repo's migrations are DDL
   (CLAUDE.md: Prisma migrations run in CI against `DIRECT_URL`); a data migration would run on
   every vendor and database.

## Open items carried forward

- **Owner's exact "category creation and selection" symptom** is unknown (R13 makes Build find
  it). If reproduction shows a defect outside the forms touched here, it is recorded on `#1131`
  and fixed only if small; otherwise it becomes its own issue.
- **Hidden-department products already in carts or bundles** (see excluded).
- **Search bar on the landing page** and **department-scoped suggestions**, above.
