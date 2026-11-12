# Staging allowlist: Client Setup addresses (validation)

| Req | How to verify |
| --- | --- |
| R1, R2, R3, R5, R6 | `tests/email-allowlist-client-setup.test.ts`. The repository lookup is mocked, and a test checks it is never called for a listed recipient or in open mode. |
| R4 | Same file: the test email is sent in allowlist mode. A source scan checks that only `lib/client-setup-service.ts` sets `recipientIsSignedInAdmin`. After deploy: on staging Client Setup, "Send test email" shows "Sent to …" instead of the allowlist refusal. |
| R7 | Same file: the page renders `ALLOWLIST_FORWARD_NOTE` only when `recipientMode` is "allowlist". After deploy, the note shows on staging Client Setup and not on production. |

Lint, typecheck and the full vitest suite (`--maxWorkers=4`) pass.
