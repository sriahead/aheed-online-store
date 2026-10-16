# Shop-list lines the cart notice never names, and header controls with doubled names (requirements / acceptance criteria)

Club F: closes `#1090` and `#1091`. Builds on `specs/2026-10-14-p1087-1088-1089-shopper-clarity/`
(`#1088`'s list notice and the `lineLabel` field; `#1087`'s `tests/location-control.test.tsx`) and on
`#957`'s restore notice (`lib/restore-notice.ts`, `lib/restore-lines.ts`,
`components/cart/RestoreNotice.tsx`). One line: `/cart` names out-of-stock and unmatched shop-list
lines through a new positional `lineStatus` field, and the four `LocationControl` buttons each get
one accessible name that does not depend on the stylesheet. Read `plan.md`'s two tables before
checking R1–R16; they are the authoritative field and label mapping.

## #1090 — the review step's submitted fields

R1. `components/cart/ListReview.tsx` renders exactly one `productId` field (hidden input or
    select), one `quantity` hidden input, one `lineLabel` hidden input and one `lineStatus` hidden
    input for **every** line it renders, whatever the line's resolution — so for any list the four
    `formData.getAll(...)` arrays have equal length and index `i` of each belongs to line `i` in
    render order.
R2. Per line kind, `ListReview` emits these values (`<typed>` is the line's `original`):
    matched-in-stock → `productId` = product id, `lineStatus` = `ready`, `lineLabel` = `<typed>`;
    ambiguous → `productId` = the select's value, `lineStatus` = `choose`, `lineLabel` = `<typed>`;
    matched-out-of-stock → `productId` = `""`, `lineStatus` = `unavailable`, `lineLabel` = the
    matched product's `name`; unmatched → `productId` = `""`, `lineStatus` = `unmatched`,
    `lineLabel` = `<typed>`. Every line's `quantity` is the line's `quantity`.
R3. `lineStatus` and `lineLabel` are emitted unconditionally — neither changes value or presence
    when the shopper changes an ambiguous line's selection.
R4. The visible review screen is unchanged: the "unavailable, not added" and "No match in this
    shop" row text, the skipped-line warning, and the "Add N items" / "Nothing to add yet" button
    text and disabled state are byte-identical to `origin/staging` for the same input.

## #1090 — the action and the notice

R5. `features/cart/add-list-to-cart.ts` reads `lineStatus` positionally. For a submitted line
    whose `productId` is empty, the reported kind is `unavailable` when `lineStatus` is
    `unavailable`, `unmatched` when it is `unmatched`, and `skipped` for **any other value,
    including absent or blank**.
R6. A submitted line whose `productId` is non-empty is sent to the cart repository's `addItems`
    regardless of its `lineStatus` value; `lineStatus` never causes, prevents or alters an add.
R7. `lib/restore-notice.ts`: `RestoredLineKind` gains `"unmatched"`, `RestoreEntryKind` gains
    `"m"`, `buildRestoreNoticeUrl` encodes an `unmatched` line as `m~0~<requested>~<name>`, and
    `parseRestoreNotice` accepts an `m` entry only when `added === 0` and `requested >= 1`
    (returning `null` for that entry otherwise, as it does for `s`). `BulkAddKind` in
    `lib/cart-rules.ts` is unchanged.
R8. `lib/restore-lines.ts`'s `restoredLines` reports each id-less item under its own kind when the
    item carries one, and under the `missingKind` argument (default `unavailable`) when it does
    not. Reorder (`features/orders/reorder-items.ts`) and the unpaid-order cancel
    (`features/checkout/cancel-order.ts`) pass no per-item kind and their
    output is unchanged.
R9. `components/cart/RestoreNotice.tsx` renders an `m` entry as exactly
    `<name>: not added, no match in this shop`. The existing `u`, `p`, `h` and `s` strings and the
    three source headings are byte-identical to `origin/staging`.
R10. End to end, a submitted list of one in-stock match, one out-of-stock match and one unmatched
    line lands on a `/cart` whose notice heading reads `2 of 3 items from your list couldn't be
    added in full:` and whose entries are `<product name>: not available right now` and
    `<typed text>: not added, no match in this shop`, with the in-stock line in the cart.
R11. `#1088`'s cases are unchanged: a skipped ambiguous line still yields an `s` entry; a clamped
    line still yields `p`; an at-limit line still yields `h`; a fully added list still redirects to
    exactly `/cart`; a skipped line with a blank label is still named `An item from your list`.

## #1091 — one accessible name per LocationControl button

R12. In `components/layout/LocationControl.tsx`, rendered in jsdom (no stylesheet), each button
    has exactly this accessible name:
    the `COLLECTION` toggle → `Click & Collect`;
    the `DELIVERY` toggle with a deliverable postcode `P` → `Delivery · P`;
    the Delivery affordance with no deliverable postcode → `Delivery`;
    the no-collection single button → `Delivery · P` with a deliverable postcode `P`, otherwise
    `Check delivery availability`.
R13. Each name in R12 contains, as a substring, the text of the span visible at narrow widths
    (`Collect`, `P`, `Delivery`, `Delivery · P`, `Check delivery`) — WCAG 2.5.3 Label in Name.
R14. Visual output is unchanged: every span keeps its `origin/staging` text and `className`
    (the Delivery affordance's two identical spans may become one span with no responsive class,
    since both rendered the same word), and no button's `className`, `title`, `type`, `name` or
    `value` changes.
R15. `tests/location-control.test.tsx` locates every button it clicks by
    `getByRole("button", { name })`; the `deliveryAffordance()` structural helper and its comment
    explaining the doubled name are removed.
R16. In a real browser (Chrome, `npm run preview`), the computed accessible name of the Collect
    toggle and the Delivery toggle matches R12 at a 375px-wide and a 1280px-wide viewport.

## Guards

R17. No vendor name or product-category example appears in any string this slice adds
    (`app-conventions.md`, "User-facing copy"); `tests/vendor-neutral-copy.test.ts` passes.
R18. No change to `prisma/schema.prisma`, `prisma/reference/schema.prisma`, `prisma/migrations/`,
    `package.json` or `package-lock.json`.
R19. `features/cart/add-list-to-cart.ts` still exports only async functions (it is a
    `"use server"` module).
R20. `CHANGELOG.md` updated, naming `#1090` and `#1091` (Gate 4).
R21. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice; the `kms:`
    checks pass with this slice's `plan.md` indexed; CI's `docs-gates`, `quality / kms` and
    `quality / quality` pass on the PR.
