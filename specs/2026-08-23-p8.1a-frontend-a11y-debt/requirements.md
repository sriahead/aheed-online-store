# P8.1a — Frontend & Accessibility Debt (requirements / acceptance criteria)

Closes #334 (tracking) and its four sub-issues #254, #287, #333, #281 — see `plan.md` for the full
narrative and the deliberate #281 scope narrowing. Four independent fixes; no shared code.

R1. `app/(storefront)/orders/lookup/page.tsx` contains exactly one `<h1>` ("Track Your Order") and
    its heading ranks do not skip anywhere in document order: a visually-hidden
    `<h2 className="sr-only">Delivery Status</h2>` precedes the 3-step pipeline visualizer, whose
    three step-label headings are `<h3>` (not `<h4>`); a second
    `<h2 className="sr-only">Order Items</h2>` precedes the items summary, whose existing
    "Items Ordered" heading remains `<h3>`.

R2. `app/(admin)/staff/reports/page.tsx`'s top-level heading reads `<h1>Store reports</h1>`, and
    the three existing revenue tiles (Total Revenue, Total Orders, Avg Basket Value) render inside
    a `<section>` carrying `<h2>Sales</h2>`, with each tile's own heading now `<h3>` (demoted from
    `<h2>`). No heading rank on the page skips.

R3. `lib/repositories/loyalty.ts`'s `saveLoyaltySettings` function has no `const prisma = ...`
    binding and zero references to a variable named `prisma` in its body; it still opens its write
    through `getPrismaWs().$transaction(...)` unchanged.

R4. `components/layout/Header.tsx`'s brand/logo container — the element whose className currently
    reads `flex items-center gap-3 shrink-0` (wrapping the logo `<Link>`) — carries a fixed height
    class (`h-10`) and `overflow-clip` in addition to its existing classes. The header row itself
    and `<nav>` (containing `ViewSwitcher`'s dropdown) are unchanged.

R5. `lib/vendor-theme.ts`'s `brandStyle()` clamps `--color-action` against a background list that
    includes `p["green-tint"]`, `--color-accent` against a list that includes `p["orange-tint"]`,
    and `--color-danger` against a list that includes `p["red-tint"]` — each in addition to the
    existing `[white, cream]` — using the existing `clampForContrast` unchanged.

R6. For both seeded vendors (`AHEED_PRIMITIVES` and `SRIMART_PRIMITIVES`, the two fixtures already
    defined in `tests/vendor-theme.test.ts`), computed from `brandStyle()`'s
    actual returned CSS custom properties: `contrastRatio(style["--color-danger"], p["red-tint"])`,
    `contrastRatio(style["--color-action"], p["green-tint"])` and
    `contrastRatio(style["--color-accent"], p["orange-tint"])` are each `>= 4.5`.

R7. `tests/vendor-theme.test.ts` contains a test asserting R6's three same-tint pairings for both
    seeded vendors (extending the file's existing per-vendor table pattern), so a future vendor
    primitive that breaks one fails CI rather than shipping unguarded.

R8. `CHANGELOG.md` updated (Gate 4).

R9. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
