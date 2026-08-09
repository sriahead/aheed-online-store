# P3b — Checkout + order core (requirements)

Turn a cart into a real order (issue #96, epic #86; follows P3a #93). Vendor-scoped order schema,
totals from vendor delivery rules, and atomic creation that cannot oversell. Payment is stubbed
behind a port — Stripe, webhooks and the confirmation email are P3c.

R1. `prisma/schema.prisma` **introduces** `OrderStatus { PENDING_PAYMENT CONFIRMED
    OUT_FOR_DELIVERY DELIVERED CANCELLED }` — the enum does not exist in the live schema today, so
    this is a fresh `CREATE TYPE`, not an `ALTER TYPE ... ADD VALUE` (which would risk Postgres's
    "unsafe use of new value" error when used in the same migration) — and `PaymentStatus { PENDING
    SUCCEEDED FAILED REFUNDED }`. `Order.status` defaults to `PENDING_PAYMENT`.
    `npx prisma validate` exits 0.

R2. `Address(id, vendorId, userId String?, recipientName, phone, line1, line2 String?, city,
    postcode, notes String?, createdAt)` exists with an FK to `Vendor` and an optional FK to `User`,
    and `@@index([vendorId])`. It is written **once per order** and never updated afterwards, so an
    order's delivery address cannot change retroactively.

R3. `Order(id, vendorId, orderNumber @unique, userId String?, guestEmail String?, addressId,
    status OrderStatus @default(PENDING_PAYMENT), currency @default("GBP"), subtotalPence,
    deliveryFeePence, totalPence, createdAt, updatedAt)` exists, vendor-scoped, with
    `@@index([vendorId, createdAt])` and `@@index([vendorId, status, createdAt])`. It carries **no**
    `discountTotal`/`loyaltyRedeemed` columns (P5).

R4. `OrderItem(id, orderId, vendorId, productId, productName, unitPricePence, quantity,
    lineTotalPence)` snapshots `productName` and `unitPricePence` at purchase time, with
    `@@index([orderId])`. `Payment(id, orderId @unique, vendorId, status PaymentStatus
    @default(PENDING), provider, providerReference String?, amountPence, createdAt, updatedAt)` and
    `OrderStatusEvent(id, orderId, vendorId, status, note String?, createdAt)` exist, both
    vendor-scoped, with `@@index([orderId])`.

R5. Exactly one of `Order.userId` / `Order.guestEmail` identifies the buyer: the repository never
    creates an order with both set or neither, covered by unit tests (R20).

R6. A plain additive migration — `CREATE TYPE` for both enums plus `CREATE TABLE` for the five
    models, with no changes to existing columns and no data backfill — applies cleanly with
    `prisma migrate deploy` against a DB at current head.

R7. `lib/order-totals.ts` exports a **pure** `computeTotals(lines, rules)` performing no I/O, where
    `subtotalPence` sums only **available** lines, `deliveryFeePence` is `0` when
    `freeDeliveryThresholdPence` is non-null and `subtotalPence >= threshold` and otherwise
    `deliveryFeePence` from the vendor's config, and `totalPence === subtotalPence +
    deliveryFeePence`. All values are integer pence.

R8. `lib/payments.ts` exports a `PaymentService` port in the same shape as `lib/email.ts`'s
    `EmailService` (an interface plus a `getPaymentService()` factory), and a **stub** adapter whose
    `createPayment` returns `status: "PENDING"` with a placeholder `providerReference`. No Stripe
    dependency is added to `package.json`.

R9. `lib/repositories/orders.ts` exports `getOrderRepository()` following
    `lib/repositories/cart.ts`'s shape — constructed fresh per call, resolving `getCurrentVendorId()`
    once per instance, every query filtered by that `vendorId`. `app/`, `features/` and
    `components/` contain no direct Prisma import (`npm run lint` passes the existing guard).

R9a. The transactional core is exported separately as `placeOrder(prisma, vendorId, input)`, taking
     its Prisma client and `vendorId` as **explicit arguments** and reading no request context
     (`headers()`/`cookies()`). `getOrderRepository().createOrder` is a thin wrapper that resolves
     those and delegates. This is what makes R12's concurrency test runnable at all — the
     request-scoped resolver cannot be driven from a script.

R10. `createOrder` performs **all** of the following inside a **single interactive transaction**, so
     any failure leaves no partial order: decrement stock for every line, create the `Address`,
     `Order`, its `OrderItem`s, the `Payment` and an initial `OrderStatusEvent`, and delete the
     cart's items.

R11. The stock decrement uses a conditional `updateMany` — `where: { productId, vendorId, quantity:
     { gte: qty } }` with `data: { quantity: { decrement: qty } }` — and treats `count === 0` as
     insufficient stock, throwing so the transaction rolls back. `lib/repositories/orders.ts`
     contains no `$queryRaw`/`$executeRaw` (`CLAUDE.md` forbids raw SQL in application code).

R12. Concurrency: with `Inventory.quantity = 1` for a product, two concurrent `placeOrder` calls
     (R9a) for that product result in **exactly one** order created and one failure; final
     `Inventory.quantity` is `0` and never negative.

R13. Because the cart is cleared inside the same transaction, submitting checkout twice creates
     **one** order — the second submit finds an empty cart and fails with the empty-cart error
     rather than creating a duplicate.

R14. Checkout refuses, before any write, with a distinct error for each case: (a) a pending merge
     decision from P3a is unresolved, (b) the cart is empty, (c) any line is unavailable
     (`isActive = false` or effective stock 0), (d) the postcode is not deliverable for this vendor
     per `isDeliverable(postcode, prefixes)`, (e) `subtotalPence < minimumOrderPence`.

R15. Money is recomputed server-side from the database at creation time. No price, subtotal,
     delivery fee or total is read from the submitted form; `features/checkout/` contains no
     arithmetic on client-supplied money values.

R16. `orderNumber` is `{VENDOR}-{YYYYMMDD}-{6 chars}` where `{VENDOR}` derives from the vendor's slug
     (uppercased, alphanumeric) — no hardcoded vendor prefix — and the final segment is random, not
     sequential, so order volume is not inferable. Collisions are handled by retrying against the
     unique index a bounded number of times, not assumed impossible.

R17. `app/(storefront)/checkout/page.tsx` renders the checkout following
     `docs/ui-ref/CheckoutModal.tsx`'s structure — contact information (name, email, phone),
     delivery address (street, city, postcode, notes), and an order summary showing subtotal,
     delivery fee and total. Guests and signed-in shoppers can both complete it; a signed-in
     shopper's email is prefilled and not re-asked. It shows **no delivery-slot picker and no
     payment-method choice** (P4 / out of scope).

R18. Cart-page and drawer "Proceed to checkout" entry points link to `/checkout`, and `/checkout`
     redirects to `/cart` when the cart is empty or a merge decision is pending.

R19. On success the shopper is redirected to `app/(storefront)/checkout/[orderNumber]/page.tsx`,
     showing the order number, line items with snapshotted prices, the three money lines and the
     delivery address — served from the **persisted order**, not session state, so a refresh shows
     the same thing. The lookup is scoped to the current vendor, so one vendor's order number never
     resolves on another vendor's host.

R19a. Order confirmation access: a signed-in shopper can only load their own order; for a **guest**
     the order number is the only credential, so it functions as a capability URL. The random
     segment (R16) is what makes it unguessable, and the page exposes no data beyond that order.
     A stronger guest-access mechanism (emailed magic link / order-lookup by email + number) is
     **P4**, recorded rather than silently accepted.

R20. `tests/order-totals.test.ts` and `tests/orders.test.ts` pass, covering as pure functions: the
     three totals rules including the free-delivery boundary (at, just below, just above) and a null
     threshold; order-number format and vendor-prefix derivation; the exactly-one-buyer-identity
     invariant (R5); and each of R14's five refusal cases.

R21. **No vendor-specific values in checkout UI**: `grep -nE "#[0-9a-fA-F]{6}"` over the checkout and
     confirmation components returns no colour literals, and no hardcoded delivery fee, threshold,
     minimum, place name or vendor name appears — all come from `VendorConfig`/`VendorBranding` via
     the vendor repository, per ADR-004's rule of thumb.

R22. **`specs/decisions/ADR-005-payments-money-flow.md`** exists with valid KMS front-matter,
     recording: Stripe behind the `PaymentService` port; a **single platform Stripe account** with a
     Connect-ready seam; the **merchant-of-record** consequence of that choice; and the deferred
     upgrade to Stripe Connect. `npm run kms:validate` reports 0 failing.

R23. `specs/architecture.md` is updated — the `OrderStatus` enum now shows `PENDING_PAYMENT`, the
     order model reflects the live vendor-scoped schema, and the address-snapshot rule is recorded
     alongside the existing `OrderItem` snapshot rule; `specs/tech-stack.md`'s payments section notes
     the port now exists with a stub adapter. Both front-matter `version`/`updated` bumped;
     `ARTIFACT_INDEX.md` regenerated, matching the committed copy and containing both
     `p3b-checkout-order-core` and `adr-005-payments-money-flow`.

R24. `CHANGELOG.md` `[Unreleased]` has an entry naming P3b and `#96` (Gate 4), recording the
     decrement-at-creation decision and its **unreleased-stock gap until P3c**.

R25. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` and
     `npm run kms:validate` all exit 0, and `npm run build` succeeds with `/checkout` server-rendered
     (`ƒ`), not statically optimized.
