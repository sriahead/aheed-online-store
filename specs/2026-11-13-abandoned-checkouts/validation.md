# Abandoned checkouts (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/staff-nav-parity.test.ts`, `tests/operator-doc-coverage.test.ts`, `tests/page-container.test.ts`; on staging, the page loads for an admin and refuses staff. |
| R2, R3, R5 | `tests/abandoned-checkout.test.ts`: `reminderBlock`, `isOfferableCode`, and `sendAbandonedCheckoutReminder` (claim before send, server-side refusals, code refusal, lost claim). |
| R4 | `tests/abandoned-checkout.test.ts`, "buildRecoveryEmail": items, total, one button, opt-out, escaping, code copy, banned urgency phrases. |
| R6 | `kms:validate`, `kms:build-index`; the docs site build. |

Lint, typecheck, format:check and the full vitest suite (`--maxWorkers=4`) pass.
