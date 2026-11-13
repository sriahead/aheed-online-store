# Notification gaps (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/order-notification-messages.test.ts` and `tests/order-notification-guard.test.tsx` iterate `ORDER_EVENTS`, so PAYMENT_FAILED gets the link, escaping and no-marketing checks; `tests/notification-gaps.test.ts` checks its subject and copy. |
| R2 | `tests/notification-gaps.test.ts`, the webhook case: a transitioned async failure notifies once, an expired session and a refused failure do not. |
| R3, R4 | `tests/contact-form.test.ts`: success acknowledges once with no shopper text; honeypot, rejection cases do not; a rejecting acknowledgement leaves success. |
| R5 | `tests/notification-gaps.test.ts`: the registration text and method, no PII, and a throwing sender is swallowed. |
| R6 | `tests/notification-gaps.test.ts`: unset, blank, trimmed. |
| R7 | `tests/notification-gaps.test.ts`: breached + set sends once; a fresh marker suppresses; unset chat sends nothing; a failing send resolves. |
| R8 | Staging check after deploy, recorded in `build-notes.md`. |

Lint, typecheck, format:check and the full vitest suite (`--maxWorkers=4`) pass.
