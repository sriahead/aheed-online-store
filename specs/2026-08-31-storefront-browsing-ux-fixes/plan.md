---
id: storefront-browsing-ux-fixes
title: "Storefront browsing UX fixes: category aggregation, more departments, a shop link, a bigger hero slider (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-31
visibility: internal
summary: Four related storefront browsing gaps found by live review after #494/#489 shipped — a department page shows almost nothing of what it should, the top scroller has too few items to need scrolling, the landing page has no persistent path into the catalogue, and the hero's department slider renders too small to read.
tags: [storefront, catalogue, navigation, ux, landing]
related: [roadmap, storefront-subcategory-navigation]
---

# Storefront browsing UX fixes (plan)

**Goal:** make the storefront's actual browsing experience match what #489's seeded depth and
#494's subcategory links were supposed to unlock — a shopper who lands on a department sees
everything in it, can always find their way in from the homepage, and the hero doesn't waste the
space it's given.

## What is actually true today

Verified against the repo and a live review of staging on 2026-08-31, after #494 shipped:

- **A department page aggregates nothing.** `app/(storefront)/categories/[slug]/page.tsx` calls
  `products.listByCategory(category.id, ...)` — an exact `categoryId` match. Visiting
  `/categories/fruit-veg` shows its 2 directly-assigned curated products only; the products under
  its `fresh-fruit`/`fresh-vegetables`/`herbs-salads` children (including #489's generated set,
  wherever a department has it) never appear there. With only 2 products, `nextCursor` never fires,
  so pagination looks broken when it's actually just never been exercised.
- **`DepartmentScroller` shows exactly 9 items** (the original curated departments), which is not
  enough to overflow a typical desktop viewport — the arrow buttons render but there's nothing to
  scroll to, so the scrolling behaviour is effectively untested by normal use.
- **The landing page (`/`) has no link into `/categories`.** `components/layout/Header.tsx` hides
  its "Shop List" link on the landing route (`!isPortal && !isLanding`, P8.5f's deliberate choice —
  the postcode checker takes that space instead), and there is no other persistent nav element
  pointing at the catalogue. The only way in is the hero's rotating per-department `` "Shop
  {department.name}" `` button, which is one department at a time and easy to miss.
- **The hero's department slider is capped at 28rem.** `app/(landing)/page.tsx`'s grid template is
  `lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]` — the slider column never grows past 448px
  regardless of viewport width, rendering as a small corner element beside the much larger text
  column rather than a genuine second half of the banner.

## Scope (this slice)

**1. Category-page aggregation.** `lib/repositories/products.ts`'s `listProductsByCategory` takes
an array of category ids instead of one (`categoryId: { in: categoryIds }`), and
`app/(storefront)/categories/[slug]/page.tsx` calls it with
`[category.id, ...category.children.map(c => c.id)]`. A subcategory (no children of its own) always
passes a one-element array, so its own page's behaviour is unchanged. `SubcategoryLinks` gains a
leading "All" pill (linking to the current page itself, `aria-current="page"`) so the aggregation is
visually explicit rather than a silent behaviour change.

**2. Four more top-level departments**, real curated rows (not part of #489's generated-scale
catalogue): Frozen Foods, Health & Beauty, Baby & Kids, Pet Supplies — each with two of its own
curated products, matching the shape the original nine had before #489 added subcategories to them.
No `children` on these four; they exist to give the scroller enough rows to need scrolling, not to
extend the generated-catalogue scale test.

**3. A persistent "Shop" link in the header**, visible on every non-portal route including the
landing page (unlike "Shop List", which stays hidden there per P8.5f), pointing at `/categories`.

**4. The landing hero's department slider becomes an even `lg:grid-cols-2` split** instead of the
fixed-`28rem` second column, so it occupies half the hero banner's width on large screens.

## Deliberately excluded

- **Extending the generated catalogue to the four new departments.** They're plain curated rows,
  the same shape the original nine had before #489; wiring them into `generate-catalogue.ts`'s
  round-robin pool is a separate, larger change to a script that slice's own spec scoped tightly.
- **A different navigation pattern for subcategories** (dropdown, mega-menu). #394 remains the
  sitewide-nav slice; this only fixes what a department's own page shows and how big/reachable the
  landing hero and its hero button are.
- **Any change to `SubcategoryLinks`'s empty-state or the subcategory pages themselves** — those
  already work correctly per #494's shipped validation; this only adds the "All" pill and the
  aggregated query behind it.

## Open items carried forward

- None blocking. If the four new departments later want generated-scale depth too, that is a
  natural follow-on to `prisma/generate-catalogue.ts`, not built here.
