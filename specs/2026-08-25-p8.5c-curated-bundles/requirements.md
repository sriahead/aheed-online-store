# P8.5c — Curated Bundles (requirements / acceptance criteria)

Closes out #347 (P8.5c), approved at `/propose` 2026-08-25. One-paragraph version of `plan.md`: new
vendor-scoped `Bundle`/`BundleItem` models let staff curate a named list of existing products;
`/categories` renders each active bundle with its constituents and a **derived** total; "Add all N
to basket" expands the bundle into ordinary cart lines through the existing `addItems` transaction.
**This slice makes no savings claim anywhere** — the pricing that would justify one is P8.5d (#348).

Reuses `addCartItems`/`sumLinesByProduct` (`lib/repositories/cart.ts`, P3d), the
`lib/<name>-service.ts` facade split (#252/P8.1b), and P8.5e's banner-upload shape.

**Schema & data**

R1. `prisma/schema.prisma` defines `Bundle` with `id`, `vendorId`, `slug`, `name`, `tagline`
    (`String?`), `imageKey` (`String?`), `altText` (`String?`), `isActive` (`Boolean @default(true)`),
    `sortOrder` (`Int @default(0)`), `createdAt`, `updatedAt`, plus `@@unique([vendorId, slug])` and
    `@@index([vendorId, isActive])`.

R2. `prisma/schema.prisma` defines `BundleItem` with `id`, `bundleId`, `productId`, `quantity`
    (`Int`), `sortOrder` (`Int @default(0)`), and `@@unique([bundleId, productId])`. `bundleId` is a
    `Bundle` FK with `onDelete: Cascade`; `productId` is a `Product` FK.

R3. Neither the `Bundle` nor the `BundleItem` model block declares any field whose name contains
    `price`/`Price` or `saving`/`Saving` — no stored bundle price, no stored saving. (Checked as an
    absence of matching *field declarations* within the two model blocks, not as a bare word search
    over the file: the schema comments and `plan.md` name these fields deliberately to explain why
    they are absent, and a bare grep would reward deleting that rationale.)

R4. A migration exists creating both tables, containing only DDL generated from the schema
    declarations — no hand-authored statements. `npx prisma migrate status` reports the migration
    applied and the schema in sync, with no drift.

R5. `prisma/seed.ts` seeds at least two bundles for Aheed **and** at least one for SriMart, each
    with at least three `BundleItem` rows pointing at products belonging to that same vendor. Re-running
    the seed is idempotent (no duplicate bundles by `(vendorId, slug)`).

**Repository layer**

R6. `lib/repositories/bundles.ts` exports `listActiveBundles`, `getBundleWithItems`,
    `listBundlesForAdmin`, `upsertBundle`, `setBundleItems` and `deleteBundle`, each taking `prisma`
    (and `vendorId` where the operation is vendor-scoped) as explicit parameters and reading no
    request context.

R7. `lib/repositories/bundles.ts` contains no *value* import of `next/headers`, `@/lib/tenant`,
    `@/lib/auth` or `@/lib/auth-rbac`; `npx vitest run tests/repository-purity.test.ts` passes with
    the file in its scanned set.

R8. `lib/bundles-service.ts` exists and provides the request-scoped facade (resolves the live Prisma
    client and current vendor and wraps the pure functions). No such facade lives inside
    `lib/repositories/bundles.ts`.

R9. `listActiveBundles` issues a bounded number of queries independent of bundle count — it does not
    issue one query per bundle to fetch constituents. Verified by count, not by inspection alone.

**Derived pricing**

R10. A pure function (e.g. `lib/bundle-pricing.ts`'s `bundleTotalPence`) computes a bundle's total as
     the sum over its items of `Product.basePrice * BundleItem.quantity`, in integer pence, with no
     floating-point arithmetic anywhere in the calculation. Unit-tested including a case where one
     item has `quantity > 1`.

R11. `bundleTotalPence` excludes unavailable items — those whose `Product.isActive` is false or
     whose `Inventory.quantity` is 0 — from both the total and the returned constituent list, so the
     displayed total matches what the add action would actually put in the cart at that moment.

**Storefront rendering (`/categories`)**

R12. `app/(storefront)/categories/page.tsx` renders a bundles section positioned after the
     department-scroller `<section>` and before the "New Arrivals" `ProductRow`.

R13. Each rendered bundle shows its `name`, its `tagline` when present, one entry per available
     constituent showing the product name and the bundle's quantity for it, and the derived total
     formatted through the existing `formatPrice`.

R14. **No _bundle-level_ savings claim renders**: a bundle's card shows exactly one price — the
     derived total — with no struck-through bundle price, no bundle-level "Save £X" text, and no
     stored-vs-derived comparison.

     **This requirement does not extend to a constituent product's own pre-existing discount badge.**
     `ProductCard` has rendered `Save {formatPrice(saving)}` and a `line-through` `originalPrice`
     since P2.5b1 for any product where `originalPrice > basePrice` (`components/product/ProductCard.tsx:88,134`).
     That badge is a true statement about that product, predates this slice, and must keep working.
     A check written as a blanket "no `/save/i` in the bundles section" would fail the moment a
     bundle contains a product that is genuinely on offer, and the only way to pass it would be
     deleting a correct feature — so the check must target the bundle's own price row, not the
     section's text.

R15. A bundle with `imageKey` null renders its card fully — name, constituents, total and the add
     control all present — with no broken-image element and no empty reserved image box.

R16. `app/(landing)/page.tsx` is unchanged by this slice (`git diff` against the base branch shows
     no modification to that file).

R17. A bundle with `isActive: false`, or one whose every constituent is unavailable, does not render
     on `/categories`.

**Add to cart**

R18. The add action resolves the bundle's constituents to `MergeLine[]` and calls the existing
     `addItems`; it does not open its own `$transaction` and does not write `CartItem` rows directly.

R19. `lib/repositories/cart.ts`'s `addCartItems` signature and body are unchanged by this slice
     (`git diff` shows no edit to that function).

R20. Adding a bundle whose constituent is already in the shopper's cart results in the cart quantity
     being the sum of the two, clamped to available stock — the behaviour `sumLinesByProduct` plus
     `clampQuantity` already provide, asserted here so a regression is caught.

R21. When one or more constituents are unavailable at add time, the action adds the available ones
     and the resulting page communicates which were not added, by name. It does not silently add a
     partial bundle and it does not refuse the whole bundle.

R22. A guest adding a bundle receives a guest token only on the add (not on render), matching
     `addListToCart`'s lazy-creation rule — rendering `/categories` with bundles present writes no
     `Cart`, `CartItem` or cookie.

R23. The add action's bundle id is untrusted input: an id belonging to another vendor, or to nothing,
     results in no cart write and no error page.

**Staff panel (`/staff/bundles`)**

R24. `/staff/bundles` lists the current vendor's bundles with name, constituent count, active state,
     and a link to edit each.

R25. `/staff/bundles` is gated by `requireVendorRole("ADMIN")` and its refusal branch renders
     `<PanelRefusal>` — a signed-in non-staff account receives that markup, not a blank shell, not
     `null`, and not a 500.

R26. An ADMIN can create a bundle, set its name/slug/tagline/active state, add constituent products
     with integer quantities, remove one, and reorder — each persisted and visible on reload.

R27. Every file under `features/admin/` added by this slice with `"use server"` exports **only**
     async functions (no `export const`), per CLAUDE.md's server-action rule.

R28. Submitting a bundle with a `quantity` below 1, a non-integer quantity, or a `productId`
     belonging to another vendor returns an error result and writes nothing.

R29. Submitting a bundle whose `slug` collides with an existing bundle for the same vendor returns a
     handled error result, not an unhandled Prisma unique-constraint exception.

**Banner image**

R30. `imageKey` values are accepted only in the shape `bundles/{bundleId}/{uuid}.webp`; a key for a
     different bundle id, a missing `.webp` suffix, or an extra path segment is refused rather than
     normalised.

R31. Saving a bundle with `imageKey` set and `altText` empty or omitted returns an error result and
     writes neither field.

R32. The uploader imports `IMAGE_CONTENT_TYPE`, `IMAGE_QUALITY`, `MAX_IMAGE_EDGE_PX` and
     `fitWithinEdge` from `@/lib/product-image` rather than redeclaring them.

**Gates & documentation**

R33. `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run format:check` and
     `npm run build` all exit 0.

R34. `npm run kms:validate` exits 0 (this slice's `plan.md` front-matter `id` contains no literal
     dot), and `ARTIFACT_INDEX.md` is rebuilt to include this slice's `plan.md`.

R35. `git diff <base>..HEAD -- CHANGELOG.md` is non-empty and describes this slice, including that it
     ships no savings claim.

R36. `specs/roadmap.md` gains a change-log row for the **PR #371** promotion (carry-forward from the
     previous loop), citing `PR #371`.

R37. `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` succeeds —
     this slice adds files under `specs/`, which the root gates do not cover.
