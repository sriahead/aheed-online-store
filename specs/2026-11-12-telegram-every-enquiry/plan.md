---
id: 2026-11-12-telegram-every-enquiry-plan
title: "Telegram alert for every storefront contact-form enquiry (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "Every successful storefront contact-form submission alerts the store's order-alert recipients, not only complaints and order-related messages; the alert heading names the contact type. No migration."
tags: [telegram, alerts, contact-form, enquiries]
related: [2026-11-04-order-alerts-telegram-plan, 2026-11-03-storefront-contact-form-plan]
---

# Telegram alert for every contact-form enquiry (plan)

Issue #1548. On 2026-11-12 the owner ran an end-to-end test on Aheed staging. A contact-form
**enquiry** reached `/staff/enquiries` and the forward-to email but sent no Telegram alert, because
`lib/contact/submit.ts` alerted only on a complaint or a message naming the shopper's own order
(#1390 R12). The owner chose "Alert on every enquiry". The proposal was approved as written ("approved,
go ahead and push to prod after staging test").

## Change

1. `lib/contact/submit.ts`: drop the `type === "COMPLAINT" || orderNumber !== null` condition. A
   submission that reaches success alerts once. Honeypot, invalid, rate-limited, order-not-found and
   no-recipient submissions return earlier and still never alert.
2. `lib/order-alert/brief.ts`: `OrderAlertBrief` gains an optional `contactType` (`COMPLAINT` or
   `ENQUIRY`). The heading reads `Complaint: <store>` or `Enquiry: <store>` when it is set, and
   `Order inquiry: <store>` otherwise, so the email route and the Client Setup test alert are
   unchanged. The brief still carries no message body, email address or phone number (#1390 R5).
3. Tests updated in `tests/contact-form.test.ts` and `tests/order-alert.test.ts`.

## Out of scope

- Inbound emails that are not order-related still do not alert (`workers/inbound-email`).
- Removing the stale staging recipient `-5277792253` (owner, Client Setup).

## Rollout

Staging, then an Aheed staging check (enquiry → Telegram), then promotion to `main`. No migration,
no new secret.
