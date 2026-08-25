# P8.5a — Product card upgrade (build notes)

## What changed and why

**`app/globals.css` — `.skew-card*` and the repo's first CSS reduced-motion block.** The geometry
is CSS rather than Tailwind utilities because the counter-skew is a parent/child relationship — the
card skews `-2deg` and every `.skew-card-inner` inside it skews `+2deg` back — which utilities
cannot express without repeating a hover variant on every descendant. Four classes: `.skew-card`,
`.skew-card-inner`, `.skew-card-badge` (`-6deg`), `.skew-card-price` (`-4deg`).

The hover shadow is `color-mix(in srgb, var(--color-primary) 22%, transparent)`. The reference
(`docs/ui-ref-revised/src/index.css:183-230`) hardcodes `rgba(27, 94, 32, .18)`, which is Aheed's
green; SriMart renders blue, so that literal would have been a visible per-vendor defect that no
test in this repo would catch.

**`components/product/ProductCard.tsx`** gained the skew classes, the low-stock badge and the
stepper/add-button branch. **`components/product/ProductRow.tsx`** gained an optional
`cartQuantities` map.

**`components/cart/quantity-coalescer.ts`** is the substance of the slice. It is a plain module
with no React import, and that is deliberate: the behaviour worth testing is "N calls inside the
idle window produce one flush carrying the last value", which has nothing to do with rendering, and
keeping it out of React let R8's test use fake timers with no DOM. `components/cart/CartQuantityStepper.tsx`
is the thin React wrapper.

**`lib/cart-summary.ts`** memoises the cart read with React `cache()`. `Header.tsx` was already
calling `getSummary()` on every storefront page for the drawer, so the grid needed no new data —
only a way to reach the same result. The file documents at length that `cache()` is request-scoped
memoisation and *not* the cross-request Prisma caching `CLAUDE.md` forbids, because the two look
similar and the wrong one produces "Cannot perform I/O on behalf of a different request".

**`lib/repositories/products.ts`** — `ProductSummary` gained `stockQuantity` and
`lowStockThreshold`, both from the `Inventory` row already joined for `inStock`. No new query, no
migration.

**`specs/design-system.md` 1.8.0 → 1.9.0** now carries a **Motion** subsection. The three rules
(name your transition properties; animate only non-layout properties; every effect has a
reduced-motion opt-out) previously existed only in `CLAUDE.md`, which is an assistant guardrail
file — the design doc is where a human looks before writing a component, and this slice is the one
that made the rules concrete enough to state.

## Decisions taken during the build

- **Coalescing window: 600ms, trailing debounce.** Rejected a fixed-interval throttle: with clicks
  spaced under the interval it would flush repeatedly mid-burst, which is the behaviour the slice
  exists to avoid. The window restarts on every click, so a steady burst flushes exactly once at
  the end. Both behaviours have their own test.
- **Flush is last-value-wins, not additive.** `updateQuantity` takes an absolute quantity, so
  replaying intermediate values would be wasteful and would be wrong if one were dropped.
- **`flushNow()` on unmount rather than `cancel()`.** If the card unmounts mid-burst (navigation, a
  filter change) the click the shopper just made must still land. Cancelling would silently discard
  it.
- **Adopting a new server value happens during render, not in an effect.** React's documented
  "adjusting state when a prop changes" pattern, using a `lastServerQuantity` state sentinel. The
  effect version tripped `react-hooks/set-state-in-effect`, and suppressing that rule was the
  alternative — the wrong one, since the rule is correct here and `CLAUDE.md` only sanctions
  silencing it when dependency semantics are what's at stake.
- **The coalescer is created inside a `useEffect`, not during render.** Building it during render
  made its `onError` closure read a ref at render time, which `react-hooks/refs` correctly rejects.
- **Buttons stop propagation individually** rather than a wrapping `<div onClick>`. The div version
  is a `jsx-a11y/no-static-element-interactions` error, and only the buttons actually need to
  swallow the click. This matches what `AddToCartButton` already does.
- **`lowStockThreshold` falls back to 3** (the schema default) when a product has no `Inventory`
  row. Such a product is out of stock, so the threshold is never consulted for it — the fallback
  exists to keep the type non-nullable and the card free of null handling.
- **The stepper replaces the add control only when the product is in the cart AND in stock.** An
  out-of-stock product always gets the disabled add control, never a stepper, so there is no path
  where a shopper increments something unpurchasable.

## Deviations from the spec

**None.** All of R1–R15 are built as written; R16 (CHANGELOG) and R17 (green gates) are satisfied
on this branch.

One clarification that is *not* a deviation: R9 says "one `getSummary()` call per page render". The
implementation achieves this by routing `Header.tsx` through the same memoised reader as the pages,
rather than by adding memoisation only on the page side. The requirement's wording permits either;
this way there is one reader and no second code path that could drift.

## Known-shaky areas

Look here first, in this order:

1. **Everything per-vendor (R5).** `tests/vendor-theme.test.ts` passing is *not* evidence — #251 is
   the precedent where `tokens.css` was correct and every rendered page still showed the old
   colour, because `brandStyle()` injects competing inline properties that win on specificity. The
   hover shadow derives from `--color-primary`, which `brandStyle()` **does** override, so this
   should be right — but it has only been reasoned about, never observed. Pull live HTML for both
   vendor hosts.
2. **The coalescing window against a real server (R7, R8).** The unit tests prove the scheduler.
   They do not prove that 600ms is long enough to cover a real human burst, or that
   `revalidatePath("/", "layout")` firing once per burst actually keeps the page responsive. This
   is the #236-adjacent risk and the only way to see it is a real grid under `npm run preview`.
3. **The optimistic-revert path (R10).** Exercised only by a unit test that rejects the flush
   deliberately. The real failure mode — a server action that rejects after a revalidation has
   already begun — has never been observed, and the interaction between the render-time
   `lastServerQuantity` adoption and a rejected flush arriving afterwards is the subtlest thing in
   the slice.
4. **Low stock against real inventory (R12).** Every seeded product may sit above its threshold, in
   which case the badge has never actually rendered. Writing an `Inventory.quantity` low enough to
   trigger it requires touching the **dev** Neon branch — verify the DB target before writing, per
   `CLAUDE.md`'s two-file rule; `.env` agreeing with `.dev.vars` is not sufficient evidence.
5. **Nested interactive content.** The stepper's buttons sit inside the card's `<Link>`, which is
   invalid HTML (interactive content inside an anchor). This is **pre-existing** —
   `AddToCartButton` has always done it — and was not introduced or widened here, but it is the
   kind of thing a fresh reader will notice and should know is a known, unaddressed inheritance
   rather than something this slice chose.
