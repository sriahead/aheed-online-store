# P8.5a — Product card upgrade (requirements / acceptance criteria)

First slice of **P8.5 — Storefront Conversion Overhaul** (#344), issue **#345**. Delivers the
brief's skewed product card against real data: angular geometry expressed in semantic tokens, a
quantity stepper that reflects and mutates the real cart with its writes coalesced, and a low-stock
badge from the `Inventory` join that already exists. No schema migration. See `plan.md` for why
coalescing is a requirement rather than a refinement.

## Geometry and motion

R1. `components/product/ProductCard.tsx` renders a perspective wrapper containing a card element
    skewed `-2deg` on the X axis, with an inner content element counter-skewed `+2deg`. On hover
    both resolve to `0deg` and the card additionally translates `-6px` on the Y axis.

R2. Every transition introduced by this slice names its properties explicitly. `grep -rn
    "transition-all" components/product/ app/globals.css` returns no matches, and no
    element-selector transition rule (e.g. `a, button { transition: ... }`) is added to
    `app/globals.css`.

R3. No colour literal is introduced by this slice in `components/product/ProductCard.tsx` or in the
    CSS supporting it. Specifically, the hover shadow's colour is expressed through a design token
    or a `color-mix()`/`currentColor` derivation of one — not a hardcoded `rgba(27, 94, 32, …)`,
    hex, or Tailwind palette colour such as `emerald-*`.

R4. `app/globals.css` contains an `@media (prefers-reduced-motion: reduce)` block that removes the
    skew, the hover straighten and the `translateY` lift. This is the repo's first CSS
    reduced-motion block; `PromoCarousel.tsx:55`'s JS `matchMedia` check remains untouched.

R5. The card renders with visibly different colours for the two seeded vendors. A request carrying
    `Host: srimart-staging.nocaped.com` and one carrying Aheed's host return different computed
    values for the card's accent and hover-shadow colours.

## Cart-aware stepper

R6. A product already in the cart renders its **cart quantity** on the card. A product not in the
    cart renders the add affordance, not a zero-quantity stepper.

R7. The `+` and `-` controls change the cart. After the coalescing window elapses, the server-side
    cart quantity for that product matches what the card displays, via
    `features/cart/update-quantity.ts`. Decrementing to zero removes the line.

R8. Rapid consecutive clicks coalesce into a **single** server action call carrying the final
    quantity. A unit test drives N ≥ 3 increments inside the idle window and asserts exactly one
    `updateQuantity` invocation, with the last quantity.

R9. The cart read added to the grid pages is memoised so that one page render issues **one**
    `getSummary()` call, not one per page plus one for the header.

R10. Optimistic display never contradicts the server: if the coalesced `updateQuantity` rejects,
     the displayed quantity reverts to the server value rather than remaining at the optimistic
     one.

## Low stock

R11. `ProductSummary` (`lib/repositories/products.ts`) carries the product's stock quantity and its
     low-stock threshold, both sourced from the existing `Inventory` relation. No Prisma migration
     is added by this slice — `git diff --name-only` against the base shows no new file under
     `prisma/migrations/`.

R12. A card whose stock quantity is greater than zero and at or below its low-stock threshold
     renders a low-stock message naming the count. A card above the threshold renders no such
     message.

R13. The existing out-of-stock behaviour is unchanged: a product with `inStock: false` renders a
     disabled control and no stepper.

## Regression

R14. All four `ProductCard` call sites still render without error:
     `app/(storefront)/categories/[slug]/page.tsx`, `app/(storefront)/search/page.tsx`, and both
     `ProductRow` instances on `app/(storefront)/page.tsx`.

R15. `tests/repository-purity.test.ts` passes — no request-scoped import is added to any
     `lib/repositories/*.ts` file by the `ProductSummary` change.

R16. `CHANGELOG.md` updated (Gate 4).

R17. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
