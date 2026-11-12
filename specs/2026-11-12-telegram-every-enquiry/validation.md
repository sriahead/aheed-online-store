# Telegram alert for every contact-form enquiry (validation)

| Req | How to verify |
| --- | --- |
| R1, R2, R3, R5 | `tests/contact-form.test.ts`, "processContactSubmission order alert". An enquiry with no order alerts once with `contactType: "ENQUIRY"`. A complaint carries `contactType: "COMPLAINT"`. The no-alert table and the rejecting-alert case still pass. |
| R4 | `tests/order-alert.test.ts`, "formatOrderAlert". It covers each heading, the staging tag on a typed heading, and the unchanged default. |
| R6 | After the staging deploy, submit an ENQUIRY through `/contact` on `staging.aheedfoodcentre.co.uk` while tailing `afc-store-staging`. Expect `status=sent`. |

Lint, typecheck, format:check and the full vitest suite (`--maxWorkers=4`) pass.
