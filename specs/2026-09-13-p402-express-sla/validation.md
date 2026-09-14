---
id: p402-express-sla-validation
title: P402 Express SLA Validation
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-09-13
visibility: internal
summary: Validation for Express SLA.
---
| Req | How to verify |
|---|---|
| R1 | Inspect `prisma/schema.prisma` for `expressCollectionEnabled` on `VendorConfig`. |
| R2 | Inspect `prisma/schema.prisma` for the `VendorExpressSchedule` relational model and verify no JSON columns are used. |
| R3 | Inspect `prisma/schema.prisma` for `targetFulfilmentTime` on `Order`. |
| R4 | In the browser, configure an active express schedule, enter checkout, select Collection, and verify the Express option is presented. |
| R5 | Run `npm run test -- tests/express-sla.test.ts` to assert that `targetFulfilmentTime` is correctly populated ONLY upon the transition from `PENDING_PAYMENT` to `CONFIRMED`. |
| R6 | In the staff queue browser, view a `CONFIRMED` Express order and verify the countdown timer is visible. |
| R7 | In the staff queue browser, view an Express order with a `targetFulfilmentTime` in the past and verify the row/badge is styled as breached (e.g. red). |

