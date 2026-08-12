# P6a — Admin panel shell & order dashboard (requirements / acceptance criteria)

The first slice of P6 (#158, epic #89). It moves the three existing `/staff` pages into a new
`(admin)` route group with its own layout, tenant gate and role-aware navigation; adds a `/staff`
landing page; and turns P4b's stopgap order queue into a filterable, searchable dashboard with a
per-order detail view that reads `OrderStatusEvent.note` and `createdByUserId` for the first time.
No schema change, no migration. Builds on `p4a-order-history` (the customer read path whose
no-`note` guarantee must survive intact), `p4b-order-status-transitions` (the queue and the
`advanceStatus` action) and `adr-004-multi-tenancy` (the tenant gate and `requireVendorRole`).

## Route group & shell

R1. `app/(admin)/layout.tsx` exists, and the directory `app/(storefront)/staff/` no longer exists.

R2. The three pages exist at `app/(admin)/staff/orders/page.tsx`, `app/(admin)/staff/loyalty/page.tsx`
    and `app/(admin)/staff/discounts/page.tsx`.

R3. `GET /staff/orders`, `GET /staff/loyalty` and `GET /staff/discounts` each return HTTP 200 for a
    session holding the role that page already required — the URLs are unchanged by the move.

R4. `app/(admin)/layout.tsx` redirects to `/coming-soon` when no vendor resolves for the request
    host, matching `app/(storefront)/layout.tsx`.

R5. `app/(admin)/layout.tsx` and every page under `app/(admin)/` export
    `const dynamic = "force-dynamic"`, and `npm run build` succeeds — a Prisma-backed route left
    statically optimizable has broken this build three times (P1b `/login`, P2 twice).

R6. Exactly one module in `lib/` or `components/` exports the vendor brand CSS custom properties
    (the eight `--color-brand-*` primitives, the semantic `--color-*` tokens and the two derived
    hover shades), and both `app/(admin)/layout.tsx` and `app/(storefront)/layout.tsx` obtain them
    from it. Neither layout file contains its own literal primitive-to-semantic mapping.

R7. `app/(admin)/layout.tsx` does not import or render `components/layout/Header`.

R8. The admin layout renders navigation links to `/staff` and `/staff/orders` for a viewer who
    passes `requireVendorRole("STAFF", "ADMIN")`; additionally to `/staff/loyalty` and
    `/staff/discounts` only for a viewer who passes `requireVendorRole("ADMIN")`; and none of these
    links for a viewer who passes neither.

R9. Each of the five admin pages calls `requireVendorRole` itself with the same allowed roles as
    before this slice: `/staff`, `/staff/orders` and `/staff/orders/{orderNumber}` allow `STAFF`
    and `ADMIN`; `/staff/loyalty` and `/staff/discounts` allow `ADMIN` only.

R10. `GET /staff/loyalty` for a session that is `STAFF` but not `ADMIN` for the current vendor
     returns the page's existing refusal message and does not render the loyalty configuration form.

## Landing page

R11. `GET /staff` returns HTTP 200 for a `STAFF` or `ADMIN` session and renders a link to
     `/staff/orders`, plus links to `/staff/loyalty` and `/staff/discounts` when the viewer is
     `ADMIN`.

R12. `/staff` renders the number of orders for the current vendor whose status is in
     `STAFF_QUEUE_STATUSES`, and that number equals the count of such orders in the database.

R13. `GET /staff` redirects an unauthenticated request to `/login`, and renders a refusal message
     (not the landing content) for a signed-in viewer who is neither `STAFF` nor `ADMIN` for the
     current vendor.

## Order dashboard — filter, search, pagination

R14. `GET /staff/orders` with no query parameters lists only orders whose status is in
     `STAFF_QUEUE_STATUSES` (`CONFIRMED`, `OUT_FOR_DELIVERY`) — the behaviour shipped in P4b is
     unchanged.

R15. `GET /staff/orders?status=<S>`, for each of the five `ORDER_STATUSES` values, lists only orders
     with status `<S>`.

R16. `GET /staff/orders?status=all` lists orders of every status for the current vendor.

R17. `GET /staff/orders?status=<unrecognised>` renders the default queue of R14 and returns HTTP
     200 — it does not error and does not list every status.

R18. `GET /staff/orders?q=<term>` lists exactly those orders whose `orderNumber`, `guestEmail`, or
     related `user.email` contains `<term>` case-insensitively.

R19. `status` and `q` compose with AND: `GET /staff/orders?status=DELIVERED&q=<term>` lists only
     orders that are `DELIVERED` **and** match `<term>` per R18.

R20. When a next page exists, the "older orders" pagination link's href carries the current
     `status` and `q` values alongside `cursor`.

R21. The query-string parsing that turns raw `status` and `q` values into the repository's filter
     arguments is a pure function in `lib/` that performs no I/O, and is covered by unit tests in
     `tests/` that run without a database.

R22. No order belonging to a different vendor appears in any `/staff/orders` response, under any
     combination of `status` and `q`.

## Order detail view

R23. `GET /staff/orders/{orderNumber}` returns HTTP 200 for a `STAFF` or `ADMIN` session and renders
     the order's line items, delivery address, subtotal, discount, delivery fee, total and buyer
     email.

R24. The detail page renders a timeline in which each entry shows the status label, the timestamp,
     the stored `OrderStatusEvent.note` when that column is non-null, and the acting user's name
     when `createdByUserId` is non-null.

R25. `lib/order-status.ts` still exports `buildTimeline` and the `StatusEventInput` type, and
     `StatusEventInput` still has no `note` property. The staff timeline is built by a separate
     exported function with its own entry type.

R26. `tests/order-status.test.ts` passes with additions only — no existing assertion in it is
     deleted or weakened.

R27. `GET /account/orders/{orderNumber}`, for an order carrying an `OrderStatusEvent` whose `note`
     holds a distinctive canary string, renders a page whose HTML does not contain that string —
     while the staff detail page for the same order does (R24). P4a's guarantee survives this
     slice.

R28. The order-detail repository read used by `/staff/orders/{orderNumber}` filters on `vendorId`
     and does **not** filter on `userId`: it resolves an order whose `userId` is null (a guest
     order) and an order owned by a different user, for staff of the owning vendor.

R29. `GET /staff/orders/{orderNumber}` for an order number belonging to a different vendor renders
     a not-found state and does not render that order's items, address or buyer email.

R30. The detail page renders a submit control for `nextStatus(order.status)` when that is non-null
     and renders no such control when it is null, and the control posts to the existing
     `advanceStatus` action from `features/orders/advance-status.ts`.

R31. The detail page renders its items and address through the existing
     `components/orders/OrderItemsCard` and `components/orders/OrderAddressCard` components rather
     than new equivalents.

## Schema, docs and gates

R32. `git diff` against the base branch shows no change to `prisma/schema.prisma` and no new
     directory under `prisma/migrations/`.

R33. `specs/architecture.md` no longer attributes the tenant gate to the storefront layout alone;
     its ADR-004 slice 3b passage names the admin layout as carrying the same gate, and the file's
     front-matter `version` is bumped.

R34. `docs/repo-structure.md`'s app-tree sketch no longer shows `(admin)/admin/` — it shows the
     `(admin)/staff/` group this slice actually creates, with the pages that actually exist — and
     the file's front-matter `version` is bumped.

R35. `CHANGELOG.md` updated (Gate 4).

R36. `lint`, `typecheck`, `test`, `format:check` and `build` all remain green after this slice.
