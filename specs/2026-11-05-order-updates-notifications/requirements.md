# Order updates: notification queue, owner email + Telegram, live order tracker (requirements / acceptance criteria)

**What this does.** Issue `#1435`. It builds on `#1390`'s Telegram adapter and recipients, `#1409`'s contact outbox pattern, and `#1217`'s `EmailService`.

- Every paid-order event reaches the customer by email, and the store owner by email and Telegram.
- Messages go through one channel-neutral queue, which retries any message that fails.
- The customer order pages gain a live progress tracker.
- The staff Orders page shows new orders without a reload.

`plan.md` carries the reasoning, including why `ContactOutbox` is not reused and what was deliberately excluded. Customer Telegram is `#1436` and is out of scope.

## Definitions used below

- **Order event:** one of `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `READY_FOR_COLLECTION`, `COLLECTED` and `CANCELLED`.
  - It occurs when a paid order is confirmed (payment captured), or when staff move a paid order to one of the other five statuses.
- **Final status:** `DELIVERED`, `COLLECTED` or `CANCELLED`.
- **Canonical host:**
  - the vendor's `VendorDomain.host` with `isCanonical = true`, taking the lowest `host` alphabetically if several have it;
  - otherwise none.
  - The **base URL** is `https://<canonical host>`.
- **Slot label:** when the order has both `fulfilmentDate` and a `fulfilmentSlot`, it is `<weekday> <day> <month>, <startTime>–<endTime>`.
  - The date is formatted `en-GB` in `Europe/London`, for example `Thursday 6 November, 10:00–12:00`.
  - Otherwise there is no slot label.
- **Environment tag:** `withEnvironmentTag` from `lib/email/environment-tag.ts`. It prefixes `[STAGING] ` or `[DEV] ` and adds nothing in production.

## Queue

**R1. The migration.** `prisma/migrations/20261105120000_notification_outbox/migration.sql` exists and does three things:

- creates the enum `"NotificationChannel"` with the values `EMAIL` and `TELEGRAM`;
- creates the table `"NotificationOutbox"` with these columns:
  - `id` text primary key;
  - `vendorId` text not null, with a foreign key to `"Vendor"` and `ON DELETE CASCADE`;
  - `channel` `"NotificationChannel"` not null;
  - `destination` text not null;
  - `subject` text null;
  - `body` text not null;
  - `replyTo` text null;
  - `attempts` integer not null, default 0;
  - `lastError` text null;
  - `createdAt` timestamp(3) not null, default `CURRENT_TIMESTAMP`;
- creates an index on `("vendorId", "createdAt")`.

Further conditions:

- The file contains no `DROP` statement.
- Its header comment says it was hand-authored, and why (`#895`).
- `prisma/schema.prisma` has a matching `NotificationOutbox` model and `NotificationChannel` enum.
- `npx prisma validate` exits 0.

**R2. The repository.** `lib/repositories/notification-outbox.ts` exports four functions: insert, list oldest-first with a limit, delete by id, and record failure (attempts and `lastError`).

- Each takes a Prisma client and a `vendorId` as explicit parameters, and filters every query by `vendorId`.
- `tests/repository-purity.test.ts`, `tests/repository-client-injection.test.ts` and `tests/repository-vendor-scoping.test.ts` pass with the file present.
- The insert is a singular `create` with no nested writes.

**R3. The dispatcher.** `lib/notifications/dispatch.ts` exports `dispatchNotifications(deps, vendorId, messages)`. Each message has `channel`, `destination`, `body`, an optional `subject`, an optional `replyTo` and a log context (`audience`: `CUSTOMER` | `OWNER`, and `event`).

- `EMAIL` messages go through `deps.email.send`. `TELEGRAM` messages go through `deps.telegram.send(destination, body)`, the `#1390` adapter interface.
- The messages in one call are sent concurrently (`Promise.allSettled`), so a slow Telegram reply (the adapter times out after 5 s) delays a Stripe webhook response by one timeout at most, not one per message.
- A result of `sent` or `skipped` stores nothing.
- A result of `failed`, or a thrown send, does two things:
  - inserts one outbox row with `attempts = 1` and `lastError` set to the reason;
  - calls `deps.markPending()` once per dispatch call.
- `dispatchNotifications` never rejects, even when the insert or the marker rejects; that failure is logged.
- Unit tests cover:
  - sent;
  - skipped;
  - failed, which queues;
  - thrown, which queues;
  - an insert that rejects, where the dispatch still resolves;
  - a mixed batch, where only the failed messages are queued.

**R4. The retry job route.** `app/api/jobs/retry-notification-outbox/route.ts` exists and answers as follows:

| Request | Response |
|---|---|
| `GET` | 405 |
| `POST` with `JOB_INVOCATION_TOKEN` unset | 503 |
| `POST` with a missing or wrong `x-job-token` | 401 |
| `POST` with the correct token | 200, JSON `{ sent, failed, expired, remaining }` |

**R5. The retry run.** `runNotificationOutbox(deps)` processes rows as follows:

- It handles at most 50 rows per run, oldest first within each vendor, using vendor-scoped queries.
- A row whose `createdAt` is more than 24 hours old is deleted unsent and logged with only its id and vendor id.
- A row that comes back `sent` or `skipped` is deleted.
- A row that comes back `failed` has its `attempts` incremented and `lastError` set.
- After the run, the pending marker is cleared when no rows remain for any vendor, and set otherwise.
- Unit tests cover each of these branches and the 50-row budget.

**R6. The scheduler.** The scheduler calls the retry job on these conditions:

- `workers/scheduler/src/select-jobs.ts` exports `NOTIFICATION_OUTBOX_PATH = "/api/jobs/retry-notification-outbox"` and includes it in `ALL_JOB_PATHS`.
- `selectJobs` returns it in these cases:
  - always on `DAILY_CRON`;
  - on the 15-minute tick when the `notification-outbox:pending` read succeeded with any value;
  - on the 15-minute tick when that read failed.
- `selectJobs` does not return it when the read succeeded with no value.
- `lib/job-signal-keys.ts` exports `NOTIFICATION_OUTBOX_PENDING_KEY = "notification-outbox:pending"`, and `lib/job-signals.ts` exports `markNotificationOutboxPending` and `clearNotificationOutboxPending`.
- `workers/scheduler/src/index.ts` reads the key and passes it to `selectJobs`.
- The scheduler's tests cover all four cases.

**R7. No personal data in logs.** No line logged by the dispatcher, the retry run or `notifyOrderEvent` contains:

- a destination (an email address or a chat id);
- a subject;
- a body;
- a product name;
- a customer name.

The per-message line has the form `notification vendorId=<id> channel=<EMAIL|TELEGRAM> audience=<CUSTOMER|OWNER> event=<event> status=<sent|skipped|queued>`, followed by ` reason=<reason>` when the status is `skipped` or `queued`. A unit test asserts both the format and the absence of a planted secret in each of these fields.

## Events

**R8. The entry point.** `notifyOrderEvent(order, event)` lives in `lib/order-notifications-service.ts`. The message building it calls is pure and lives in `lib/order-notifications/`.

- For an order event, it builds the customer message (R11–R14) and the owner messages (R15–R17), then dispatches them all through R3.
- For any other status, it builds nothing.
- It never rejects.

**R9. The call sites.** These seven call sites call `notifyOrderEvent`, and no longer call `sendOrderConfirmationEmail` or `sendOrderStatusEmail`:

| Call site | Event |
|---|---|
| `app/api/webhooks/stripe/route.ts` | `CONFIRMED` |
| `lib/payment-check-service.ts`, the payment-check path | `CONFIRMED` |
| `lib/payment-sweep-service.ts` | `CONFIRMED` |
| `features/payments/reconcile-refusal.ts` | `CONFIRMED` |
| `features/orders/advance-status.ts` | the new status |
| `features/orders/cancel-order-staff.ts` | `CANCELLED` |
| `features/orders/advance-status-bulk.ts` | per order, but as R18 |

When this is done, `grep -rn "sendOrderConfirmationEmail\|sendOrderStatusEmail" app lib features --exclude=docs.ts` finds no match.

*Amended at Build (2026-11-05):* added `--exclude=docs.ts`. `app/(admin)/staff/runbook/docs.ts` is generated by `kms:build-index` from every spec, including the historical P3c and P4b specs that name both functions, so the grep as first written could never return nothing.

**R10. No notifications for unpaid orders; resend reaches only the customer.**

- An unpaid order cancelled by `features/checkout/cancel-order.ts`, or by the payment sweep's expiry of a `PENDING_PAYMENT` order, produces no notification.
- Staff "Resend confirmation email" (`resendConfirmation` in `lib/payment-check-service.ts`) dispatches only the customer `CONFIRMED` email, with no owner messages. A test asserts both.

## Customer email

**R11. Recipient, sender and subject.**

- The customer email for an event goes to the order's buyer email.
- With no buyer email, no customer message is built, and the R7 line is logged with `status=skipped reason=no buyer email`.
- The sender is the vendor's `senderName` and `senderEmail`.
- The subject is `Order <orderNumber> <phrase> — <senderName>`, with these phrases:

| Event | Phrase |
|---|---|
| `CONFIRMED` | `is confirmed` |
| `OUT_FOR_DELIVERY` | `is on its way` |
| `DELIVERED` | `has been delivered` |
| `READY_FOR_COLLECTION` | `is ready to collect` |
| `COLLECTED` | `has been collected` |
| `CANCELLED` | `has been cancelled` |

**R12. "What happens next".** Each customer email body contains the "What happens next" text below for its event and fulfilment method. When there is a slot label, it is followed by the slot sentence shown.

- This text comes from **one module**, `lib/order-notifications/next-step.ts`. The tracker (R20) uses the same module.
- The `CANCELLED` text is the existing copy from `features/orders/send-status-email.ts`, and still does not contain the word `refund`.

| Event (method) | Text | Slot sentence |
|---|---|---|
| `CONFIRMED` (delivery) | `We'll pack your order and email you when it's out for delivery.` | `Your delivery slot: <slot label>.` |
| `CONFIRMED` (collection) | `We'll pack your order and email you as soon as it's ready to collect.` | `Your collection slot: <slot label>.` |
| `OUT_FOR_DELIVERY` | `Our driver has your order now. Please keep your phone nearby in case they need to reach you.` | `Expected: <slot label>.` |
| `READY_FOR_COLLECTION` | `Your items are packed and waiting for you in store. Bring your order number: <orderNumber>.` | `Your collection slot: <slot label>.` |
| `DELIVERED`, `COLLECTED` | `Nothing else to do. If anything isn't right, reply to this email and we'll put it right.` | none |

**R13. Order details, savings, points and the order link.**

- Each customer email contains the order's items table and total.
- The `CONFIRMED` email keeps its subtotal, discount-split, delivery and total rows.
- The `CONFIRMED` email contains `You saved <formatPrice(discountPence)> on this order.` if and only if `discountPence > 0`.
- The `CONFIRMED`, `DELIVERED` and `COLLECTED` emails contain `You earned <N> loyalty points on this order.` if and only if `pointsEarned > 0`.
- With a canonical host, the email contains exactly one `<a>` element, with text `View your order`. Its `href` is:
  - for a member order (`userId` set): `<base>/account/orders/<orderNumber>`;
  - for a guest order with a `confirmationToken`: `<base>/checkout/<orderNumber>?t=<token>`;
  - otherwise: `<base>/orders/lookup?orderNumber=<orderNumber>`.
- With no canonical host, the email contains no `<a>` element.

**R14. Escaping.** Every shopper- or vendor-supplied string interpolated into a customer or owner email's HTML goes through `escapeHtml`. This covers product names, custom notes, the store name and the discount code. A test passes a product name of `<script>x</script>` through every event's customer and owner email, and finds no `<script>` in the output.

## Owner messages

**R15. Owner recipients.**

- **Owner email** goes to the `forwardTo` of the vendor's first `ORDERS` inbound address (lowest `address`). Failing that, it goes to the first `SUPPORT` one. Failing both, there is no owner email.
  - The platform default inbox is **not** used.
- **Owner Telegram** goes to every `VendorOrderAlertRecipient` with `channel = TELEGRAM`, through the same adapter and `TELEGRAM_BOT_TOKEN` as `#1390`.
- A vendor with neither recipient gets no owner messages and no error.

**R16. Owner Telegram text.** The text is plain, with these lines in order:

1. The title, under the environment tag: `<title>: <store name>`. The title is:

   | Event | Title |
   |---|---|
   | `CONFIRMED` | `New order` |
   | `OUT_FOR_DELIVERY` | `Out for delivery` |
   | `DELIVERED` | `Delivered` |
   | `READY_FOR_COLLECTION` | `Ready for collection` |
   | `COLLECTED` | `Collected` |
   | `CANCELLED` | `Cancelled` |

2. `Order: <orderNumber>`
3. `Total: <formatPrice(totalPence)> (<k> items)`, where `k` is the sum of the quantities.
4. `Delivery: <slot label>` or `Collection: <slot label>`. Without a slot label, `no slot` takes its place. ` · Express` is appended when `isExpress` is true.
5. Only with a canonical host: `<base>/staff/orders/<orderNumber>`.

The text contains none of the buyer's email, name or address, and no product names. A unit test asserts this with planted values.

**R17. Owner email.**

- The subject is `<title>: order <orderNumber> — <formatPrice(totalPence)>`, using R16's titles.
- The body carries:
  - R16's facts;
  - the items table;
  - with a canonical host, one `<a>` with text `Open in staff panel`, linking to `<base>/staff/orders/<orderNumber>`.
- `replyTo` is the buyer email when there is one.
- The sender is the vendor's `senderName` and `senderEmail`.

**R18. Bulk status changes.** `advanceStatusBulk` sends one customer email per order that moved, plus **one owner digest** per owner recipient per channel, for each target status in the batch. It sends no per-order owner messages.

- The digest's first line is `<title>: <k> orders` under the environment tag.
- It then lists the order numbers, one per line, up to 20, followed by `+<n> more` when there are more than 20.
- The digest email's subject is its first line.
- A unit test covers a batch of 25.

## Website

**R19. Data for the tracker.** The data the tracker needs is available on every page that shows it:

- `findOrderForGuestLookup`'s result (`GuestLookupOrder`) gains `fulfilmentMethod`, a slot label input, and the order's status events (`status` and `createdAt` only, never `note`).
- `WebhookOrder` gains `fulfilmentMethod`, `fulfilmentDate`, the slot's `startTime`/`endTime`, `isExpress` (already present) and `confirmationToken`.
  - `confirmationToken` is used only to build the guest link in R13.

**R20. The tracker component.** `components/orders/OrderProgressTracker.tsx` renders an `<ol>`. The steps are, for `DELIVERY`, `Order confirmed`, `Out for delivery` and `Delivered`; for `COLLECTION`, `Order confirmed`, `Ready for collection` and `Collected`.

- Each step has `data-state` set to `done`, `current` or `upcoming`.
- The current step has `aria-current="step"`.
- A done step shows its time from the timeline, formatted with `formatOrderDateTime`.
- For `PENDING_PAYMENT`, the first step is current and is labelled `Confirming payment`.
- For `CANCELLED`, there is no step list. Instead it renders a single `Order cancelled` state with the cancellation time.
- Below the steps it renders R12's text for the current status, with no `<a>` link.
- The current-step label sits inside an element with `aria-live="polite"`.
- Any transition or animation class is prefixed `motion-safe:`.
- Unit tests cover:
  - both methods at every status;
  - `PENDING_PAYMENT`;
  - `CANCELLED`.

**R21. Where the tracker appears.**

- The account order page `app/(storefront)/account/orders/[orderNumber]/page.tsx` renders `OrderProgressTracker` in place of `OrderTimeline`.
- The checkout confirmation page `app/(storefront)/checkout/[orderNumber]/page.tsx` renders it for every status except `CANCELLED`.
- The guest lookup page `app/(storefront)/orders/lookup/page.tsx` renders it in place of its own step array.
  - That page no longer contains a locally defined steps array or `getStepIndex`.
  - It never renders a raw status enum value: the strings `PENDING_PAYMENT`, `OUT_FOR_DELIVERY` and `READY_FOR_COLLECTION` do not appear in its rendered HTML.

**R22. `LiveRefresh`.** `components/orders/LiveRefresh.tsx` is a `"use client"` component taking `active` and `intervalMs`, which defaults to 45000.

- While `active` is true and `document.visibilityState === "visible"`, it calls `router.refresh()` every `intervalMs`.
- On a `visibilitychange` to visible, it refreshes at once if at least `intervalMs` has passed since the last refresh.
- It does nothing while hidden, and nothing when `active` is false.
- It renders no DOM.
- Placement:
  - the account order page and the checkout confirmation page render it with `active` true exactly when the status is not a final status;
  - the guest lookup page does not render it.
- Unit tests with fake timers cover:
  - a refresh each interval;
  - no refresh while hidden;
  - a refresh on becoming visible;
  - none when inactive.

**R23. Staff Orders page.** `app/(admin)/staff/orders/page.tsx` renders `LiveRefresh` with `active` true and `intervalMs` 30000. It also renders a client `NewOrdersNotice`:

- It receives the order numbers of the vendor's orders currently in `CONFIRMED`: the 100 most recent by `createdAt`, read by a query that does not depend on the page's own status filter or pagination.
- It records the set from its first render.
- It shows `<k> new order since you opened this page` or `<k> new orders since you opened this page` when later renders contain `k > 0` numbers that were not in that set.
- A `Dismiss` button resets the recorded set.
- A checkbox labelled `Sound for new orders` is unchecked by default. Its state is kept in `localStorage` under `staff-orders-sound`, and every `localStorage` read and write is wrapped in try/catch.
- When the box is checked and `k` increases, it plays a short tone through the Web Audio API. No audio file is added.
- The page renders and the notice works when `localStorage` throws.
- Unit tests cover:
  - the count;
  - dismiss;
  - the default-off sound;
  - a throwing `localStorage`.

## Guards

**R24. Transactional-only guard.** A test renders every customer email, owner email and owner Telegram text, for every event, both methods, and with and without discount and points. It also renders the tracker for every state. It asserts that none contains, case-insensitively, any of:

- `shop again`
- `reorder`
- `recommended`
- `you might also like`
- `% off`
- `sale`
- `hurry`
- `last chance`
- `limited time`
- `only a few`
- `don't miss`
- `people are`

## Docs and gates

**R25. Docs.**

- `specs/architecture.md`:
  - the "Staff alerts" integration row names `NotificationOutbox` and order-event messages;
  - the document records that order notifications go through `NotificationOutbox`, and that `ContactOutbox` remains contact-only.
- Each of these three files has a section naming the behaviour this slice adds:
  - `docs/platform-admin-guide/platform-admin-guide.md`: which owner email address and Telegram recipients get order notifications, and which events.
  - `docs/staff-playbook/staff-tabs-guide.md`: the Orders page refreshes by itself, shows the new-orders notice and has the sound toggle.
  - `docs/shopper-help/shopping-guide.md`: the live tracker and which emails a customer receives.
- `npm run kms:validate` and `npm run kms:check-generated` exit 0.

**R26. Privacy policy.** `app/(storefront)/privacy/page.tsx` states two things:

- **Order updates to staff.** Order updates (order number, status, total, item count and slot) are passed to the store's staff through a messaging service, without the customer's name, address or contact details.
- **Retry retention.** An order update that could not be delivered is held for retry for at most `NOTIFICATION_OUTBOX_RETENTION_HOURS` hours, and then deleted.

`NOTIFICATION_OUTBOX_RETENTION_HOURS = 24` is exported from `lib/data-retention.ts`. Both this page and R5's expiry read it; no second literal exists.

**R27.** `CHANGELOG.md` is updated (Gate 4).

**R28.** `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check` and `npm run build` all remain green after this slice.
