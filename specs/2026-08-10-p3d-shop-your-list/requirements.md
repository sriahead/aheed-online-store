# P3d — Shop your list (requirements / acceptance criteria)

Closes out P3 (issue #114, epic #86; follows P3a #93, P3b #96, P3c #99). A shopper pastes a shopping
list, each line is parsed for a quantity and matched against **this vendor's** catalogue by
token-AND on product name, and a mandatory review step turns confirmed lines into cart items in one
transaction. Stateless: no schema change, no migration, no saved lists, no fuzzy matching. See
`plan.md` for why each of those edges is where it is.

R1. `lib/shopping-list.ts` exists and is **pure** — it performs no I/O and no DB access.
    `grep -nE "getPrisma|@prisma/client|fetch\(|cookies\(|headers\(" lib/shopping-list.ts` returns
    nothing. It is unit-tested without a database, matching `lib/cart-rules.ts`.

R2. `lib/shopping-list.ts` exports `parseListLine(raw: string)` returning
    `{ quantity: number; terms: string[] }` for a line with content, and `null` for a line that is
    blank or has no usable terms after normalisation.

R3. `parseListLine` recognises exactly these quantity forms, each yielding `quantity: 2` for
    apples: `2 apples`, `2x apples`, `2 x apples`, `apples x2`, `apples x 2`. The `x` is
    case-insensitive. Any line with no recognised quantity form yields `quantity: 1`.

R4. **A leading bare integer is a quantity only when it is not glued to a unit.** `parseListLine("5kg basmati rice")`
    yields `quantity: 1` with `5kg` retained as a term; `parseListLine("2 apples")` yields
    `quantity: 2`. An explicit `x` form always wins: `parseListLine("2x 5kg basmati rice")` yields
    `quantity: 2` with `5kg` retained as a term.

R5. `parseListLine` normalises terms to lowercase, strips surrounding punctuation (at minimum
    `, . ; :` and matched quotes), splits on whitespace, and drops empty tokens. `parseListLine("Mint Tea, box of 40")`
    yields terms containing `mint`, `tea`, `box`, `of`, `40` with no empty strings and no trailing
    comma on `tea`.

R6. `parseListLine` clamps quantity to the inclusive range `1..99`. A line requesting `1000 apples`
    yields `quantity: 99`; a line requesting `0 apples` yields `quantity: 1`.

R7. `lib/shopping-list.ts` exports `parseList(rawText: string)` which splits on newlines, drops
    blank lines, applies `parseListLine`, and caps the result at **100 lines**, discarding the
    remainder. Input with 150 non-blank lines yields exactly 100 parsed lines. The original line
    text is preserved on each parsed line so the review screen can show what the shopper typed.

R8. `ProductRepository` (`lib/repositories/products.ts`) gains a list-matching method that accepts
    the distinct terms for a whole list and issues **exactly one** Prisma query, filtered to
    `vendorId` (via the existing `getCurrentVendorId()` seam) and `isActive: true`, whose `where`
    is an `OR` of `name contains <term>` with `mode: "insensitive"`. It takes at most **200**
    candidate products. It does not query `description`.

R9. Line-to-candidate resolution is a **pure** exported function in `lib/shopping-list.ts` taking
    the parsed lines and the candidate products and returning, per line, exactly one of
    `matched` (one product), `ambiguous` (2 or more), or `unmatched` (none). A product matches a
    line only when its normalised name contains **every** term of that line.

R10. Ranking is **total and deterministic** — the same list and candidate set always produce the
     same order. An exact normalised-name equality with the line's joined terms resolves the line
     as `matched` even when other products also contain all terms. Otherwise candidates order by:
     all-terms matches first, then shorter product name, then name alphabetically. `ambiguous`
     lines surface at most **5** candidates.

R11. `lib/shopping-list.ts` unit tests prove, against a fixture candidate set drawn from the seeded
     catalogue names, that `chicken breast` → *Halal Chicken Breast* (`matched`), `milk` →
     *Whole Milk* + *Coconut Milk* (`ambiguous`), and `bannanas` → `unmatched`.

R12. A `/shop-your-list` route exists under `app/(storefront)/` rendering a list entry control, and
     is reachable from the cart page (`app/(storefront)/cart/page.tsx`) by a link — a shopper does
     not have to know the URL.

R13. **The matching pass writes nothing.** Submitting a list for matching creates no `Cart` row, no
     `CartItem` row, and no `aheed_cart` cookie. Verified empirically: from a browser with no cart
     cookie, submitting a list and stopping at the review screen leaves `document.cookie` without
     `aheed_cart` and the database with no new `Cart` row.

R14. The review screen renders every parsed line in input order, showing for each: the original
     text, the parsed quantity, and its resolution — the matched product, a chooser for an
     ambiguous line, an explicit "no match" for an unmatched line, and an explicit "unavailable"
     for a matched line whose `effectiveStock()` is 0. Unmatched, unavailable, and unresolved
     ambiguous lines are excluded from the add.

R15. `CartRepository` (`lib/repositories/cart.ts`) gains
     `addItems(identity: CartIdentity, lines: { productId: string; quantity: number }[]): Promise<void>`
     which resolves the cart **once** and writes all lines inside a **single** `$transaction`.
     `grep` shows no loop calling `addItem` from the feature layer to implement bulk add.

R16. `addItems` reuses `effectiveStock()` and `clampQuantity()` from `lib/cart-rules.ts` — it does
     not re-derive stock or clamping arithmetic. `grep -nE "Math.min|quantity >|quantity <" ` in the
     `addItems` body returns nothing beyond calls into those helpers.

R17. `addItems` **adds to** existing quantities rather than replacing them: adding 2 of a product
     already in the cart at quantity 1 leaves quantity 3, capped at that product's stock. A product
     with `effectiveStock() === 0` is skipped, not written at quantity 0.

R18. A server action at `features/cart/add-list-to-cart.ts` carries `"use server"`, performs the
     bulk add via `getCartRepository().addItems()`, issues a guest token only at this point (never
     during matching), and calls the existing `revalidateCartSurfaces()` from
     `features/cart/shared.ts` so the header badge and cart page update.

R19. The feature layer touches **no Prisma client directly**: `grep -rn "getPrisma\|@prisma/client" features/cart/ app/(storefront)/shop-your-list/`
     returns nothing, and `npm run lint` exits 0 (the slice-2 no-direct-Prisma ESLint guard covers
     `app/`, `components/` and `features/`).

R20. All matching and cart access is **vendor-scoped**: a list submitted on SriMart's host matches
     only SriMart products and adds only to the SriMart cart. `grep -n "getCurrentVendorId" lib/repositories/products.ts`
     shows the list-matching method resolving vendor through the existing seam, not a hardcoded id.

R21. **Duplicate lines are summed before writing, not written twice.** A list containing `apples`
     and `2x apples` resolves to a single write of quantity 3 for that product — `addItems` receives
     (or internally reduces to) one entry per `productId`, so two lines matching the same product
     cannot produce two conflicting upserts inside one transaction.

R22. **The add action does not trust the product ids the review form submits.** Because the review
     step is stateless, the form carries a `productId` and quantity per confirmed line; a
     `productId` belonging to a different vendor, or to no product, is silently skipped rather than
     added — enforced by `addItems` resolving stock through the existing vendor-scoped
     `stockMap(vid, ids)` (`where: { vendorId: vid, id: { in: ... } }`), which yields no row and
     therefore stock 0 for a foreign id. No `CartItem` row is created for such an id.

R23. `npm run kms:validate` exits 0 (this slice's `plan.md` front-matter is schema-valid), and
     `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` byte-identical to the committed copy and
     containing an entry with id `p3d-shop-your-list`. CI diffs this index; a stale one fails the
     PR.

R24. `CHANGELOG.md` updated (Gate 4).

R25. `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run format:check` all exit 0
     after this slice, and `npm run build` succeeds.
