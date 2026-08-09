# P3a — Cart foundation (requirements)

Make the inert "Add to Cart" real (issue #93, epic #86; first slice of P3). Vendor-scoped cart
behind the repository seam, guest + authenticated identity, merge on sign-in. No checkout, no
orders, no payment — those are P3b/P3c.

R1. `prisma/schema.prisma` defines `Cart(id, vendorId, userId String?, guestToken String?,
    createdAt, updatedAt)` with an FK to `Vendor` and an optional FK to `User`
    (`onDelete: Cascade` from `Vendor`), plus `@@unique([vendorId, userId])`,
    `@@unique([vendorId, guestToken])` and `@@index([vendorId])`. `npx prisma validate` exits 0.

R2. `prisma/schema.prisma` defines `CartItem(id, cartId, vendorId, productId, quantity Int,
    createdAt, updatedAt)` with FKs to `Cart` (`onDelete: Cascade`), `Vendor` and `Product`, a
    `@@unique([cartId, productId])` (one row per product per cart) and `@@index([cartId])`.
    `CartItem` stores **no price field** of any kind.

R2a. `VendorConfig` gains `deliveryFeePence Int @default(349)`, `freeDeliveryThresholdPence Int?`
     (null = free delivery never offered) and `minimumOrderPence Int @default(0)` (0 = no minimum).
     The Prisma-level defaults make a newly-inserted vendor valid without the seed supplying values.
     `prisma/seed.ts` sets explicit values for both Aheed and SriMart, and remains idempotent.

R3. A plain additive migration (two new tables plus the three nullable/defaulted `VendorConfig`
    columns, no backfill of existing data required) applies cleanly with `prisma migrate deploy`
    against a database already at the current head.

R4. `lib/cart-identity.ts` exports the request's cart identity: it returns the authenticated
    `userId` when a Better Auth session exists, otherwise the guest token from the
    `aheed_cart` cookie, otherwise `null` (no identity yet). The cookie it issues is `HttpOnly`,
    `Secure`, `SameSite=Lax`, **host-only (no `Domain` attribute)**, and its value is an opaque
    UUID that appears in no URL, log line, or rendered HTML.

R5. No `Cart` row is created and no cookie is set by merely viewing any page: after requesting `/`,
    a category page and a product page as a fresh anonymous client, `SELECT count(*) FROM "Cart"`
    is unchanged and no `aheed_cart` cookie is present in any response.

R6. `lib/repositories/cart.ts` exports `getCartRepository()` following `lib/repositories/reviews.ts`'s
    shape: constructed fresh per call, resolving `getCurrentVendorId()` once per instance, with every
    query filtered by that `vendorId`. It exposes at minimum `getSummary`, `addItem`, `setQuantity`,
    `removeItem`, and `mergeGuestIntoUser`. `app/`, `features/` and `components/` contain no direct
    Prisma import (`npm run lint` passes the existing guard).

R7. Every `Cart` row satisfies "exactly one of `userId` / `guestToken` is non-null" — the repository
    never creates a row with both set or neither set, covered by unit tests (R14).

R8. Adding a product already in the cart increments that row's `quantity` rather than creating a
    second row; the resulting quantity is capped at that product's `Inventory.quantity`, and
    quantity can never be set below 1 (removal is an explicit remove, not a decrement to 0).

R8a. `Product.inventory` is optional in the schema. A product with **no `Inventory` row** is treated
     as **out of stock** (effective stock 0) everywhere stock is consulted — add, quantity cap, and
     the R12 button state. It is never treated as unlimited.

R9. The repository exposes the three shopper-selectable resolutions, each deleting the guest cart and
    leaving exactly one cart for the identity, and each **idempotent** (running it twice equals
    running it once):
    - `COMBINE` — per product, guest + saved quantities summed and capped at that product's
      `Inventory.quantity`; products only in the guest cart are moved across.
    - `KEEP_SAVED` — the saved cart is untouched; guest items are discarded.
    - `KEEP_NEW` — the guest cart's items replace the saved cart's items.

R10. A merge decision is **pending** exactly when a request carries both a session and an
     `aheed_cart` guest cookie **and both carts contain at least one item**. While pending, nothing
     is merged or deleted, and the **saved (account) cart is the active cart** for the header count
     and `/cart` line items.

R10a. When there is nothing to decide, no prompt is shown and resolution is automatic: if the saved
     cart is empty (or absent) the guest cart is adopted for the user; if the guest cart is empty it
     is deleted. In both cases the `aheed_cart` cookie is cleared.

R10b. Detection and resolution add **no Better Auth sign-in hook** — `lib/auth.ts` gains no cart or
     merge logic; the pending state is derived on cart read.

R10c. `app/(storefront)/cart/page.tsx` renders a merge-choice prompt while a decision is pending,
     offering all three resolutions in R9 with the item counts of each cart shown, and no option
     pre-selected/auto-applied. Choosing one applies it via the `resolve-merge.ts` server action,
     clears the `aheed_cart` cookie, and re-renders the resulting single cart. The `aheed_cart`
     cookie is cleared **only** as part of an applied resolution.

R11. `features/cart/` contains the mutations as server actions — `add-to-cart.ts`,
     `update-quantity.ts`, `remove-item.ts`, `resolve-merge.ts` — each resolving identity via
     `lib/cart-identity.ts`, writing only through `getCartRepository()`, and revalidating so the
     header count and `/cart` reflect the change without a manual reload. `resolve-merge.ts` rejects
     any resolution value outside the three in R9.

R12. An `AddToCartButton` client component renders on product cards and on the product detail page;
     inside `ProductCard`'s wrapping `<Link>` a click adds to the cart and **does not navigate**
     (the handler calls `preventDefault()`/`stopPropagation()`). It is disabled with a visible
     out-of-stock state when `Inventory.quantity` is 0.

R13. `components/layout/Header.tsx` renders the **live item count** for the current identity's cart
     in place of the `aria-label="Cart (available soon)"` inert button, links to `/cart`, shows no
     count badge when the cart is empty or absent, and adds no per-request DB query for visitors with
     no cart identity.

R14. A `CartDrawer` component follows `docs/ui-ref/src/components/CartDrawer.tsx`'s structure — a
     right-side slide-out overlay with a header item count, a delivery-incentive banner, a scrollable
     line-item list (image, name, unit price from `Product`, quantity stepper, remove control, line
     total), a **subtotal** in integer pence via the existing `formatPrice`, and the reference's empty
     state with a browse link. It opens from the header cart button and closes via its close control
     and its backdrop.

R14b. `app/(storefront)/cart/page.tsx` exists as the canonical cart URL, rendering the same line
     items and subtotal from the same server data as R14, and hosting the R10c merge prompt. The
     drawer links to it.

R14c. The free-delivery banner is driven **entirely by vendor data**: it reads
     `VendorConfig.freeDeliveryThresholdPence` and shows remaining-to-threshold with progress, or the
     unlocked state at/above it. When that column is `NULL` the banner does not render at all. No
     threshold constant appears in any component (`grep` for a numeric threshold literal finds none),
     and locality wording comes from `VendorConfig.localityName`, never a hardcoded place name.

R14a. A cart line whose product has since become **unavailable** (`Product.isActive = false`, or
     effective stock 0 per R8a) renders as unavailable, is **excluded from the subtotal**, and stays
     individually removable. It never silently disappears and never contributes to the total.

R15. `tests/cart.test.ts` passes (`npx vitest run tests/cart.test.ts`), covering as pure functions:
     quantity increment on re-add, stock capping, all three R9 resolutions (`COMBINE` sum-and-cap,
     `KEEP_SAVED`, `KEEP_NEW`), their idempotency, the R10 pending-vs-not-pending predicate
     (including both no-decision cases in R10a), and the exactly-one-identity invariant. Tests mock
     `@/lib/db` (the `@prisma/client/wasm` specifier is unresolvable under vitest — see `CLAUDE.md`).

R16. Both vendors stay isolated on a seeded environment: a cart built on `srimart-staging.nocaped.com`
     is not visible on `staging.aheedfoodcentre.nocaped.com` and vice versa, for the same signed-in
     user.

R16a. **No vendor-specific values in cart UI.** No cart component contains a hex colour literal, a
     hardcoded delivery threshold, or a hardcoded place name: `grep -nE "#[0-9a-fA-F]{6}"` over the
     cart components returns nothing, and every brand colour is a semantic token from
     `specs/design-system.md`'s mapping table (`bg-primary`, `bg-action`, `text-accent`, …), not a
     mockup hex copied from `docs/ui-ref/`.

R16b. Rendered on SriMart's host, the drawer and `/cart` display **SriMart's** palette, locality and
     delivery threshold with **no component change** — proving the reference design was translated,
     not transcribed.

R17. `specs/architecture.md` records the cart model and identity rule, and `specs/design-system.md`
     is updated — its mockup→token table covers the drawer's elements, and its "cart button renders
     controls that are **inert** until P3 wires a real cart" statement, now false, is corrected. Both
     have front-matter `version`/`updated` bumped; `ARTIFACT_INDEX.md` regenerated to include this
     slice's `plan.md` and matches the committed copy.

R18. `CHANGELOG.md` `[Unreleased]` has an entry naming P3a and referencing `#93` (Gate 4), noting the
     shared-device merge trade and the deferred abandoned-cart cleanup.

R19. The deferred abandoned-guest-cart cleanup is filed as a GitHub issue (not left as a code comment),
     and referenced from `plan.md`'s open items.

R20. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` and
     `npm run kms:validate` all exit 0, and `npm run build` succeeds with `/cart` server-rendered
     (`ƒ`) rather than statically optimized.
