# Staff cancellation of a CONFIRMED order (build notes)

Branch `feature/696-staff-cancel-confirmed-order`, two commits: `451aabc` (spec) and `b05e75b`
(implementation). Closes **#696**, **#137**, **#151**.

## What changed and why

**`cancelConfirmedOrder` is a sibling of `releaseOrder`, not a parameterisation of it**
(`lib/repositories/orders.ts`). This was the central shape decision and the reasoning is not
recoverable from the diff. `releaseOrder`'s status guard *could* have been widened to accept
`CONFIRMED`; its `payment.updateMany({ status: "FAILED" })` could not. On the paid path the money
arrived and — because cancelling issues no refund — it stays, so writing `FAILED` would be false at
the moment it was written, and would then collide with the real `REFUNDED` writer #606 eventually
adds. Everything else (the guarded compare-and-set, the `count === 0` early return, the inventory
loop) is deliberately copied from `releaseOrder` so the two read as the pair they are. Every
existing caller of `releaseOrder` is untouched.

**Cancellation is a predicate, not a rung.** `lib/order-status.ts:118` had already decided this
before the slice existed ("Staff cannot cancel — that is refund-adjacent, not a fifth button") and
the build honoured it rather than overturning it: `LEGAL_TRANSITIONS` is unchanged, `nextStatus`
still returns the single forward successor that drives the queue's one button, and `canCancel` is a
separate exported predicate. A test asserts no route to `CANCELLED` exists from any status under
either fulfilment method, so a future edit cannot quietly add one.

**The discount row is stamped, not deleted, and that forced a change to `seq`.**
`releaseCodeRedemption` deletes the redemption on the unpaid path, and its own comment explains why:
"a discount on a never-paid order is not a financial event". Both halves of that invert once the
order was actually paid for — `Order.discountPence` survives on the cancelled order, the customer
really was charged the discounted amount, and the redemption row is the only thing explaining that
number. So `reverseCodeRedemptionForPaidOrder` stamps `reversedAt` and keeps the row.

Keeping the row means keeping its `seq`, and `seq` was doing two jobs at once: it was the
per-customer use count fed to `evaluateCode` **and** the concurrency control, because
`@@unique([codeId, userId, seq])` is what refuses the second of two simultaneous checkouts. A
retained-but-reversed row breaks the first job and, under count-based allocation, collides on the
second. The split — allocate `seq` as `(max(seq) ?? -1) + 1` over **all** rows, count only
`reversedAt: null` rows for the cap — fixes both and preserves the concurrency guarantee exactly:
two concurrent claims still compute the same `seq` and the index still refuses the loser. A
first-ever claim still gets `seq = 0`, so nothing changes on empty data.

**`tests/discounts-repository.test.ts` is new because the discount repository had no tests at all.**
`tests/discounts.test.ts` covers only the pure `evaluateCode`; `claimCode`, `recordCodeRedemption`
and `releaseCodeRedemption` were entirely uncovered, which meant the concurrency guarantee above was
asserted by a code comment and nothing else. Pinning it *before* moving `seq` was a prerequisite for
changing it safely, not scope creep. This is the adversarial pass's find — `validation.md`'s first
draft told a fresh validator to confirm R20 against a "pre-existing concurrent-claim case" that did
not exist.

**`EARN_REVERSAL` rather than a widened index.** `@@unique([orderId, kind])` permits one row per
kind per order and `REVERSAL` already means "undoes this order's REDEEM". A cancelled paid order may
carry both reversals, so a fourth enum value lets that index keep working untouched. Additive
migration, no backfill; `ALTER TYPE … ADD VALUE` applied cleanly to the dev branch, which was the
one step `plan.md` flagged as able to fail (Postgres forbids *using* a new enum value in the
transaction that adds it — this migration only adds it).

**The fulfilment slot frees itself.** `getAvailableSlotsForDate` and `placeOrder`'s capacity guard
both omit `CANCELLED` from their used-count, so cancelling returns the capacity with no code change.
Asserted (R11a) rather than assumed, and measured live at 9 → 10, because the slice now depends on
that coupling.

Also: `CANCELLED` email copy (there was none, so a cancelled order emailed nothing); the cancel form
on the order **detail** page only, never the queue; ADR-005 implementation note plus amendments to
its two passages claiming these reversals were impossible; and three code comments this slice made
false, corrected in the same commit.

## Decisions taken during the build

**`reverseEarn` debits `lifetimePoints` as well as `balancePoints`.** R13 names only
`balancePoints`, so this is an addition the spec did not dictate. The `EARN` incremented *both*
columns, so a full reversal has to undo both or the account's two counters end up explaining
different histories. Rejected the alternative (balance only) because it leaves `lifetimePoints`
permanently inflated by orders that never completed. This is **not** in tension with `awardPoints`'
lapsing comment ("lapsing forfeits a balance, it doesn't rewrite history") — expiry and cancellation
are different events, and only one of them is history. Stated in the code and pinned by a test.

**The balance is allowed to go negative.** The shopper may already have spent the points on another
order. Clamping at zero would silently forgive the difference and leave the ledger disagreeing with
the balance it exists to explain; the redemption path's own `gte` guard is what stops a negative
balance being *spent*. Rejected clamping.

**`lib/repositories/orders.ts`'s `lib/db` import is now type-only.** Both names appeared solely
inside `ReturnType<typeof …>` annotations, and its three sibling repositories
(`loyalty`, `discounts`, `fulfilment-slots`) already use `import type`. As a value import it pulled
`@prisma/client/wasm` into every consumer for nothing — including a plain Node script, which cannot
resolve it, which would have made R9–R12 unverifiable by anything except a fake. Rejected the
alternative of proving atomicity/idempotence with a test double: a double only demonstrates that the
code calls the methods its author expected.

**`ADMIN` only, where `advanceStatus` is `STAFF, ADMIN`.** Flagged at `/propose` and unchallenged.
The ladder is forward-only and recoverable by moving on; this is terminal, irreversible from the UI,
and moves a loyalty balance and a code's remaining uses. One-line change if the owner disagrees.

**A required free-text reason rather than a confirm dialog.** It is the friction that makes the act
deliberate *and* the `OrderStatusEvent.note` that becomes the only durable record of why. A browser
`confirm()` would have given friction and no record.

**Verification is a spec-local script, not a test.** `verify-cancel.ts` drives the real transaction
against real Postgres, guarded by `lib/db-target-guard.ts` (endpoint comparison, not file names) and
cleaning up its fixtures in a `finally` so a failed run cannot poison the next one's evidence.
Precedent: #786's `verify-ledger.mjs`, ratified at `/validate`.

## Deviations from the spec

**One, and it is an addition rather than a departure:** `reverseEarn` also debits `lifetimePoints`
(R13 specifies `balancePoints` only). Recorded above with its reasoning. R13's own validation row
still passes unchanged — the `EARN_REVERSAL` row's `points` is the exact negation and `balancePoints`
moves by that amount; `lifetimePoints` moves too.

Everything else matches `requirements.md` as written. R1–R35 and R11a were all built; R24–R27 (the
`curl`-under-`preview` checks) were **deliberately not self-certified here** and are left for
`/validate` from a fresh context.

## Known-shaky areas

**Look at the `seq` change first.** It is the only edit in this slice that touches the **checkout**
path rather than the cancel path, so its blast radius is wider than anything else here. Everything
protecting it was written in this same commit — before #696 the discount repository had zero tests —
so nothing older than `b05e75b` is guarding it. Specifically worth re-deriving rather than trusting:
that `(max(seq) ?? -1) + 1` cannot hand out a value an existing row holds, and that two concurrent
first-time claims still collide (the guarantee, not a bug). `--reclaim` proves the reversed-row case
live; the concurrent case is only covered by a fake that raises `23505` on a modelled index.

**`lifetimePoints` has no live assertion.** The script checks it (500 → 458) but no production data
has ever had an earn reversed, because until now nothing could. If the owner considers lifetime
points a customer-visible lifetime-*earned* figure that should survive a cancellation, this is the
decision to revisit — it is a judgement about what the column means, not a bug.

**The email copy is untested against a real inbox.** `tests/order-status-email.test.ts` asserts the
outbound Resend payload contains "no payment has been returned" and no "refund"/"refunded"/"repaid",
which pins the thing that would cost money if wrong. Nobody has read it rendered. `#104` (no
verified sending domain) means no real customer email has ever been delivered by this platform at
all.

**`createdByUserId` is exercised live only as `null`.** The script passes `null` (it has no staff
session); the non-null path is covered by a fake in `tests/orders.test.ts` and, end to end, only by
R24–R26's `curl` checks under `npm run preview`, which are `/validate`'s to run.

**The `verify-cancel.ts` fixture is hand-built, not placed through checkout.** It writes a
`CONFIRMED` order with `EARN`/`REDEEM`/redemption rows directly, so it proves what
`cancelConfirmedOrder` does to that shape — not that `placeOrder`+`confirmPayment` produce exactly
that shape. The two could drift. Driving a real checkout to `CONFIRMED` under `npm run preview` and
cancelling *that* is the stronger check and is `/validate`'s to make.

**Not a defect, but the one thing this slice knowingly makes worse:** a cancelled-but-unrefunded
order's retained money leaves `/staff/reports`, because `REVENUE_STATUSES` excludes `CANCELLED`.
Tracked as **#795**, deliberately out of scope, and the reason `/validate` should not treat a
revenue tile moving as a regression it needs to fix.
