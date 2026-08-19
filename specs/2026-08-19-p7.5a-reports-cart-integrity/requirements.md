# P7.5a — Staff reports correctness & checkout cart preservation (requirements / acceptance criteria)

First slice of P7.5 (epic **#260**). Closes **#238** (the staff revenue aggregate counts cancelled
and never-paid orders, measured 39% overstated on staging), **#237** (the same page is served from a
cache in front of the Worker despite `force-dynamic`), and **#234** (a payment-provider failure
cancels the order and returns its stock but leaves the shopper with an empty cart while telling them
to try again). Narrative and rejected alternatives are in `plan.md`. Two documentation items ride
this branch: inserting P7.5 into the roadmap's phase list, and the PR #259 change-log carry-forward
that `npm run sdd:audit` reports as pending.

R1. `lib/order-status.ts` exports `REVENUE_STATUSES` as a `readonly` tuple whose members are
    exactly `"CONFIRMED"`, `"OUT_FOR_DELIVERY"`, `"DELIVERED"` — in that order, with no other
    members, and it is declared as a literal (`as const`), not derived from `ORDER_STATUSES` or
    `STAFF_QUEUE_STATUSES`.

R2. `lib/order-status.ts` still imports nothing from `@prisma/client` or any repository, so the
    module remains loadable in a plain Node unit test with no database.

R3. `getFinancialsForStaff` in `lib/repositories/orders.ts` passes `status: { in: REVENUE_STATUSES }`
    alongside `vendorId` in its `order.aggregate` `where` clause, and `REVENUE_STATUSES` is imported
    from `lib/order-status.ts` rather than re-declared locally.

R4. `tests/order-status.test.ts` contains a test asserting that `REVENUE_STATUSES` excludes both
    `"PENDING_PAYMENT"` and `"CANCELLED"`, and a test asserting it includes `"DELIVERED"` (the case
    that would break if the set were derived from `STAFF_QUEUE_STATUSES`).

R5. For a vendor whose orders include at least one `CANCELLED` and at least one `PENDING_PAYMENT`
    row, the Total Revenue and Total Orders figures rendered by `/staff/reports` equal the values
    returned by a direct database aggregate over that vendor restricted to `REVENUE_STATUSES` — and
    both are strictly lower than the same aggregate with no status filter.

R6. For a vendor whose revenue-status order count is zero, `/staff/reports` returns 200 and renders
    Avg Basket Value as `£0.00` — not `NaN`, not an error boundary. (`prisma/seed.ts` writes no
    order rows, so SriMart is the expected such vendor; the count is confirmed against the database
    rather than assumed.)

R7. An HTTP response for a `/staff/*` path carries a `Cache-Control` header whose value contains
    both `private` and `no-store`.

R8. Two `/staff/reports` requests made either side of a new revenue-status order for that vendor
    return different Total Orders figures, and neither response reports a cache hit in
    `cf-cache-status`.

R9. A storefront (non-`/staff/*`) path's response does **not** carry `no-store` — the header change
    is scoped to the admin panel and has not been applied globally.

R10. When `payments.createPayment` throws during `placeOrder`, after the call returns the
     `CartItem` rows for the order's originating `cartId` match the cancelled order's `OrderItem`
     rows on `productId` and `quantity`, as an exact set.

R11. In the same failure case, the order's status is `CANCELLED`, its `Payment` row's status is
     `FAILED`, and the inventory quantity for each ordered product equals its pre-checkout value —
     i.e. P3c's R7 compensation behaviour is unchanged by the cart restore.

R12. `placeOrder` still throws `CheckoutError` with code `PAYMENT_PROVIDER_FAILED` on that path.

R13. Calling the cart-restore path when a `CartItem` row already exists for one of the restored
     products completes without throwing a unique-constraint error on `@@unique([cartId, productId])`.

R14. `releaseOrder` contains no cart-restoring code — the Stripe webhook path that cancels expired
     sessions leaves `CartItem` rows untouched.

R15. `specs/decisions/ADR-005-payments-money-flow.md` carries an implementation note for P7.5a
     recording that the payment-failure compensation now also restores the cart, and that the
     restore is confined to `placeOrder`'s `catch` rather than `releaseOrder` because the latter is
     shared with the webhook path for expired sessions. The ADR's existing P3c implementation note —
     which currently describes the compensation as releasing stock only — no longer understates what
     that path does.

R16. `specs/roadmap.md`'s `## Phases` section contains a `P7.5` entry naming it as the pre-launch
     closeout of P3/P5/P6 deferred debt and citing epic `#260`.

R17. `specs/roadmap.md`'s Roadmap Change Log contains a row citing `PR #259` (or merge `c532bb0`)
     for the P7d `/document` closeout promotion.

R18. `npm run sdd:audit` reports no promotion as pending a roadmap change-log row, and does not
     report the promotion half as skipped.

R19. The PR body's closing keywords name exactly `#261`, `#238`, `#237` and `#234`, and do **not**
     name `#260` — the P7.5 epic stays open until all six slices have been promoted. (Accidental
     closure of issues named in a PR body has happened here before; see the #174/#214 incident.)

R20. `CHANGELOG.md` updated (Gate 4).

R21. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
