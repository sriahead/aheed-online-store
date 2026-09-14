# P401 Shared Fulfilment Slots (build notes)

Written retroactively at Document (final), after two follow-up passes (PR #744's CI-readiness fix,
then the P402 rebase's conflict resolution) each found real defects in the original build that no
build-notes.md ever recorded. Recording the full history here rather than losing it.

## What changed and why

- `prisma/schema.prisma` — `VendorFulfilmentSlot` (R1: `method`, `dayOfWeek`, `startTime`,
  `endTime`, `capacity`), and `VendorConfig.bookingWindowDays`/`slotHoldDurationMinutes`/
  `offerDeliverySlots` (R2).
- `features/checkout/slots.ts` / `components/checkout/SlotPicker.tsx` — date picker constrained by
  `bookingWindowDays`, available-slot list per method (R7).
- `lib/repositories/orders.ts`'s `placeOrder` — capacity check inside the order-creation
  transaction (R3–R6): counts orders in `CONFIRMED`/`READY_FOR_COLLECTION`/`OUT_FOR_DELIVERY`/
  `DELIVERED`/`COLLECTED` (permanent, R4) plus `PENDING_PAYMENT` orders newer than
  `slotHoldDurationMinutes` (temporary hold, R5/R6) against the slot's `capacity`, using Prisma
  Serializable isolation rather than raw SQL (R8).

## Decisions taken during the build

- **`lib/repositories/orders.ts`'s capacity check is a plain `count()` against the `Order` table
  inside the same Serializable transaction that creates the row**, not a separate reservation
  table or an atomic `updateMany` compare-and-set — Postgres's own write-skew detection under
  Serializable isolation is the concurrency guarantee (R8), and every concurrent transaction reads
  and would write into the same predicate space (`vendorId` + `fulfilmentSlotId` +
  `fulfilmentDate`), so a genuine over-capacity race aborts the losers with `P2034` rather than
  silently succeeding.

## Deviations from the spec

**None against the requirements as written — but R8 was silently unenforceable on `staging` from
the moment this slice first merged (PR #744, 2026-09-13) until the P402 rebase fixed it
(2026-09-14, PR #746).** `placeOrder`'s `tx.order.create` computed and read `input.fulfilmentSlotId`/
`input.fulfilmentDate` for the capacity check above the `order.create` call, but never included
either field in the row it actually wrote — so every subsequent capacity check's `count()` query
(which filters `WHERE fulfilmentSlotId = ...`) matched zero prior reservations, regardless of how
many concurrent bookings had actually gone through. R8's own Serializable-isolation guarantee
depends on transactions reading and writing the *same* predicate space; a row that never satisfies
the predicate it was checked against falls outside that guarantee entirely; capacity=1 slots could
be overbooked by any number of concurrent orders.

**Nothing in this repo's own CI caught it.** `tests/concurrency-slot-booking.test.ts` (R8's own
test) exercises exactly this scenario, but PR #744's CI never ran it — it fixed the file's real
compile/lint/adapter-construction defects (see CHANGELOG's "PR #744 ... fully green on CI" entry)
without ever reading `placeOrder`'s own `order.create` call, since nothing in `lint`/`typecheck`/
`format:check` touches business logic, and CI's `quality/quality` job carries no `DATABASE_URL` —
so the live-DB test that would have caught this only ever ran locally, where it happened to still
pass (Postgres's Serializable isolation still aborted enough concurrent transactions via the
*inventory* decrement's own write-write conflict, coincidentally, for the exact 5-request/1-capacity
shape both this test and the P402 rebase's fix exercised — not because the slot-capacity check was
doing anything).

**Found and fixed independently, twice, by two different sessions before either merged**: P402's
own `/fix` pass (documented in `specs/2026-09-13-p402-express-sla/build-notes.md`'s "Deviations"
section) found the identical gap while getting its own tests to pass against this same function,
and fixed it on the P402 branch. The fix that actually reached `staging` is the one from PR #746's
rebase (`06c3a30`), which took P402's version of the `order.create` call — see that PR's conflict
resolution for `lib/repositories/orders.ts`. Confirmed fixed post-merge: `deploy-staging` succeeded
for `staging`'s tip (`0e3c4f1`), and the concurrency test (`it.skipIf`-guarded, so it only runs with
a real `DATABASE_URL`) passed locally against the merged result.

## Known-shaky areas

- **`tests/concurrency-slot-booking.test.ts` and `tests/slot-capacity.test.ts` both create real rows
  against the shared dev Neon database and never delete them.** Every identifier is suffixed with a
  slice of a fresh `randomUUID()` (fixed in PR #744 after a hardcoded-literal collision bit
  repeated local runs during that session), which stops a re-run from colliding with its own
  leftover row, but does not stop the row count from growing unbounded. Both files are also guarded
  with `it.skipIf(!process.env.DATABASE_URL)` since CI's `quality/quality` job carries no
  `DATABASE_URL` — so this has only ever run against a real database locally, never in CI. Worth a
  `/propose` for a shared cleanup helper before another live-DB test is added (this was flagged
  once already, in P402's own build-notes, and not yet acted on).
- **The R8 gap above was closed by adopting P402's fix wholesale during a rebase, not by a
  standalone `/fix` pass against this slice's own spec.** No independent live-DB verification of the
  fix was performed *specifically against P401's own requirements* — the confirmation above is that
  the merged result deploys and the (still `it.skipIf`-guarded, so CI-invisible) test passes
  locally. A real live-browser or live-CI check of R8 against `staging` has not been done.
