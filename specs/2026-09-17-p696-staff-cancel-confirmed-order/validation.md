# Staff cancellation of a CONFIRMED order (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

This slice is almost entirely database-touching. **Validate with `npm run preview`, never
`npm run dev`** — `next dev` cannot load the WASM engine and silently renders an error state.
**Run `npx vitest run` on its own**, not beside or straight after a build: the forks pool silently
fails to start workers and whole files never execute, sometimes still exiting 0. After stopping
`npm run preview`, kill the whole `node`/`workerd` chain before the next build or it fails `EBUSY`.

Rows marked **live** use `specs/2026-09-17-p696-staff-cancel-confirmed-order/verify-cancel.ts`, a
spec-local script (precedent: `#786`'s `verify-ledger.mjs`, ratified at `/validate`). It seeds a
fixture order in the **dev** database — `CONFIRMED`, two `OrderItem`s, an `EARN` row, a `REDEEM`
row, and a `DiscountRedemption` against a code capped at one use per customer — then calls
`cancelConfirmedOrder` with an injected client, which is exactly what the repository layer's
explicit-client rule makes possible. Run it with `npx tsx`, not through the Worker.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -A6 "enum LoyaltyEntryKind" prisma/schema.prisma` lists exactly `EARN`, `REDEEM`, `REVERSAL`, `EARN_REVERSAL` in that order. |
| R2  | Unit | `grep -c "@@unique(\[orderId, kind\])" prisma/schema.prisma` returns `1`; `git diff origin/staging -- prisma/schema.prisma` shows no change to that line. |
| R3  | Unit | `grep -A18 "model DiscountRedemption" prisma/schema.prisma` shows `reversedAt DateTime?` and all three original constraints present and unmodified. |
| R4  | Integration | Open the single new file under `prisma/migrations/*/migration.sql`. It contains `ALTER TYPE "LoyaltyEntryKind" ADD VALUE 'EARN_REVERSAL'` and `ALTER TABLE "DiscountRedemption" ADD COLUMN "reversedAt"`, and `grep -iE "drop index\|trgm" ` over that file returns nothing. |
| R5  | Unit | `npx vitest run tests/order-status.test.ts` — new cases assert `canCancel` true for the two cancellable statuses and false for the other five plus `"NOT_A_STATUS"`. |
| R6  | Regression | `npx vitest run tests/order-status.test.ts` — the pre-existing `nextStatus`/`canTransition` cases pass unmodified, and `git diff origin/staging -- lib/order-status.ts` shows no change inside the `LEGAL_TRANSITIONS` object literal. |
| R7  | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0, and `git diff origin/staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` is empty (no allowlist entry was added). |
| R8  | Unit | `npx vitest run tests/orders.test.ts` — a case drives `cancelConfirmedOrder` against the fake client with the guarded update reporting `count: 0` and asserts it returns `false` and performs no inventory, ledger or event write. |
| R9  | Integration | **live** — `npx tsx specs/2026-09-17-p696-staff-cancel-confirmed-order/verify-cancel.ts --twice` prints `IDEMPOTENT: identical state after second call` and exits 0. |
| R10 | Integration | **live** — the same script's output includes `stock restored: <productA> +N, <productB> +M` matching the fixture's `OrderItem.quantity` values exactly. |
| R11 | Integration | **live** — the script prints `payment: SUCCEEDED (unchanged)`; additionally `grep -n "PaymentStatus\|payment.updateMany" lib/repositories/orders.ts` shows no `FAILED`/`REFUNDED` write inside `cancelConfirmedOrder`'s body. |
| R11a | Integration | **live** — `verify-cancel.ts` calls `getAvailableSlotsForDate` for the fixture order's slot and date immediately before and after the cancel, and prints `slot capacity: N -> N+1 (freed)`. Also confirm `git diff origin/staging -- lib/repositories/fulfilment-slots.ts` is empty. |
| R12 | Integration | **live** — the script prints the created `OrderStatusEvent` with `status: CANCELLED`, a `note` containing the literal reason string it passed in, and `createdByUserId` equal to the fixture's staff user id. |
| R13 | Unit | `npx vitest run tests/loyalty.test.ts tests/loyalty-repository.test.ts` — a case asserts the `EARN_REVERSAL` row's `points` equals `-earn.points` and that `balancePoints` moved by the same signed amount. |
| R14 | Unit | Same command — two cases: no `EARN` row present returns `0` and writes nothing; an existing `EARN_REVERSAL` returns `0` and the row count is unchanged. |
| R15 | Unit | Same command — a case with `EARN.userId === null` asserts the ledger row is still written and `loyaltyAccount.updateMany` was never called. |
| R16 | Unit | `npx vitest run tests/discounts-repository.test.ts` — asserts `reversedAt` set, `remainingRedemptions` incremented, `deleteMany` never called; and that a second call returns `0`. |
| R17 | Regression | `git diff origin/staging -- lib/repositories/orders.ts` shows no edit inside `releaseOrder`'s body, and `npx vitest run tests/orders.test.ts` passes its pre-existing `releaseOrder` cases unmodified. |
| R18 | Unit | `npx vitest run tests/discounts-repository.test.ts` — a case with existing rows at `seq` 0 and 2 asserts the next allocation is `3`, while `customerUseCount` passed to `evaluateCode` counts only un-reversed rows. A first-ever claim still allocates `seq = 0`, matching today's behaviour on empty data. |
| R19 | Integration | **live** — `npx tsx specs/2026-09-17-p696-staff-cancel-confirmed-order/verify-cancel.ts --reclaim` prints `second claim accepted, seq=1 (reversed row seq=0 retained)` and exits 0. |
| R20 | Unit | `npx vitest run tests/discounts-repository.test.ts` exits 0 and the file exists — **these are new tests; `tests/discounts.test.ts` covers only the pure `evaluateCode` today, so there is no pre-existing coverage to lean on.** The concurrency case drives two `recordCodeRedemption` calls at the same `seq` against a client whose second `create` raises a `23505`, and asserts one row plus a `CUSTOMER_LIMIT_REACHED` for the loser. |
| R21 | Unit | `grep -n "getPrisma()" lib/orders-service.ts` shows no new occurrence in `getOrderCancelService`; the facade uses `getPrismaWs()`. Confirmed live by R9 succeeding at all — `updateMany` through `getPrisma()` crashes unconditionally. |
| R22 | Unit | `grep -A8 "export function getOrderCancelService" lib/orders-service.ts` shows both `cancelUnpaid` and `cancelConfirmed`. |
| R23 | Unit | `head -1 features/orders/cancel-order-staff.ts` is `"use server";`, and every other top-level `export` in the file matches `export async function`. Verified by eye **and** by the file 500ing at runtime if violated — R25's curl check is what actually proves it. |
| R24 | Security | Under `npm run preview`, POST the action with a **non-ADMIN** staff session cookie (curl, no browser needed — see `docs/developer-portal/local-dev-playbook.md`). The order's status is unchanged afterwards, confirmed by re-reading `/staff/orders/<n>`. |
| R25 | Security | Under `npm run preview`, POST the action naming an order that is `DELIVERED`, with a valid ADMIN session. Response completes without error and the order is still `DELIVERED` — no ledger, inventory or event row was written. |
| R26 | E2E | Under `npm run preview`, `curl` `/staff/orders/<confirmed-order>` as ADMIN: the HTML contains the cancel form and a `required` reason input. `curl` `/staff/orders/<delivered-order>`: it does not. |
| R27 | Regression | `curl` `/staff/orders` as ADMIN under preview and grep the HTML — no cancel control, and the advance button is present exactly as before. |
| R28 | Regression | `npx vitest run tests/staff-nav-parity.test.ts` plus the hub and operator-guide tests exit 0 (no new `/staff/*` page was added, so all three should be untouched). |
| R29 | Unit | `npx vitest run tests/order-status-email.test.ts` — asserts a `CANCELLED` entry exists and that its `body` matches `/no payment has been returned/i` and does **not** match `/refund|refunded|repaid/i`. |
| R30 | Regression | `npx vitest run tests/order-status.test.ts` — `orderStatusLabel("CANCELLED")` is `"Cancelled"` and `buildTimeline`'s existing cases pass; `git diff origin/staging -- lib/order-status.ts` shows no edit to either function. |
| R31 | Unit | `grep -n "Staff cannot cancel" lib/order-status.ts` returns nothing; `grep -n "An EARN cannot be" lib/repositories/loyalty.ts` returns nothing; `grep -n "only ever acts on PENDING_PAYMENT" components/orders/OrderPointsNote.tsx` returns nothing. Each location instead references #696. |
| R32 | Unit | `grep -n "2026-09-17\|#696" specs/decisions/ADR-005-payments-money-flow.md` shows the new implementation note, and both pre-existing "cannot be reversed" passages now cross-reference it. |
| R33 | Unit | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`; `grep -c "p696-staff-cancel-confirmed-order" ARTIFACT_INDEX.md` returns at least `1`; `npm run kms:check-generated` exits 0. |
| R34 | Unit | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new entry names #696, #137 and #151. |
| R35 | Release | Run each alone, in order: `npm run lint`; `npm run typecheck`; `npm run format:check`; `npx vitest run` (**on its own** — not after a build); `npm run build`. All exit 0. Then `npm run kms:assemble:internal` and a real Next build in `kms/site-internal`, since `docs/` and `specs/` changed and `gates` never builds the docs site. |
