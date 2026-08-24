---
id: p8-5b-department-hero-plan
title: "P8.5b — Department hero (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-24
visibility: internal
summary: Second slice of P8.5 — an icon-led, image-optional department hero with 1-click filtered routing and a WCAG-compliant auto-flip, replacing PromoCarousel in the homepage hero slot.
tags: [p8-5, storefront, hero, accessibility, categories]
---

# P8.5b — Department hero (plan)

**Goal:** replace the homepage hero with an interactive department spotlight that routes straight
into a filtered catalogue — built so it ships **without** waiting on artwork that does not exist,
and without inheriting the reference implementation's accessibility defect.

Second slice of P8.5 (#344), issue **#346**.

## The constraint that shaped this slice

`Category` has no image field. Checked against the schema rather than the brief:

```prisma
model Category {
  id, vendorId, slug, name, parentId, sortOrder, isActive, products
}
```

So a photographic department hero needs a migration **and** artwork. #279 records that no vendor
artwork exists at all — `VendorPromotion.imageKey` is `null` for both seeded vendors. And all 39
images in `docs/ui-ref-revised/` are `images.unsplash.com` URLs, which `next.config`'s
`img-src 'self' data: https://*.nocaped.com` blocks outright. This is the same wall #231 hit when
it removed the hero's hardcoded unsplash photo for failing P7a's CSP.

Waiting for artwork would block this slice indefinitely on the dependency that has kept #279 open.

## Scope (this slice)

### Icon-led, image-optional hero

- Chevron `clip-path` geometry expanding on hover, drawn in the **vendor's own palette** through
  semantic tokens.
- The department mark comes from `components/product/category-icon.ts`'s existing slug-to-lucide
  mapping. It already exists, already falls back to a generic basket for unknown slugs, and its
  header comment records that it was written specifically to avoid needing a schema `iconName`
  field. `DepartmentScroller` already uses it, so the hero and the department strip agree.
- **The panel component takes an optional image and falls back to the icon.** Adding
  `Category.imageKey` later is then purely additive — no rework and no second design. That optional
  parameter is the whole reason this slice does not paint itself into a corner.

Honest cost, recorded here rather than discovered at review: this will not look like the
prototype's photographic hero until artwork exists.

### Departments come from data

`getCategoryRepository().listTopLevel()` — the same source `DepartmentScroller` uses, returning
`{ id, slug, name }` ordered by `sortOrder`.

**Not** the prototype's five hardcoded departments (HMC Halal Butchery, Daily Desi Produce,
Basmati & Atta Sacks, Aromatic Spice Vault, Chilled Dairy & Frozen). Those are one vendor's trade,
and SriMart must not advertise them. #239 is the precedent: the old hero's "Free Delivery Over £30"
was accidentally true for the vendor it was written for and wrong for the other, so the literal was
hiding a data bug rather than merely a copy one.

### Live price callout

Each spotlight names a real product from that department with its real price — never invented copy.
`isFeatured` and `originalPrice` already exist on `Product`.

The naive shape is one `listByCategory(categoryId, { take: 1, isFeatured: true })` per department,
which is roughly nine queries on a page that already runs five. This slice adds **one pure
repository function** that fetches the spotlight products for a set of category ids in a single
query and groups them, taking `prisma` and `vendorId` explicitly like every other function in
`lib/repositories/products.ts`.

### 1-click routing

Clicking a panel navigates to `/categories/<slug>`, removing the duplicate CTAs the brief calls
out.

### Accessibility contract — carried from PromoCarousel, not the prototype

`docs/ui-ref-revised/src/components/FlipBookHero.tsx` auto-advances every 5.5s (`:189`) and pauses
on hover only (`:208`) — no pause control, no keyboard handling, no `prefers-reduced-motion`. That
fails **WCAG SC 2.2.2**, which requires a pause, stop or hide mechanism for moving content lasting
more than five seconds.

`components/layout/PromoCarousel.tsx` already solved exactly this, and its header comment explains
why carrying a known defect into a new component immediately after the phase that put `jsx-a11y` at
`error` would be knowingly shipping one. This slice carries that contract: a real pause control
with an accessible name, rotation paused on hover **and on keyboard focus**, and no rotation at all
under `prefers-reduced-motion`.

**No lint rule checks SC 2.2.2.** `npm run lint` passing is not evidence for any of this.

### PromoCarousel is replaced

The department hero takes the hero slot outright rather than sitting beside the promotions
carousel. Decided by the human at `/propose`, with the trade-off stated at the time.

What that orphans, audited rather than assumed:

- `components/layout/PromoCarousel.tsx` — its only caller is `app/(storefront)/page.tsx`.
- `lib/repositories/promotions.ts` and `lib/promotions-service.ts`
  (`getCurrentVendorPromotions`).
- The `VendorPromotion` model, which would then have no storefront rendering at all.

**There is no staff UI for promotions.** `app/(admin)/staff/` has no promotions page, and
`VendorPromotion` rows are seed-only. So nothing a staff user can do breaks — the surface being
retired was never editable. That makes the removal cleaner than it first appears, and it is worth
stating plainly because the opposite assumption would have made this a much larger slice.

**#279** (promo artwork ships null) and **#280** (promo scheduling is a manual boolean) become moot
and are closed or re-scoped as part of this slice rather than left dangling against a surface that
no longer renders.

Whether the model, its repository and its service are **deleted** or left in place unused is
resolved in `requirements.md`: they are removed, because leaving an unreferenced model and two
unreferenced modules behind is precisely the kind of drift `tests/repository-purity.test.ts` and
#252 exist to prevent. The Prisma model's removal is a migration, and that migration is part of
this slice.

## Deliberately excluded

- **`Category.imageKey` and a staff upload flow.** Additive follow-up; the optional-image parameter
  is the seam that makes it additive.
- **`InteractiveSplitHero`.** The prototype ships two hero variants; this slice builds one.
- **Restoring a promotions surface elsewhere on the page.** If per-vendor campaigns are wanted back
  later, that is a new slice with a staff UI, not a leftover carousel.

## Open items carried forward

- **Artwork.** The hero is image-ready and image-less. Whoever produces department photography
  later swaps the icon for an image with no component change.
- **#279 / #280** are closed or re-scoped by this slice; if the human prefers to keep
  `VendorPromotion` for a future campaign surface, that decision changes R11 and must be taken
  before Build.
