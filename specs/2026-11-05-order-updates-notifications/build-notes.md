# Order updates: notification queue, owner email + Telegram, live order tracker (build notes)

## Context for the validator

- **Issue:** `#1435`. Built 2026-11-05 on Opus, in the same session that proposed and specified it.
- **Worktree:** `E:\GitRepositories\aheed-online-store-orders`, branch `feature/order-updates-notifications`. Another session uses the main checkout, so validate in this worktree.
  - Its `.env` and `.dev.vars` are copies of the main checkout's. Both name the **dev** database (`ep-dry-morning`), checked by host against `secrets/staging.vars` and `secrets/production.vars`.
- **Commits:** spec `fcca5578`, implementation `0354f7c0`, build notes and CHANGELOG in the commit that adds this file.
- **Carried-forward docs.** The branch also carries the unpushed `#1390` post-ship docs branch (`docs/1390-post-ship`, merged at `40efa98c`), per the carry-forward rule. Those files (`docs/model-handoff.md`, `specs/roadmap.md`, `local-dev-playbook.md`, `env-setup.md`) are `#1390`'s, not this slice's.
- **The migration is NOT applied to dev yet.** The owner must run it before any preview check (R1 step 3, R3 integration, R5, R9-E2E, R18-E2E, R21-R23 E2E):
  ```
  ! cd /e/GitRepositories/aheed-online-store-orders && env -u DIRECT_URL -u DATABASE_URL npx prisma migrate deploy
  ```

## What changed and why

**Queue (R1-R7)**

- `NotificationOutbox` plus `enum NotificationChannel`:
  - `prisma/schema.prisma`, with a `Vendor.notificationOutbox` back-relation.
  - Migration `20261105120000_notification_outbox`: Prisma's own `migrate diff` output against `origin/staging`'s schema, unedited, under a `#895` header.
- `lib/repositories/notification-outbox.ts`: insert, list, delete, record failure and count. Every function takes `(prisma, vendorId)`. Only singular `create`/`update` and `deleteMany`/`count` are used.
- `lib/notifications/dispatch.ts`: `dispatchNotifications`, `notificationLogLine`, `safeReason`.
- `lib/notifications/outbox.ts`: `runNotificationOutbox`.
- `app/api/jobs/retry-notification-outbox/route.ts`: a copy of the contact outbox route's guard.
- Scheduler (`workers/scheduler/src/select-jobs.ts` and `index.ts`): the new path and KV read. The marker functions are in `lib/job-signals.ts`, the key in `lib/job-signal-keys.ts`.
- `NOTIFICATION_OUTBOX_RETENTION_HOURS = 24` in `lib/data-retention.ts`. Both the retry run and `/privacy` read it.

**Events (R8-R10)**

- **Pure modules in `lib/order-notifications/`:**
  - `next-step.ts`: the R12 copy, shared by the emails and the tracker;
  - `slot.ts`, `links.ts`;
  - `customer-email.ts`, `owner.ts`;
  - `build.ts`: message assembly and `resolveOwnerEmail`;
  - `notify.ts`: `createOrderNotifier`, injectable.
- **`lib/order-notifications-service.ts`** binds the real dependencies and exports `notifyOrderEvent`, `notifyCustomerConfirmation`, `notifyBulkStatusChange` and `getNotificationOutboxService`.
- **The seven call sites** are repointed.
- **Deleted:** `features/checkout/send-confirmation.ts`, `features/orders/send-status-email.ts` and their two test files.
  - Their surviving assertions moved to `tests/order-notification-messages.test.ts`: one email per event, the sender's name from the vendor, the `CANCELLED` copy saying no refund, and escaping.
- **`WebhookOrder`** gains `fulfilmentMethod`, `fulfilmentDate`, `fulfilmentSlot` and `confirmationToken`. It has a single construction site, `findOrderForWebhook`.

**Website (R19-R23)**

- **Repository reads:**
  - `ORDER_TRACKER_SELECT` (the slot, plus `statusEvents` without `note`) is added to `findOrderForViewer`, `findOrderForUser` and `findOrderForGuestLookup`.
  - Each now returns `timeline` and `slotLabel`.
  - The `getByOrderNumber` interface now returns `OrderDetail`.
- **New components:**
  - `components/orders/OrderProgressTracker.tsx`;
  - `components/orders/LiveRefresh.tsx`;
  - `components/staff/NewOrdersNotice.tsx`.
- **Supporting functions:**
  - `listConfirmedOrderNumbers` in the repository, plus `listConfirmedNumbersForStaff` on the order repository facade;
  - `isFinalStatus` and `FINAL_STATUSES` in `lib/order-status.ts`.
- **Page changes:**
  - account order page: the tracker and refresh;
  - checkout page: the tracker (except `CANCELLED`) and refresh;
  - lookup page: the tracker; its local `steps` and `getStepIndex` are removed; the status badge uses `orderStatusLabel`;
  - staff orders page: refresh every 30 s and `NewOrdersNotice`.
- **`components/orders/OrderTimeline.tsx` is deleted:** it had no remaining importers.

**Privacy and docs (R25, R26)**

- `/privacy`:
  - a staff-updates sentence in both branches of section 3;
  - a retention paragraph led by "Order updates waiting to be sent." in section 5.
  - `tests/privacy-retention-section.test.tsx` now also proves the hours come from the constant.
- Docs:
  - `specs/architecture.md` (in the spec commit);
  - the platform admin guide;
  - the staff playbook;
  - the shopping guide.
- `scripts/lib/neon-migration-plan.ts`: `NotificationOutbox: skip`. `tests/neon-migration-plan.test.ts` requires every model to be classified.

## Decisions taken during the build

- **Sender is not stored.** An EMAIL outbox row has no sender column (R1 fixed the columns), so the retry run re-resolves the vendor's sender with `senderFor(vendorId)`. Storing it would have meant a column the spec did not list.
- **`safeReason` masks address-shaped tokens and caps reasons at 200 characters.** Cloudflare and Resend failure reasons can echo the recipient (`lib/email/cloudflare.ts` returns `error.message`, and Resend returns its response body). R7 forbids destinations in our log lines, so reasons are sanitised before logging. The stored `lastError` keeps the raw reason, because the row already holds the destination.
- **The owner mailbox reuses `resolveContactRecipient`** with `defaultForward: { status: "unset" }`. Asked about an order, it already walks ORDERS then SUPPORT, and the unset default enforces R15's "never the platform inbox".
- **The canonical host reuses `listVendorHosts`** (`#1403`), with a pure `canonicalBaseUrl` picker.
- **Concurrency is split.** One event's messages are sent concurrently (R3). A bulk change's customer emails go **one at a time** (each through its own dispatch), as the old per-order emails did, so a batch never opens dozens of provider requests at once. Then one dispatch carries all the digests.
- **The owner email's Reply-To is the buyer.** R17 says so, and it is why the privacy sentence promises "no contact details" only about the **messaging service**, not the email.
- **`loadStore` degrades.** The vendor profile is required. Hosts, receiving addresses and Telegram recipients fall back to empty if their read fails, so a failure there costs a link or the owner messages, never the customer's email. This was added after the implementation commit, in the build-notes commit.
- **The email button colour is inline (`#111827`).** Email HTML cannot use the design tokens; existing emails were unstyled.
- **The sound preference uses `useSyncExternalStore`,** with a server snapshot of `false`. A `useEffect` + `setState` version failed `react-hooks/set-state-in-effect`, and this also avoids a hydration mismatch.
- **`LiveRefresh` starts its clock inside the effect,** because `useRef(Date.now())` fails `react-hooks/purity`.
- **Guard test (R24):** `sale` is matched as a whole word (`\bsales?\b`), so a store or product named "Salem" or "wholesale" cannot trip it. The other 11 phrases are plain substrings.

## Deviations from the spec

- **R7, a fifth status.** When a send fails **and** the queue insert then throws, the line reads `status=lost reason=…`. R7 lists only `sent|skipped|queued`, but none of those is true here, and R3 requires the failure to be logged. The line still carries no destination, subject or body.
- **R16 and R18, singular forms.** These print `(1 item)` and `1 order` for a count of one. R16 writes `(<k> items)` and R18 `<k> orders`. "1 items" reads as a defect to staff; the tests assert the plural for counts above one.
- **R18, a link in the digest email.** The digest email carries an `Open in staff panel` link to `<base>/staff/orders` when there is a canonical host. R18 does not mention a link. It matches R17's per-order owner email.
- **R12/R16, the slot day.** The slot label reads the day in **UTC**, not `Europe/London`. `Order.fulfilmentDate` is stored as the UTC midnight of the vendor-local day (`lib/local-datetime.ts`), and London is never behind UTC, so both give the same day. UTC states what the column means.
- **R9 was amended at Build.** The grep gained `--exclude=docs.ts`, because the generated runbook file quotes historical specs. This is recorded in `requirements.md` and `validation.md`.
- **Small extras outside the requirements:**
  - The lookup page's header "Delivery progress" became "Order progress", because it was wrong for collection orders.
  - The platform admin guide's chat-ID tip now says to send `/start@<bot username>`. A plain message leaves `getUpdates` empty with privacy mode on, which the owner hit while setting up `#1390` on 2026-11-05.

## Known-shaky areas

- **Nothing has run against a real database or in `npm run preview`.** The migration is unapplied, so the repository functions, the `ORDER_TRACKER_SELECT` additions and the staff page's extra query are proven only by types and fakes. The R3 integration row and R9-E2E are the first real exercise.
  - Check `create` on `NotificationOutbox` through `getPrisma()` (HTTP). It has no nested writes, so it should be fine under `#382`.
- **The checkout page with a `PENDING_PAYMENT` order** now has both `PaymentStatusCheck` (a client POST) and `LiveRefresh`. `router.refresh()` should not remount `PaymentStatusCheck`, so it should not re-POST. Watch the preview logs for repeated payment checks.
- **Cost of the staff page.** It now re-renders every 30 s while a staff tab is visible: two order queries per refresh. That keeps Neon awake while a tab is open, a deliberate trade for R23 that the owner has not been told about explicitly.
- **Webhook latency.** The Stripe webhook now does four parallel store reads and then the sends, concurrently, with a Telegram timeout of 5 s. Worst case is about 5 s plus the email send.
- **The email service's own log lines** (`lib/email.ts`) print the **subject** on a skip or failure. That is outside R7's scope, which covers lines from the dispatcher, the retry run and `notifyOrderEvent`. The subjects contain the order number and store name, not personal data, but a validator reading R7 broadly will see them.
- **Staging allowlist.** Staging's `EMAIL_RECIPIENT_MODE` allowlist means both customer and owner emails are `skipped` for addresses not on `EMAIL_ALLOWED_RECIPIENTS`. That is expected, not a defect.
- **Telegram 429 and other failures** are proven by unit tests only. The live Telegram path was last exercised by `#1390`'s test alert on 2026-11-05.
- **The KMS internal site build** (`kms:assemble:internal` plus a Next build in `kms/site-internal`, R25) was not run at Build. The worktree's `kms/site-internal` has no `node_modules`, so run `npm ci` there first (see `local-dev-playbook.md`, the worktree section).
