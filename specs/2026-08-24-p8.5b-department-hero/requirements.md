# P8.5b — Department hero (requirements / acceptance criteria)

Second slice of **P8.5 — Storefront Conversion Overhaul** (#344), issue **#346**. Replaces the
homepage hero with an icon-led, image-optional department spotlight that routes into a filtered
catalogue, carrying `PromoCarousel`'s accessibility contract rather than the reference
implementation's. Retires `VendorPromotion` and its rendering. See `plan.md` for why the hero ships
without photography and why the retirement is smaller than it sounds.

## Hero content and data

R1. The hero renders one panel per **top-level category returned by
    `getCategoryRepository().listTopLevel()`**, in `sortOrder`. No department name, count or
    ordering is hardcoded in the component — `grep` for the prototype's department strings
    ("HMC Halal Butchery", "Daily Desi Produce", "Basmati & Atta Sacks", "Aromatic Spice Vault",
    "Chilled Dairy & Frozen") across `app/` and `components/` returns nothing.

R2. Each panel's mark comes from `components/product/category-icon.ts`'s `categoryIcon(slug)`. A
    category whose slug is absent from that map renders the generic fallback rather than no mark.

R3. The panel component accepts an **optional** image and renders the icon when it is absent. The
    prop exists and is exercised by a test passing an image, so that adding `Category.imageKey`
    later requires no change to the component's contract.

R4. Each panel names a real product from its own department with that product's real price, read
    from the database. No product name, price or offer string is hardcoded.

R5. The spotlight products are fetched by **one** query for all departments, not one query per
    department. The function is a pure export of `lib/repositories/products.ts` taking `prisma` and
    `vendorId` as explicit parameters.

R6. A vendor with no active top-level categories renders no hero rather than an empty well — the
    same principle `app/(storefront)/page.tsx` already applies to the promotions slot.

## Routing and geometry

R7. Activating a panel navigates to `/categories/<slug>` for that department. The control is a real
    link, reachable and activatable by keyboard.

R8. The hero uses `clip-path` chevron geometry that expands on hover, and every colour resolves
    through a semantic design token. No hex literal, `rgba(...)` or Tailwind palette colour (for
    example `emerald-*`, `slate-*`) is introduced by this slice on a non-comment line.

R9. The hero renders with visibly different colours for the two seeded vendors: a request carrying
    `Host: srimart-staging.nocaped.com` and one carrying Aheed's host differ in the hero's computed
    colour values.

## Accessibility — WCAG SC 2.2.2

R10. The hero auto-advances, and offers a **pause control with an accessible name**. Rotation stops
     when it is activated.

R11. Rotation pauses on pointer hover **and** on keyboard focus entering the hero, and resumes when
     both end.

R12. Under `prefers-reduced-motion: reduce` the hero does not rotate at all.

R13. Each panel is reachable by keyboard in DOM order, and the currently-spotlit panel is
     programmatically determinable — not conveyed by colour alone.

## Retiring VendorPromotion

R14. `components/layout/PromoCarousel.tsx`, `lib/repositories/promotions.ts` and
     `lib/promotions-service.ts` are deleted, and `app/(storefront)/page.tsx` no longer imports
     `getCurrentVendorPromotions`. `grep -rn "PromoCarousel\|getCurrentVendorPromotions\|promotions-service" app components lib features` returns no match outside generated files.

R15. The `VendorPromotion` model is removed from `prisma/schema.prisma` by a migration in this
     slice, and `prisma/seed.ts` no longer writes promotion rows. `npx prisma migrate diff` reports
     no drift between schema and migrations.

R16. Issues **#279** and **#280** are closed or re-scoped, with a comment naming this slice as the
     reason, rather than left open against a surface that no longer renders.

## Regression

R17. `tests/repository-purity.test.ts` and `tests/repository-vendor-scoping.test.ts` both pass —
     the new spotlight function takes `vendorId` explicitly and imports no request context.

R18. Under `npm run preview`, `/` returns 200 for both seeded vendors and the department strip,
     product rows and trust strip below the hero all still render.

R19. No image URL pointing at a host outside `'self'`/`https://*.nocaped.com` is introduced —
     `grep -rn "unsplash\|http://\|https://" app/\(storefront\)/page.tsx` and the new hero component
     return no image sources.

R20. `CHANGELOG.md` updated (Gate 4).

R21. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
