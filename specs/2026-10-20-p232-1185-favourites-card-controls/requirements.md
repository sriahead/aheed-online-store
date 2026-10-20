# Favourites, and a bare + on the product card (requirements / acceptance criteria)

Slice 1 of the Quick Shop programme (Gate 1 approved 2026-10-20). Closes `#232` (Favourites, which
that issue calls a wishlist) and `#1185` (the product card's add control). Favourites are
**authenticated-only** by owner decision; a guest sees the heart as a link to `/login`. The reasoning
behind every requirement below, and the list of what is deliberately excluded, is in `plan.md`.
`#1186` and `#1187` are separate slices; `#1184` is deferred.

R1. `prisma/schema.prisma` contains a `Favourite` model with fields `id`, `vendorId`, `userId`,
    `productId` and `createdAt`; relations to `Vendor`, `User` and `Product` each declaring
    `onDelete: Cascade`; a `@@unique([vendorId, userId, productId])`; and an
    `@@index([vendorId, userId, createdAt])`. It declares no `Json` field.

R2. A new directory exists under `prisma/migrations/` whose `migration.sql` creates the
    `Favourite` table and its two constraints, and whose statements are additive only: no line in
    that file begins with `DROP`, and the file names none of `Order_orderNumber_trgm_idx`,
    `Order_guestEmail_trgm_idx` or `User_email_trgm_idx`.
    (Deliberately a property of the generated SQL, not of the live database: `#765` records that
    those three indexes are already absent from dev, staging and production, so asserting their
    presence would fail for a reason this slice did not cause.)

R3. `lib/repositories/favourites.ts` exists, and every function it exports takes a Prisma client as
    its first parameter and `vendorId` plus `userId` as explicit parameters. It imports nothing from
    `next/headers`, `@/lib/tenant` or `@/lib/auth`.

R4. `lib/favourites-service.ts` exports a `getFavouritesRepository()` factory that resolves the
    client and vendor per call and holds no module-level client or vendor cache.

R5. Neither `lib/repositories/favourites.ts`, `lib/favourites-service.ts` nor
    `features/favourites/toggle-favourite.ts` references `getPrismaWs`.

R6. A pure exported predicate (in `lib/favourites.ts`) returns `true` for an error object whose
    `code` is the string `"23505"` and for one whose `code` is the string `P2002`, and `false` for
    an error with any other code and for a non-object value.

R7. `scripts/verify-favourites.ts` exists and, run against the dev database, exits 0 having
    observed: a toggle-on followed by a second toggle-on for the same
    `vendorId`/`userId`/`productId` leaves exactly one row and reports success both times; a
    toggle-off leaves zero rows; and a raw duplicate insert surfaces an error whose code the R6
    predicate accepts. The script prints the observed `code` value.

R8. `features/favourites/toggle-favourite.ts` carries the `"use server"` directive and every one of
    its exports is an `async function` — no exported constant, type-only export aside.

R9. Calling the toggle action without a session writes no `Favourite` row and returns an outcome
    naming the signed-out case, rather than throwing.

R10. `components/product/ProductCard.tsx` renders a favourite control in each of three states
     driven by a single `favouriteState` prop whose permitted values are `"on"`, `"off"` and
     `"signed-out"`:
     - `"off"` renders a `button` whose accessible name contains the product name and the word
       `favourites`;
     - `"on"` renders a `button` whose accessible name contains the product name and indicates
       removal;
     - `"signed-out"` renders a link whose `href` is `/login` and whose accessible name contains
       the product name.

R11. The favourite control's class list places it at the image block's top-right corner from the
     `sm` breakpoint up, and one 44px box inboard of that corner below `sm`, so it does not overlap
     the existing below-`sm` quick-view button at `ProductCard.tsx` `absolute top-0 right-0`. The
     base-breakpoint offset is expressed with the 44px spacing token (`right-tap`, from
     `--spacing-tap: 2.75rem` in `design-system/tokens/tokens.css`) or its literal equivalent
     `right-11`, and is reset by `sm:right-0`.

R12. `app/(storefront)/categories/[slug]/page.tsx`, `app/(storefront)/search/page.tsx` and
     `components/product/ProductRow.tsx` each pass `favouriteState` to `ProductCard`, resolved from
     one query per page render rather than one per card.

R13. Rendering `AddToCartButton` with `variant="card"` and `disabled` false produces exactly one
     `button` element, and `queryByLabelText(/Decrease quantity/)` and
     `queryByLabelText(/Increase quantity/)` both return null.

R14. That single `button`'s accessible name equals the `label` prop passed to it, and a card
     rendered from `ProductCard` passes a `label` containing the product name.

R15. Rendering `AddToCartButton` with `variant="card"` and `disabled` true produces a disabled
     `button` whose accessible name contains the product name and whose text content is
     `Out of stock`, and `ProductCard` renders no quantity stepper when `product.inStock` is false.

R16. The card's add control and the favourite control each have a hit area of at least 44 CSS pixels
     in both dimensions below the `lg` breakpoint, asserted from their class lists.

R16a. The favourite control carries `data-tap-surface="product-card-favourite"`, and
     `tests/tap-targets.test.ts`'s `surfaces` map contains an entry for
     `components/product/ProductCard.tsx` listing that value.

R16b. `specs/design-system.md`'s "Touch targets" section lists the product card's **single** add
     control and its favourite control among the storefront's primary shopping controls, and no
     longer names a pre-add minus and plus on the card.

R17. `app/(storefront)/account/favourites/page.tsx` exists, exports
     `dynamic = "force-dynamic"`, redirects an unauthenticated request to `/login`, and renders
     `PageContainer` with an explicit `width` prop and no hand-written `mx-auto`/`max-w-`/`px-`
     container.

R18. With no favourites saved, that page renders the exact text
     `No favourites yet. Tap the heart icon on any product to add it here.`

R19. `app/(storefront)/account/page.tsx` renders a link whose `href` is `/account/favourites`.

R20. Under `npm run preview`, signing in, tapping the heart on a product, and loading
     `/account/favourites` shows that product; tapping the heart again and reloading shows the empty
     state from R18.

R21. `AddToCartButton`'s `icon`, `full` and `drawer` variants each still render their existing
     controls: the `drawer` and `full` variants keep a working quantity picker, verified by
     rendering each one.

R22. `specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md`'s **R6** — the wishlist obligation,
     which currently reads "Deferred — not satisfied by the artifact" and "expected to fail until
     #232 ships" — states that it is satisfied by the Favourites entry points shipped here and in
     `#1187` rather than by a dedicated header control, and retains its reference to `#232`.
     (`#232`'s own body cites this obligation as "R1"; the requirement is R6. The misattribution is
     noted in `plan.md` and is not propagated by this slice.)

R23. No file added or changed by this slice under `app/`, `components/`, `features/` or `lib/`
     contains a vendor's name or a grocery-specific example in user-facing copy or in a default
     parameter value.

R24. The favourite control and the card's add control are confirmed rendering correctly on a second
     vendor (SriMart) as well as Aheed, under `npm run preview`.

R25. `npm run kms:validate` exits 0, and `npm run kms:assemble:internal` followed by a real Next
     build in `kms/site-internal` both succeed, with the build's own exit status read directly.

R26. `CHANGELOG.md` is updated on this branch (Gate 4).

R27. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` and
     `npm run format:check` all pass after this slice.
