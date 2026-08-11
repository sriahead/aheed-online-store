# P4a — Order history & status timeline (requirements / acceptance criteria)

Opens P4 (issue #122, epic #87; follows P3b #96 and P3c #99, which created the order models and the
`OrderStatusEvent` writes this slice reads). A signed-in shopper gets a vendor-scoped, keyset-paginated
list of their past orders and a detail page showing items, delivery address and a status timeline.
**Read-only**: no transition, no cart write, no schema change, no migration. See `plan.md` for why
each edge is where it is — in particular why `getForUser` exists alongside `getByOrderNumber`, and
why the timeline is built from `status` and never from `note`.

R1. `lib/order-status.ts` exists and is **pure** — it performs no I/O and no DB access.
    `grep -nE "getPrisma|@prisma/client|fetch\(|cookies\(|headers\(" lib/order-status.ts` returns
    nothing. It is unit-tested without a database, matching `lib/cart-rules.ts`.

R2. `lib/order-status.ts` exports `orderStatusLabel(status: string): string` returning a distinct,
    customer-facing label for each of the five `OrderStatus` values (`PENDING_PAYMENT`, `CONFIRMED`,
    `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`), and a non-empty fallback label for any
    unrecognised value rather than throwing or returning the raw enum name.

R3. `lib/order-status.ts` exports `buildTimeline(events)` — pure — which accepts
    `{ status: string; createdAt: Date }[]` in any order and returns
    `{ status: string; label: string; at: Date }[]` sorted **ascending** by `at`, with `label`
    produced by `orderStatusLabel`.

R4. `buildTimeline` collapses **consecutive** entries with an identical `status` into one, keeping
    the earliest `at`. Input `[CONFIRMED@t1, CONFIRMED@t2, DELIVERED@t3]` yields exactly two entries,
    the first with `at === t1`. Non-consecutive repeats are **not** collapsed:
    `[CONFIRMED@t1, CANCELLED@t2, CONFIRMED@t3]` yields three entries.

R5. **The timeline cannot carry `OrderStatusEvent.note`.** `buildTimeline`'s parameter and return
    types declare no note/message field — `grep -nE "\bnote\s*[:?]" lib/order-status.ts` returns
    nothing (no property so named) — and `getForUser`'s Prisma selection for `statusEvents` selects
    `status` and `createdAt` only, with no `note: true`. A unit test proves it at runtime: a
    `TimelineEntry` built from an event object carrying `note: "INTERNAL-DO-NOT-SHOW"` has exactly
    the keys `at`/`label`/`status`, and the serialised timeline does not contain that string.

    > **Corrected 2026-08-11, during Build.** This row originally verified with a bare
    > `grep -n "note" lib/order-status.ts` returning nothing. That check is wrong in a way worth
    > recording: it matches the module's own *documentation* — the comment explaining why the field
    > is deliberately absent — so satisfying it would mean deleting the most useful explanation in
    > the file to please a grep. The check now targets the field syntax and is backed by a runtime
    > assertion, which is what the row was always trying to prove.

R6. `OrderRepository` (`lib/repositories/orders.ts`) gains
    `listForUser(userId: string, opts: { take: number; cursor?: string }): Promise<OrderListPage>`
    where `OrderListPage` is `{ items: OrderListItem[]; nextCursor: string | null }`. Its Prisma
    `where` includes both `vendorId` (resolved through the existing `getCurrentVendorId()` seam, not
    a hardcoded id) and `userId`.

R7. `listForUser` paginates by **keyset, not offset**: it orders by `[{ createdAt: "desc" }, { id: "desc" }]`,
    requests `take + 1` rows to detect a further page without a `COUNT`, and applies
    `cursor: { id: cursor }, skip: 1` when a cursor is supplied — the same shape as
    `lib/repositories/products.ts`'s `findPage`. `grep -n "skip:" lib/repositories/orders.ts` shows
    no `skip` used for offset paging (only the `skip: 1` cursor exclusion).

R8. `OrderListItem` exposes exactly `orderNumber`, `status`, `createdAt`, `totalPence`, `itemCount`
    and `previewItems`. `itemCount` is the **sum of every item's quantity on that order** (an order
    of 2 × milk and 1 × rice reports 3, not 2), so the query selects all items' quantities rather
    than only the previewed ones. `previewItems` is the **first 3 items ordered by `productName`
    ascending** — a total order, so the same order always renders the same preview — as
    `{ productName, quantity }`. `OrderListItem` exposes no address and no per-item pricing.

R9. **No N+1.** Rendering `/account/orders` issues a number of Prisma queries that is **constant in
    the number of orders on the page**: items are included via a nested `select`, so 10 orders cost
    the same as 1. Ten orders must not produce eleven queries.

    > **Corrected 2026-08-11, during Build, before any live run.** This row originally said
    > "exactly one Prisma query". That is not what Prisma does and never could have passed: for a
    > nested relation `select`, Prisma's default read strategy issues a **second** batched query
    > (`SELECT ... FROM "OrderItem" WHERE "orderId" IN (...)`) rather than a join, unless the
    > `relationJoins` preview feature is enabled — which `CLAUDE.md`'s Prisma rules do not enable
    > and this slice is not the place to turn on. Two constant queries is the correct, achievable
    > property; "exactly one" would have failed validation for a design that is right. The
    > requirement now states the property that actually matters — no per-order query — which is
    > what the row was there to protect.

R10. **The list is not filtered by status.** Every order the viewer owns for this vendor appears,
     including `PENDING_PAYMENT` (checkout started, never paid) and `CANCELLED` — each rendered with
     its `orderStatusLabel`. An abandoned order is visible history, not hidden.

R11. `OrderRepository` gains `getForUser(orderNumber: string, userId: string): Promise<OrderDetail | null>`
     whose Prisma `where` filters on `orderNumber`, `vendorId` **and** `userId` together, so a guest
     order (`userId: null`) and another member's order both resolve to `null`.

R12. `OrderDetail` carries the existing `OrderSummary` fields (order number, status, createdAt, the
     three money totals, items, address) plus `timeline`, built by `buildTimeline` from the order's
     `statusEvents`.

R13. `getByOrderNumber()` is **unchanged** — same signature, same `where`, same ownership rule
     (`order.userId && order.userId !== viewerUserId → null`). `git diff` on
     `lib/repositories/orders.ts` shows no modification inside that method's body.

R14. A route exists at `app/(storefront)/account/orders/page.tsx` with `export const dynamic = "force-dynamic"`,
     which redirects to `/login` when there is no session, and otherwise lists the viewer's orders
     newest-first, **10 per page**.

R15. When a further page exists, the list renders a link carrying `?cursor=<nextCursor>`; when it
     does not, no such link is rendered. Following the link renders the next orders with no order
     repeated from the first page.

R16. When the viewer has no orders for this vendor, the list renders an explicit empty state naming
     that fact, with a link to `/categories` — not a blank page and not an error.

R17. A route exists at `app/(storefront)/account/orders/[orderNumber]/page.tsx` with
     `export const dynamic = "force-dynamic"`, which redirects to `/login` when there is no session
     and calls `notFound()` when `getForUser` returns `null`.

R18. The detail page renders the order's items with quantities and line totals, the three money
     totals, the delivery address, and the status timeline — one entry per `buildTimeline` step,
     each showing its label and its date formatted for `en-GB`.

R19. **A guest order is not reachable through the account area.** For an order placed as a guest,
     `GET /account/orders/{orderNumber}` while signed in as any user returns **404**, while
     `GET /checkout/{orderNumber}` still returns **200** and renders that order — proving the two
     reads have deliberately different access rules.

R20. **Another member's order is not reachable.** For an order owned by user A,
     `GET /account/orders/{orderNumber}` while signed in as user B returns 404, and that order does
     not appear in user B's list.

R21. **Order history is vendor-scoped.** An order placed on one vendor's host does not appear in the
     same user's order list on another vendor's host, and its detail page returns 404 there —
     verified against the two seeded vendors (Aheed and SriMart) on their respective hosts.

R22. `app/(storefront)/account/page.tsx` renders a link to `/account/orders`, so the history is
     reachable from the account shell without knowing the URL.

R23. The items-and-totals card and the delivery-address card exist as shared components under
     `components/orders/` and are imported by **both** `app/(storefront)/checkout/[orderNumber]/page.tsx`
     and `app/(storefront)/account/orders/[orderNumber]/page.tsx`. Neither page contains its own copy
     of the money-breakdown markup.

R24. **The confirmation page's rendered output is unchanged by that extraction.** For a given order,
     `GET /checkout/{orderNumber}` renders the same item lines, the same subtotal/delivery/total
     figures, the same address block and the same status banner as before the refactor.

R25. **No schema change and no migration:** `git diff` shows `prisma/schema.prisma` unmodified and
     `prisma/migrations/` gains no new directory.

R26. The app and feature layers touch **no Prisma client directly**:
     `grep -rn "getPrisma\|@prisma/client" "app/(storefront)/account/" components/orders/` returns
     nothing, and `npm run lint` exits 0 (the slice-2 no-direct-Prisma ESLint guard covers `app/`,
     `components/` and `features/`).

R27. `specs/sdd-workflow.md`'s delivery-board section no longer claims `Backlog`/`In Review` do not
     exist or instructs the reader to use `Todo` — the blockquote is corrected to match the live
     board and `CLAUDE.md`, and the doc's `version`/`updated` front-matter is bumped. (Carry-forward
     doc fix from this slice's `/orient`; see `plan.md`.)

R28. `npm run kms:validate` exits 0 (this slice's `plan.md` front-matter is schema-valid), and
     `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` byte-identical to the committed copy and
     containing an entry with id `p4a-order-history`. CI diffs this index; a stale one fails the PR.

R29. `CHANGELOG.md` updated (Gate 4).

R30. `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run format:check` all exit 0
     after this slice, and `npm run build` succeeds.
