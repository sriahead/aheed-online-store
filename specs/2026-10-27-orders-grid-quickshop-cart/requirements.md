# Orders grid, Quick Shop orders tile and cart Continue shopping (requirements / acceptance criteria)

Closes `#1302`. Builds on `#1187` (Quick Shop hub), `#116` (Save as list) and P4 (Reorder). See
`plan.md` for the reasoning. "The list page" is `app/(storefront)/account/orders/page.tsx`; "the
detail page" is `app/(storefront)/account/orders/[orderNumber]/page.tsx`.

R1. The Quick Shop hub renders five tiles; the first four keep their existing hrefs, labels,
    descriptions and order, and the fifth has href `/account/orders`, label "Your orders" and a
    non-empty description.
R2. The Quick Shop hub heading paragraph reads exactly "Quick ways to fill your basket without
    browsing from scratch." and contains neither "Four" nor "Five".
R3. The "Your orders" tile uses an icon name that exists in `components/icons/registry.ts`, and the
    slice adds no entry to the registry.
R4. The list page's order container is a `<ul>` with classes `grid`, `sm:grid-cols-2` and
    `xl:grid-cols-3`, so it shows one column below `sm`, two from `sm` and three from `xl`.
R5. The list page uses `PageContainer` with `width="wide"`, and `tests/page-container.test.ts`
    records that width for the page.
R6. Each order card on the list page has a link to `/account/orders/<orderNumber>` that contains the
    order number, date, status badge, item preview, item count and total.
R7. Each order card on the list page contains a form posting `reorderItems` with a hidden
    `orderNumber` input and a submit button labelled "Reorder items", and a form posting
    `saveOrderAsList` with a hidden `orderNumber` input, a hidden `from` input of value
    `orders-list` and a submit button labelled "Save as list".
R8. On the list page no `<form>` or `<button>` is a descendant of an `<a>`.
R9. `saveOrderAsList` with `from=orders-list` redirects to `/account/orders?list=saved` when the
    list is saved, `/account/orders?list=capped` when the list cap is reached, and
    `/account/orders?list=empty` when the order has no savable lines.
R10. `saveOrderAsList` without `from`, or with any other value of `from`, redirects exactly as
    before this slice (`/account/orders/<orderNumber>?list=saved|capped|empty`).
R11. The list page renders a `role="status"` paragraph "Saved — find it under Your lists." for
    `?list=saved`, "You already have {MAX_SAVED_LISTS} saved lists. Delete one to save another."
    for `?list=capped`, and "There is nothing in that order to save." for `?list=empty`, and no
    status paragraph for any other value.
R12. Cards in a grid row are equal height: each `<li>` is `flex`, its card fills it (`flex-1`), the
    action row carries `mt-auto`, and the item preview uses `line-clamp-2` rather than `truncate`.
R13. `/cart` renders a link to `/categories` with the text "Continue shopping", both for an empty
    cart and for a cart with lines.
R14. The cart drawer is unchanged: `git diff origin/staging -- components/cart` is empty.
R15. `reorderItems` and the detail page are unchanged: `git diff origin/staging --
    features/orders/reorder-items.ts "app/(storefront)/account/orders/[orderNumber]/page.tsx"` is
    empty.
R16. No file under `prisma/` changes, and neither `package.json` nor `package-lock.json` changes.
R17. The new and changed copy contains no vendor name or product-category word, and
    `tests/vendor-neutral-copy.test.ts` passes.
R18. Tests cover R1, R2, R4, R6-R11, R12 and R13, and each fails if its behaviour is reverted.
R19. `CHANGELOG.md` updated (Gate 4).
R20. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice, as do
    `kms:validate`, `kms:coverage` and `kms:check-generated`.
