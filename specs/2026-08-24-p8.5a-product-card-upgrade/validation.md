# P8.5a — Product card upgrade (validation)

Anything touching the cart or Prisma must be exercised under `npm run preview` (OpenNext +
Miniflare), never `npm run dev` — plain `next dev` cannot load `@prisma/client/wasm` and renders a
silent error state instead of failing (see `CLAUDE.md`'s Database section).

**A note on the literal-check trap**, which has now bitten four slices: several rows below grep for
a class name or property. Where a count is asserted, the command excludes comment lines, because a
bare match count includes the explanatory comment the fix itself added — exactly how P8.5's
predecessor #334 produced an R4 row that could not mean what it claimed.

| Req | How to verify |
|-----|---------------|
| R1  | Under `npm run preview`, fetch a page rendering the grid and inspect the card element's computed `transform` — it reads a matrix equivalent to `skewX(-2deg)`, and the inner content element's is `skewX(2deg)`. Drive hover in a real browser (Chrome extension) and confirm both resolve to `none`/identity and the card's computed `translate`/`transform` includes `-6px` on Y. A jsdom test is **not** sufficient here: `brandStyle()` injects competing inline custom properties, and hover state is not computable from the stylesheet alone. |
| R2  | `grep -rn "transition-all" components/product/ app/globals.css` prints nothing (exit 1). Then read the full diff of `app/globals.css` and confirm no bare element-selector transition rule was added — read it, do not grep, since the rule's shape varies. |
| R3  | `grep -rniE "#[0-9a-f]{6}\|rgba?\(\|emerald-\|slate-\|amber-\|purple-" components/product/ProductCard.tsx` returns no match on a non-comment line. Run it, then read each hit (if any) to confirm it is inside a comment rather than a value. For the CSS, read the diff of `app/globals.css` and confirm the shadow colour resolves through `var(--color-*)` or `color-mix()`. |
| R4  | `grep -n "prefers-reduced-motion" app/globals.css` prints at least one line. Then, in a real browser with reduced motion forced on, hover a card and confirm no skew change and no lift — the computed transform is unchanged between rest and hover. |
| R5  | Under `npm run preview`, `curl -s -H "Host: srimart-staging.nocaped.com" <preview-url>/ > /tmp/srimart.html` and the same for Aheed's host, then diff the inline `style` attribute on the root element and the card markup. The two must differ in the accent/shadow colour values. A passing `tests/vendor-theme.test.ts` is **not** evidence for this row — see `CLAUDE.md`'s design-token section on #251, where `tokens.css` was correct and every rendered page still showed the old colour. |
| R6  | Under `npm run preview`, sign in as a seeded demo account, add a known product to the cart, then load `/search` and confirm that product's card shows quantity 1 while a different product's card shows the add affordance. Confirm the same on `/` and on that product's `/categories/<slug>` page. |
| R7  | Continuing from R6: click `+` twice on the card, wait past the coalescing window, then reload `/cart` and confirm the line quantity is 3. Click `-` three times and confirm the line is removed from `/cart`. Read the row back from the database (or `/cart`'s rendered total) rather than trusting the card's own optimistic display. |
| R8  | A unit test (vitest) drives the stepper's coalescing logic with N = 5 increments inside the idle window and asserts the mocked `updateQuantity` was called exactly once, with the final quantity. `npm test` exits 0 and the new test appears by name in the output. |
| R9  | Instrument or count queries for one render of `/search` under `npm run preview` — assert exactly one `getSummary()` execution per request despite both the header and the page needing it. If direct query counting is impractical, a unit test asserting the memoised wrapper invokes the underlying repository once for two calls within one request scope is acceptable; say which was used. |
| R10 | Force the coalesced action to reject (temporarily throw in `updateQuantity`, or drive it against an out-of-stock product), then confirm the card's displayed quantity returns to the server value rather than staying at the optimistic one. Revert the instrumentation afterwards. |
| R11 | `grep -n "quantity\|lowStockThreshold" lib/repositories/products.ts` shows both surfaced on the `ProductSummary` interface, and `git diff --name-only origin/staging...HEAD -- prisma/migrations/` prints nothing. |
| R12 | Under `npm run preview`, set a seeded product's `Inventory.quantity` to a value at or below its `lowStockThreshold` (and above zero) against the **dev** Neon branch, reload the grid, and confirm the card renders the count. Set it well above the threshold and confirm the message disappears. Verify the DB target first with `lib/db-target-guard.ts`'s convention — diff `.env` against `secrets/staging.vars` and `secrets/production.vars` before writing anything, per `CLAUDE.md`. |
| R13 | Set a seeded product's `Inventory.quantity` to 0 on the dev branch and confirm its card renders the disabled out-of-stock control and no stepper. |
| R14 | Under `npm run preview`, load `/`, `/search`, and a `/categories/<slug>` page; all three return 200 and render cards. Check the preview console for errors on each. |
| R15 | `npm test -- tests/repository-purity.test.ts` exits 0. |
| R16 | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R17 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0 locally — and, the authority, the `gates` workflow passes on the PR. CI on Linux is ground truth, not local Windows output. |
