---
id: 2026-11-05-order-updates-notifications-plan
title: "Order updates: notification queue, owner email + Telegram, live order tracker (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-05
visibility: internal
summary: Every paid-order event reaches the customer by email and the store owner by email and Telegram, through one channel-neutral queue that retries failures. The customer's order page becomes a live progress tracker, and the staff Orders page shows new orders without a reload.
tags: [notifications, email, telegram, orders, queue, scheduler, ux]
related: [2026-11-04-order-alerts-telegram-plan, 2026-11-03-storefront-contact-form-plan, 2026-11-01-cloudflare-email-service-plan, architecture]
---

# Order updates: notification queue, owner email + Telegram, live order tracker (plan)

Issue `#1435`. Proposed and approved on 2026-11-05. The owner's request was: "Order alerts should be sent to both the customer and the store owner via email and Telegram… reuse the existing email notification queue… if feasible." Two later rulings narrowed it:

- **Customer Telegram is parked** as `#1436`. A bot cannot message someone who has not started a chat with it, so that work needs an opt-in flow, consent and new personal data. It is a separate design.
- **The owner added a requirement:** "order updates via email and on website (interactive)… use consumer psychology, behavioural economics, cognitive biases, pricing psychology, neuromarketing where appropriate."

**Goal:** an order event never goes unnoticed and never silently disappears.
- The customer hears about every paid-order event by email.
- The store owner hears about it by email and Telegram.
- A provider outage delays a message rather than losing it.
- The customer sees their order move on the website without reloading.

## Why a new queue, not the contact outbox

`ContactOutbox` (#1409) is the only queue in the codebase. It does not fit order notifications:

- **Email-only columns.** It stores `toAddress`, `html` and `replyTo`.
- **Retention.** It keeps a shopper's message for 7 days, which is right for a complaint. It is wrong for "your order is out for delivery", which is misleading a day later.

Putting Telegram rows in it would mix two unrelated jobs. So this slice adds `NotificationOutbox`, a queue for any channel, and **reuses the contact outbox's whole mechanism** unchanged in shape:

- send first, and queue only on failure, so the normal path writes nothing to the database;
- a `JOB_SIGNALS` KV "pending" marker;
- the scheduler's 15-minute tick plus its daily run, where every doubt runs the job;
- a token-guarded `POST /api/jobs/...` route;
- vendor-scoped repository functions;
- attempts and `lastError` columns;
- expiry by age, with logs that name only the row id and the vendor.

`ContactOutbox` itself does not change.

**Rejected alternatives:**

- **Cloudflare Queues.** A new infrastructure binding in three environments. `specs/architecture.md` defers a `JobQueue` port to the ~10k orders/day stage, and nothing at this volume needs it.
- **Write every message to the database before sending.** This makes the happy path pay a write per message. It also races the scheduler, so a message could be sent twice.

## Scope (this slice)

**1. Queue: `lib/notifications/`, `lib/repositories/notification-outbox.ts` and the retry job**

- **The table.** `NotificationOutbox` has `channel` (`EMAIL` | `TELEGRAM`), `destination`, `subject` (email only), `body`, `replyTo`, `attempts` and `lastError`.
- **The dispatcher.** `dispatchNotifications` sends each message through its channel, using `EmailService` or the #1390 Telegram adapter. It queues only the ones that came back `failed` or threw.
- **The retry job.** `/api/jobs/retry-notification-outbox` retries up to 50 rows per run and deletes a row once it is sent. A row still unsent after **24 hours** is deleted unsent.
  - 24 hours, not the contact outbox's 7 days, because a stale order update is worse than none: the order page and the staff panel stay the truth.
- **Scheduling.** The scheduler calls the job on the 15-minute tick while `notification-outbox:pending` is set, and always in the daily run.

**2. Events: one entry point, `notifyOrderEvent(order, event)`**

- **The events.** `CONFIRMED` (a new paid order), `OUT_FOR_DELIVERY`, `DELIVERED`, `READY_FOR_COLLECTION`, `COLLECTED` and `CANCELLED`.
- **The call sites it replaces.** Today's direct email calls go: `sendOrderConfirmationEmail` at four confirm sites, and `sendOrderStatusEmail` at three status sites.
- **Unpaid orders.** Cancelling an unpaid order (the customer abandoning checkout, or the payment sweep) is not an order event and sends nothing, as today.
- **Staff "Resend confirmation email".** This still reaches only the customer.

**3. Customer emails, reworked**

- The same six emails customers get today, now sent through the queue.
- Each one leads with what happens next, using the order's real slot.
- Each one has one "View your order" button linking to the right page:
  - a member's account page;
  - a guest's tokenised confirmation page;
  - otherwise, the lookup page.

**4. Owner messages (new)**

- **Email** goes to the store's ORDERS receiving mailbox, falling back to SUPPORT, from Client Setup (#1217). It has Reply-To set to the customer.
- **Telegram** goes to the #1390 recipients from Client Setup.
- **Content.** Short and easy to scan: event, order number, total, item count, method and slot, Express, and a link to `/staff/orders/<n>`.
- **No customer data in Telegram.** The Telegram text carries no customer name, address, email or product names, because Telegram is a third party and a group can have many members.
- **Bulk actions.** A bulk status change sends the owner **one digest per channel**, not one message per order. 30 messages at once would also hit Telegram's limit of about 20 messages a minute per group.

**5. Website (interactive)**

- **The tracker.** `OrderProgressTracker` shows every step of the order's own path, including the ones still to come (Delivery: Confirmed → Out for delivery → Delivered. Collection: Confirmed → Ready for collection → Collected). It marks the current step and gives a "What happens next" line.
  - It replaces `OrderTimeline` on the account order page.
  - It replaces the lookup page's hand-rolled stepper, which is delivery-only, shows a collection order the wrong steps, and prints the raw status enum.
  - It is added to the checkout confirmation page.
- **Auto-refresh.** `LiveRefresh` calls `router.refresh()` every 45 seconds while the tab is visible, until the order reaches a final status.
  - It is used on the account order page and the checkout confirmation page.
  - Not on the guest lookup page, because each lookup spends the rate-limit budget.
  - It is polling, not a push connection. A held-open connection on Workers costs more and adds nothing a grocery order needs.
- **Staff Orders page.** It refreshes every 30 seconds, says "N new orders since you opened this page", and has an optional sound that is off by default.

**Copy and UX psychology, applied where it helps, within UK law**

| Principle | Applied as |
|---|---|
| Uncertainty reduction | Every email and the tracker lead with what happens next and the real slot. |
| Goal-gradient effect / Zeigarnik effect | The tracker shows all steps, including the ones still to come, so progress is visible. |
| Peak–end rule | The final email (delivered or collected) closes warmly, shows the points earned (only where the points scheme applies), and has one "something not right? reply" route. |
| Cognitive load | The status and order number come first in the subject, there is one button, and the body is short. |
| Pricing psychology | "You saved £X" appears only from a recorded `discountPence`. No anchors or "was" prices. |
| Reciprocity / endowment | The points earned are shown on confirmation and on the final email. |
| Neuromarketing | Limited to a calm visual hierarchy: colour for the current step, and motion only under `motion-safe`. Nothing designed to grab attention. |

- **Excluded on purpose.** Urgency, scarcity, social proof, cross-sell and "reorder" prompts.
  - Fake urgency and similar pressure tactics are banned under the DMCC Act 2024 and the CMA's online choice architecture guidance.
  - Marketing in a transactional email needs consent under PECR.
- **The guard.** A test enforces the exclusion against every template.

**6. Docs and the privacy policy**

- `specs/architecture.md`: the integration row and the queue note. This was updated with the spec.
- `app/(storefront)/privacy/page.tsx`: order updates go to staff by messaging service, without customer details, and undelivered updates are held for up to 24 hours. The page reads the hours from `lib/data-retention.ts`, like the policy's other retention periods.
- Three operator guides:
  - `docs/platform-admin-guide/platform-admin-guide.md` (where order notifications go);
  - `docs/staff-playbook/staff-tabs-guide.md` (the live Orders page);
  - `docs/shopper-help/shopping-guide.md` (tracking an order and which emails arrive).

## Deliberately excluded

- **Customer Telegram:** `#1436`, parked.
- **WhatsApp:** `#1424`.
- **Per-event owner preferences** (for example "only new orders and cancellations"). The owner chose every event. A mute setting is a follow-up only if the owner asks for one.
- **Refund notifications.** No code path issues refunds (`#606`). The cancellation copy keeps saying plainly that no payment has been returned.
- **`PENDING_PAYMENT` notifications.** An unpaid order is not yet an order.
- **Staff notes** (`OrderStatusEvent.note`). These never reach a customer message or the tracker, following the P4a rule in `lib/order-status.ts`.
- **Moving `ContactOutbox` onto the new table.** It works, and its 7-day retention is deliberate.
- **Server-sent events or websockets** for the live pages.

## Open items carried forward

- **Live Telegram checks** need the staging group set up for #1390. That was done on 2026-11-05: a test alert was received.
- **Production** needs `TELEGRAM_BOT_TOKEN` set after promotion, which is #1390 step 9.
