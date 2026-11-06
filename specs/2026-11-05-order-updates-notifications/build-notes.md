# Order updates: notification queue, owner email + Telegram, live order tracker (build notes)

## Context for the validator

- **Issue:** `#1435`. Built 2026-11-05 on Opus, in the same session that proposed and specified it.
- **Worktree:** `E:\GitRepositories\aheed-online-store-orders`, branch `feature/order-updates-notifications`. Another session uses the main checkout, so validate in this worktree.
  - Its `.env` and `.dev.vars` are copies of the main checkout's. Both name the **dev** database (`ep-dry-morning`), checked by host against `secrets/staging.vars` and `secrets/production.vars`.
- **Commits:** spec `fcca5578`, implementation `0354f7c0`, build notes and CHANGELOG in the commit that adds this file.
- **Carried-forward docs.** The branch also carries the unpushed `#1390` post-ship docs branch (`docs/1390-post-ship`, merged at `40efa98c`), per the carry-forward rule. Those files (`docs/model-handoff.md`, `specs/roadmap.md`, `local-dev-playbook.md`, `env-setup.md`) are `#1390`'s, not this slice's.
- **The migration is applied to dev.** The owner ran `env -u DIRECT_URL -u DATABASE_URL npx prisma migrate deploy` from the worktree on 2026-11-05, after the build. Prisma reported the datasource as `ep-dry-morning-zab7dx08` (dev) and applied only `20261105120000_notification_outbox`. Preview checks can run.

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

- **Nothing has run against a real database or in `npm run preview`.** The migration is now on dev, but nothing has run against it: the repository functions, the `ORDER_TRACKER_SELECT` additions and the staff page's extra query are proven only by types and fakes. The R3 integration row and R9-E2E are the first real exercise.
  - Check `create` on `NotificationOutbox` through `getPrisma()` (HTTP). It has no nested writes, so it should be fine under `#382`.
- **The checkout page with a `PENDING_PAYMENT` order** now has both `PaymentStatusCheck` (a client POST) and `LiveRefresh`. `router.refresh()` should not remount `PaymentStatusCheck`, so it should not re-POST. Watch the preview logs for repeated payment checks.
- **Cost of the staff page.** It now re-renders every 30 s while a staff tab is visible: two order queries per refresh. That keeps Neon awake while a tab is open, a deliberate trade for R23 that the owner has not been told about explicitly.
- **Webhook latency.** The Stripe webhook now does four parallel store reads and then the sends, concurrently, with a Telegram timeout of 5 s. Worst case is about 5 s plus the email send.
- **The email service's own log lines** (`lib/email.ts`) print the **subject** on a skip or failure. That is outside R7's scope, which covers lines from the dispatcher, the retry run and `notifyOrderEvent`. The subjects contain the order number and store name, not personal data, but a validator reading R7 broadly will see them.
- **Staging allowlist.** Staging's `EMAIL_RECIPIENT_MODE` allowlist means both customer and owner emails are `skipped` for addresses not on `EMAIL_ALLOWED_RECIPIENTS`. That is expected, not a defect.
- **Telegram 429 and other failures** are proven by unit tests only. The live Telegram path was last exercised by `#1390`'s test alert on 2026-11-05.
- **The KMS internal site build** (`kms:assemble:internal` plus a Next build in `kms/site-internal`, R25) was not run at Build. The worktree's `kms/site-internal` has no `node_modules`, so run `npm ci` there first (see `local-dev-playbook.md`, the worktree section).

## Validation pass 1 (2026-11-05)

**This pass was NOT independent.** It ran in the context that built the slice, on Opus, without the `/clear` and model switch: the owner chose to validate in place. Every row was run as written, including preview and browser checks against the dev database.

**Pre-flight passed:** lint, typecheck, format, `npx vitest run --maxWorkers=4` (397 files, 5934 tests), the production build, `kms:assemble:internal` and the `kms/site-internal` Next build.

**Preview checks, against the dev database with the HTTP adapter:**

- **R3.** With email forced to fail, advancing `AHE-20260915-TCUKGL` queued two EMAIL rows (customer and owner), each with `attempts = 1` and a reason.
- **R5, both branches on real rows:**
  - with email still failing, the job returned `failed: 2` and `attempts` became 2;
  - with `EMAIL_PROVIDER="log"` and a placeholder `EMAIL_FROM`, it returned `sent: 2, remaining: 0`, and the rows were gone.
- **R4:** 405, 401, 401 and 200 with the four keys. With the token removed from both env files, the route gave 503.
- **R9-E2E and R18-E2E:**
  - one customer line, one owner EMAIL line, and TELEGRAM `skipped reason=TELEGRAM_BOT_TOKEN unset`;
  - a two-order bulk advance gave two customer lines and one owner EMAIL digest.
  - The real subjects matched R11 and R17.
- **R21:**
  - the account page (member, collection with slot) and `/checkout/<n>?t=` (guest, collection, no slot) rendered the tracker with the right states and copy;
  - the guest lookup showed the collection path and "Order progress";
  - no raw status codes appeared.
- **R22 (browser):** the account page moved to "Out for delivery" 28 s after a staff advance, in the same document.
- **R23 (browser):**
  - "1 new order since you opened this page" appeared 15 s after a dev order became `CONFIRMED`, and Dismiss cleared it;
  - the sound box was unchecked;
  - a ticked bulk checkbox and text in the search box survived the refresh.
- **R26:** `/privacy` showed both sentences and "24 hours".

**Dev fixtures, all removed afterwards:**

- one ORDERS receiving address and one Telegram recipient for Aheed;
- temporary `.dev.vars` keys (restored byte for byte from a backup).

Four orders advanced during the checks were set back to `CONFIRMED`. Their extra `OrderStatusEvent` rows remain in the dev database: `TCUKGL`, `EMBFFH`, `MTYDX2` and `GH8WS2`.

**Findings:**

- **F1 (R7, a code defect).** A multi-line provider reason (the email config's pretty-printed zod error) put newlines into the per-message log line.
- **F2 (R9, a spec defect).** R9 said all seven call sites call `notifyOrderEvent`, contradicting R18's bulk digest.
- **F3 (R12, a check defect).** The check's grep missed the email's sibling `./next-step` import.
- **F4 (R22, a check defect).** "Source contains no `LiveRefresh`" matched the lookup page's explanatory comment.

**Noted, not a slice defect:** under `npm run preview`, every email fails with "EMAIL_FROM is required in production" unless `.dev.vars` sets `EMAIL_FROM`, even with `EMAIL_PROVIDER="log"`.

## Fix after validation pass 1

- **F1:** `safeReason` collapses whitespace runs to one space and trims. A new test asserts the line has no newline, using the zod-shaped reason that preview produced.
- **F2:** R9's wording is amended in `requirements.md`, and its row in `validation.md`. The code was right.
- **F3 and F4:** the two `validation.md` commands are amended. The code was right.

No `CHANGELOG.md` change: F1 alters a log line only, nothing a customer or staff member sees.

## Validation pass 2 (2026-11-05, after commit `9253e8df`)

**Also NOT independent:** the same context, on Opus.

**Re-run from the top:**

- **Pre-flight:** lint, typecheck, format, `npx vitest run --maxWorkers=4` (397 files, 5935 tests, including the new F1 test) and the production build.
- **Every static row:**
  - R1: no `DROP`, `#895` in the header, 10 columns, `prisma validate`;
  - R2: the three repository tests pass;
  - R6: the scheduler wiring;
  - R9, amended: no old sender remains; six call `notifyOrderEvent`; the bulk action calls `notifyBulkStatusChange`;
  - R12, amended: both files import `next-step`;
  - R20: `motion-safe:` only;
  - R21.5: no `getStepIndex`;
  - R22, amended: no `<LiveRefresh` on the lookup page;
  - R24: 12 phrases;
  - R26: one constant, no second literal;
  - R27: a CHANGELOG entry naming `#1435`;
  - `kms:validate` and `kms:check-generated` pass.

**Dynamic rows:**

- **Re-run on a fresh preview build** (the fix changed only `safeReason`, plus the `loadStore` fallbacks committed with the build notes):
  - **R7 / R9-E2E:** advancing `AHE-20260811-N8UZ52` logged the queued customer line with the zod reason on **one line**, with no `@`. With the pass-1 fixtures removed, no owner messages were produced, which matches R15's no-recipients case.
  - **R4:** 405, 401 and 200.
- **Not repeated, pass-1 results stand:** R5, R18-E2E, R21, R22, R23 and R26 exercise code the fix did not touch.

**Cleanup:** the one row this run queued was deleted, `N8UZ52` was set back to `CONFIRMED`, and the probe scripts were removed.

**Unverified until after Ship:** R16 staging E2E (a real Telegram owner message on staging). That row is defined as post-ship.

**Result:** all rows pass, apart from that post-ship staging row.

## Ship (2026-11-05)

- **Merge:** PR #1440, squash `373f83f`, into `staging`. Before pushing, the branch merged the latest `staging` (`8bf4059`, #1437); the only conflict was `CHANGELOG.md`, where both entries were kept. On the merged tree typecheck passed, all 5936 tests passed, and CI passed (`quality`, `kms`, `docs-gates`).
- **Deploy:** `deploy-staging` run `42106863189` applied `20261105120000_notification_outbox` and redeployed the store, scheduler and inbound-email Workers. `/api/health` reported `373f83f`, `db.ok` true, and the reference data reachable with two sources.
- **Quick checks:** sanity-check steps 1-4 passed. The guide is in `docs/developer-portal/env-setup.md`, "Sanity check: order updates and notification queue". The retry route answered 405 and 401, and `/privacy` showed the new paragraph.
- **R16 staging E2E passed (2026-11-06, owner):** a paid collection order produced `[STAGING] New order: Aheed Food Centre` in the staff group, with the order, total, slot and link lines and no customer or product details. The slot it showed led to a separate checkout bug (past slots offered), tracked in its own issue.
