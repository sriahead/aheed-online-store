# P7.5a — Staff reports correctness & checkout cart preservation (build notes)

Written at the end of Build, before the Clear. Closes #238, #237, #234 under issue **#261**, the
first slice of P7.5 (epic **#260**).

## What changed and why

**`lib/order-status.ts` — `REVENUE_STATUSES` (#238).** A literal `["CONFIRMED",
"OUT_FOR_DELIVERY", "DELIVERED"] as const`, placed beside `ORDER_STATUSES` and
`STAFF_QUEUE_STATUSES`. That module does no I/O and imports no Prisma client, which is why the rule
is unit-testable with no database — the same reason `STAFF_QUEUE_STATUSES` was moved there in P6a.
The comment on the constant records the trap: expressing revenue in terms of `STAFF_QUEUE_STATUSES`
is the tempting one-liner and is wrong, because that constant is a *worklist* and omits `DELIVERED`
— the status most certainly real revenue.

**`lib/repositories/orders.ts` — `getFinancialsForStaff` (#238).** Now filters
`status: { in: [...REVENUE_STATUSES] }` alongside `vendorId`. `/staff/reports` derives Avg Basket
Value from the same two numbers, so this single filter corrects all three tiles.

**`next.config.mjs` — `Cache-Control` for `/staff/:path*` (#237).** `private, no-store,
must-revalidate`. The app previously emitted no `Cache-Control` on any HTML route (the only
`no-store` anywhere was `app/(storefront)/account/data/export/route.ts`), which leaves an
intermediary free to invent a policy. Scoped to the whole panel rather than the one reported page,
because every `/staff/*` route is per-vendor, role-gated, mutable operational data and a cached
packing queue on `/staff/orders` is the same defect with worse consequences.

**`lib/repositories/orders.ts` — `restoreCartFromOrder` (#234).** `placeOrder` clears the cart
*inside* the order-creating transaction, and that placement is load-bearing: it is what makes a
double submit safe, because the second attempt finds `CART_EMPTY`. So the cart could not simply be
cleared later; it had to be put back when the order is cancelled seconds after creation. The new
function reads the cancelled order's `OrderItem` rows and re-inserts them as `CartItem` rows for the
originating `cartId`. The `Cart` row itself is never deleted by checkout — only its items — so the
cart the shopper's cookie already points at comes back populated, with no new cart and no client
change.

**`specs/decisions/ADR-005-payments-money-flow.md` (v1.3.0 → 1.4.0).** Its P3c implementation note
described the payment-failure compensation as releasing *stock*; after this slice that understates
it. The new P7.5a note records what the path now does and, more importantly, the two constraints on
`restoreCartFromOrder` that a later tidy-up would otherwise undo.

**`specs/architecture.md` (v1.15.0 → 1.16.0).** Its caching section listed "Cloudflare's own edge
cache in front of the Worker" as a *future option*. #237 proves it is already active and was caching
authenticated admin pages. Corrected, with the general rule stated: a per-session or role-gated
route must state its cacheability explicitly, because `force-dynamic` governs Next's rendering, not
what sits in front of the Worker — and the two produce an identical symptom.

**`specs/roadmap.md` (v1.36.0 → 1.37.0).** The P7.5 phase entry, and the PR #259 carry-forward row
that `npm run sdd:audit` reported as pending.

## Decisions taken during the build

**The cart restore is guarded on `releaseOrder` actually having cancelled.** The spec did not
specify this. `releaseOrder` returns `false` when its guarded `updateMany` matched nothing, meaning
the order was already `CONFIRMED` or already `CANCELLED` by someone else. Restoring unconditionally
would, in the `CONFIRMED` case, hand the shopper a duplicate basket for an order they actually paid
for — a worse failure than the empty cart #234 is about. Rejected the unguarded version even though
`createPayment` having thrown makes a racing confirmation very unlikely (no Stripe session exists to
confirm): the cost of the guard is one boolean, and the failure it prevents involves money.

**`createMany` with `skipDuplicates`, not an upsert loop.** `CartItem` is unique on
`[cartId, productId]`. If a row for that product somehow already exists, the shopper's own newer
quantity is the one to keep — this order's captured quantity is the stale value, not the fresh one.
A single statement also avoids an interactive transaction, so it works on the HTTP Prisma client and
does not touch the WebSocket path.

**The restore runs outside `releaseOrder`'s transaction, not inside it.** Consolidating them would
look tidier and was rejected: `releaseOrder` is shared with the Stripe webhook, which cancels orders
whose Checkout session *expired* — typically hours later, shopper long gone, possibly with a new
basket already built. Restoring a cart there resurrects a stale basket rather than repairing
anything. Recorded in ADR-005 rather than only in a code comment, because the person most likely to
make that change is someone reading the ADR to understand how compensation works.

**`must-revalidate` added alongside `private, no-store`.** The spec asked for `private` and
`no-store` (R7 checks for exactly those two). `must-revalidate` is additive belt-and-braces against
an intermediary that honours it but not `no-store`; it cannot weaken the header.

**Test harness extended rather than duplicated.** `tests/orders.test.ts`'s existing `fakePrisma()`
gained the calls the compensation path makes (`order.updateMany`, `orderItem.findMany`,
`payment.updateMany`, the discount/loyalty reversal reads, and top-level `orderItem.findMany` /
`cartItem.createMany`). `orderItemRows()` derives the order's lines from what the order transaction
actually wrote, so the compensation assertions cannot drift from the order fixtures. The payment
mock became `vi.hoisted` so one test can install a failing provider without changing the default any
other test sees.

## Deviations from the spec

**None** in what was built. Two clarifications worth recording so validation does not read them as
deviations:

- **R18's `sdd:audit` check passes, but the command's last line reads `2 documentation gap(s)`.**
  Both gaps are *this slice's own* closure row and `ARTIFACT_INDEX.md` entry, which land at
  `/document` after Ship. R18 was deliberately worded to check the **promotion** half, and PR #259
  now shows `✓ cited by a roadmap change-log row`. Do not treat the trailing gap count as an R18
  failure.
- **R20 (`CHANGELOG.md`) is satisfied by this stage, not by the implementation commit.** Per
  CLAUDE.md, Gate 4 lands in `/build-notes`.

## Known-shaky areas

**The `/staff/*` cache header is the highest-risk item, and it cannot be fully proven locally.**
R7 checks the header is emitted, which is a property of `next.config.mjs`. Whether emitting it
actually *stops* the observed staleness is R8, and that only answers on staging behind the real
Cloudflare edge. Two ways this can still fail after a green R7:
1. A zone-level Cloudflare **Cache Rule** set to "Eligible for cache" with an Edge TTL that ignores
   origin cache-control would override the header entirely. That is dashboard configuration outside
   this repo. `plan.md`'s open items says what to do: if R7's header is present and `cf-cache-status`
   still reports a hit, **stop and file it as an owner action** rather than changing code.
2. OpenNext's adapter must actually apply `next.config.mjs` `headers()` to Worker responses. This is
   assumed, not verified — nothing in this repo previously set a `Cache-Control` through that
   mechanism, so it has no precedent here. R7 is the check that settles it; if the header is absent
   entirely under `npm run preview`, the mechanism is wrong, not the value.

**`skipDuplicates` has not been exercised against real Postgres on this stack.** It is unit-tested
only as "the option was passed" (R13's first half). Prisma implements it as `ON CONFLICT DO
NOTHING`, which Postgres supports, but this codebase has no other `createMany({ skipDuplicates })`
call, so the driver-adapter path is untried. R13's live half — bogus `STRIPE_SECRET_KEY` in
`.dev.vars` under `npm run preview` — is what actually proves the restore works end to end, and it
is the single most valuable row in `validation.md`. Do not skip it because the unit tests are green.

**R5's figures depend on which database you are pointed at.** The 39% overstatement was measured on
*staging*. Diff `.env` and `.dev.vars` against `secrets/staging.vars` **and**
`secrets/production.vars` before trusting any live number — two files agreeing is not evidence they
are right, which is exactly how P5a's migration reached production.

**`getFinancialsForStaff` is reached through `getOrderRepository()`, one of the nine facades that
live inside `lib/repositories/*` against CLAUDE.md's own rule (#252).** Not touched here — relocating
it is #252's job — but it means this function cannot be exercised from a plain `tsx` script without
a request context. R5's verification therefore compares the *rendered page* against a direct
database aggregate rather than calling the repository function directly.

**Thin coverage: the `releaseCount: 0` branch.** One unit test covers it. There is no live scenario
in `validation.md` that produces a racing confirmation during a provider failure, because
constructing one requires a Stripe session that `createPayment` never created. The guard is reasoned
rather than empirically exercised.
