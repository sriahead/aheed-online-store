---
id: 2026-11-13-notification-gaps-plan
title: "Notification gaps: payment failed, contact acknowledgement, registration and error alerts (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-13
visibility: internal
summary: "Fills four notification gaps: payment failed (customer email, owner alert), a contact acknowledgement email, a New account Telegram alert, and an hourly-capped error-rate Telegram alert. Reuses the #1435 dispatcher and outbox; no migration."
tags: [notifications, telegram, email, contact-form, payments, error-rate]
related: [2026-11-12-telegram-every-enquiry-plan, 2026-11-04-order-alerts-telegram-plan]
---

# Notification gaps (plan)

Issue #1552. On 2026-11-13 the owner pasted a full "email and Telegram notification MVP" brief. An
inspection found most of it already shipped: order confirmation and every status change (#1435,
customer email plus owner email and Telegram), the send-first outbox with retries, transition-keyed
de-duplication, and a Telegram alert for every contact message (#1390, #1548). The owner approved
these four gaps as proposed ("yes"):

1. **Payment failed.** `checkout.session.async_payment_failed` becomes the order event
   `PAYMENT_FAILED`, sent through the existing `notifyOrderEvent`: a customer email and the owner's
   email and Telegram. It fires only when `failPayment` performed the transition (`ok: true`), so a
   Stripe retry sends nothing. `checkout.session.expired` deliberately sends nothing: it is every
   abandoned checkout and would flood the channel.
2. **Contact acknowledgement.** Every successful contact submission also emails the shopper a fixed
   "we've received your message" note, from the store's sender, through `dispatchNotifications` (so
   a failed send is queued and retried with the store's sender). It never echoes the shopper's
   name, subject or message: the form accepts any address, and an echo would make it a relay.
3. **Registration alert.** Better Auth's `user.create.after` hook sends the store's Telegram
   recipients `New account: <store>`, the sign-up method, the time and a `/staff/customers` link.
   No name or email (Telegram is a third party, per #1435 R16). No welcome email: sign-up already
   sends the verification email.
4. **Critical errors.** When `/api/jobs/check-error-rate` breaches, it sends a Telegram message to
   the new optional `PLATFORM_ALERT_TELEGRAM_CHAT_ID`, at most once an hour (a KV marker in
   `JOB_SIGNALS`), resolving #437's open channel question. Unset means log-only, as today.

Out of scope: refunds (no refund flow exists, #606/ADR-005); live inbox delivery (#104).
