# Order updates: notification queue, owner email + Telegram, live order tracker (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**: isolated business logic, utilities and components.
2. **Integration Testing**: the component with its immediate dependencies (the database, the email provider, Telegram).
3. **System / End-to-End Testing**: critical user journeys in the real system (`npm run preview`, staging).
4. **Regression & Acceptance Testing**: existing flows still work.
5. **Performance & Resilience Testing**: degrades gracefully when a provider is down.
6. **Security & Accessibility Testing**: no personal data leaks, and the UI is accessible.

## Before you start

- **Work in this slice's worktree,** recorded in `build-notes.md`, never in the main checkout.
- **Before any Prisma CLI command,** check `DIRECT_URL` and `DATABASE_URL` one at a time, as described in `CLAUDE.md`. Prefix the command with `env -u DIRECT_URL -u DATABASE_URL` if either is set.
- **Dev demo accounts** are `demo-store-admin@example.com` and `demo-platform-admin@example.com`. The password is `.dev.vars` `DEMO_ACCOUNT_PASSWORD`.
- **Drive pages and actions with `curl`** as `docs/developer-portal/local-dev-playbook.md` describes, including its worktree section and its preview log query.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit / Integration | 1. Read `prisma/migrations/20261105120000_notification_outbox/migration.sql`. It has exactly the enum, the table (all 10 columns as listed in R1), the foreign key with `ON DELETE CASCADE`, and the `("vendorId","createdAt")` index. `grep -c DROP` gives 0, and the header names `#895`.<br>2. `npx prisma validate` exits 0.<br>3. On dev, after the owner has run `migrate deploy`: `npx prisma migrate status` reports up to date, and the datasource host is the dev host. |
| R2 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts tests/repository-vendor-scoping.test.ts` passes. Read `lib/repositories/notification-outbox.ts`: every export takes `(prisma, vendorId, …)`, every `where` has `vendorId`, and the insert is a `create` with no nested `create`. |
| R3 | Unit | The dispatcher's test file passes and has one case for each bullet in R3. Include a concurrency case: with two Telegram sends that each wait 100 ms on fake timers, both start before either resolves. Read `dispatch.ts`: no code path lets a rejection escape, because each send and each insert is caught. |
| R3 | Integration | On `npm run preview` with `EMAIL_PROVIDER="resend"` and an invalid `RESEND_API_KEY` in `.dev.vars`, advance a paid dev order (step R9-E2E). Then run `SELECT channel, attempts, "lastError" FROM "NotificationOutbox"` through a Node script with `getPrisma()`, the adapter the code uses. Expected: an `EMAIL` row exists with `attempts` = 1 and a non-empty `lastError`. Restore `.dev.vars` afterwards. |
| R4 | Integration | Against preview:<br>- `GET /api/jobs/retry-notification-outbox` gives **405**.<br>- `POST` with no header gives **401**.<br>- `POST` with `x-job-token: <JOB_INVOCATION_TOKEN from .dev.vars>` gives **200**, with JSON keys exactly `sent`, `failed`, `expired`, `remaining`.<br>- With the token removed from **both** `.dev.vars` and `.env`, `POST` gives **503**. Restore it afterwards. |
| R5 | Unit / Integration | The run's unit tests pass and cover: expired (more than 24h) deleted and logged with id and vendor only; sent and skipped deleted; failed increments `attempts`; marker cleared or set; budget of 50. On preview, after the R3 integration row, fix the provider (`EMAIL_PROVIDER="log"`), restart, and `POST` the job with the token. Expected: `sent` ≥ 1, `remaining` 0, and the row is gone. |
| R6 | Unit | The scheduler test covers the four `selectJobs` cases for `NOTIFICATION_OUTBOX_PATH`. `grep -n NOTIFICATION_OUTBOX workers/scheduler/src/index.ts workers/scheduler/src/select-jobs.ts lib/job-signal-keys.ts lib/job-signals.ts` shows the path, the key, the read and the two signal functions. |
| R7 | Unit / Security | The log test passes: it plants a destination, subject, body, product name and customer name, and asserts that none appears in any captured log line, and that the line matches the R7 format. Also, in the preview log query output from the R9-E2E run, no `notification …` line contains `@` or the product name. |
| R8 | Unit | The builder's tests show that each of the six events produces a customer message and owner messages, and that `PENDING_PAYMENT` produces none. `notifyOrderEvent` resolves even when every dependency rejects. |
| R9 | Unit | `grep -rn "sendOrderConfirmationEmail\|sendOrderStatusEmail" app lib features` gives no output. `grep -rn "notifyOrderEvent" app lib features` lists the seven call sites in R9's table. |
| R9 | E2E | **R9-E2E.** On `npm run preview` with `EMAIL_PROVIDER="log"`, sign in as the demo store admin. Advance a `CONFIRMED` dev delivery order to `OUT_FOR_DELIVERY` from `/staff/orders`, by `curl` or a browser. In the preview log query, expect `notification vendorId=<Aheed id> channel=EMAIL audience=CUSTOMER event=OUT_FOR_DELIVERY status=sent`, and one `audience=OWNER channel=EMAIL` line, if Aheed has an ORDERS or SUPPORT receiving address on dev. With no `TELEGRAM_BOT_TOKEN`, expect `channel=TELEGRAM … status=skipped reason=TELEGRAM_BOT_TOKEN unset`, for each Telegram recipient. |
| R10 | Unit | The tests show three things: the customer cancel action and the sweep's expiry produce no `notifyOrderEvent` call; `resendConfirmation` dispatches exactly one message, `audience=CUSTOMER`; and it dispatches no owner messages. |
| R11 | Unit | The template tests assert each of the six subjects exactly, for example `Order AHD-20261105-ABC123 is on its way — Corner Shop`. No buyer email means no customer message plus the skipped log line. |
| R12 | Unit | Assert each row of R12's table, for both methods, with and without a slot label. Show that the tracker and the email import `lib/order-notifications/next-step.ts` (`grep -rn "order-notifications/next-step"` lists both). The `CANCELLED` text contains no `refund`. `tests/order-status-email.test.ts`, or its successor, still asserts this. |
| R13 | Unit | Assert the savings line appears only when `discountPence` > 0, and the points line only when `pointsEarned` > 0. Assert exactly one `<a>` with text `View your order` and the right `href`, for each of: member, guest with token, guest without token. With no canonical host, assert no `<a>`. |
| R14 | Unit / Security | The escaping test passes for every event's customer and owner email. |
| R15 | Unit | The recipient tests cover: ORDERS chosen over SUPPORT; SUPPORT as fallback; neither gives no owner email (and never the platform default); every TELEGRAM recipient is used; no recipients gives no owner messages and no error. |
| R16 | Unit / Security | The Telegram text tests assert all five lines for one delivery order and one collection order, ` · Express`, `no slot`, the staging tag, and the link only with a host. Plant a buyer email, name and address, and a product name: none appears. |
| R16 | E2E (staging, after Ship) | With the #1390 staging group set up, advance a staging order. The group receives `[STAGING] Out for delivery: Aheed Food Centre` with the order, total, slot and link lines, and no customer name or product names. Record the result under `env-setup.md`'s sanity-check guide. |
| R17 | Unit | Assert the owner email's subject, its single `Open in staff panel` link, `replyTo` = buyer email, and the vendor sender. |
| R18 | Unit / E2E | The bulk test with 25 orders asserts: 25 customer messages; one owner digest per recipient per channel; 20 order numbers; `+5 more`. On preview, bulk-advance two dev orders and expect one `audience=OWNER channel=EMAIL` line, not two. |
| R19 | Unit | Read `findOrderForGuestLookup` and `findOrderForWebhook`: their selects include the new fields, and the status-event select has `status` and `createdAt` only (`grep -n "note" ` around those selects finds nothing new). |
| R20 | Unit / Accessibility | The tracker tests pass for every status and both methods. Assert `data-state`, `aria-current="step"`, the `aria-live="polite"` wrapper, and no `<a>`. `grep -n "transition\|animate" components/orders/OrderProgressTracker.tsx` shows only `motion-safe:`-prefixed classes. |
| R21 | E2E | On preview:<br>1. `curl` the account order page as a member who owns a dev order. The HTML contains `aria-current="step"` and the next-step text.<br>2. `curl` `/checkout/<n>?t=<token>` for a guest order: the same.<br>3. Run a guest lookup for a **collection** order. It shows `Ready for collection` and `Collected` steps, not `Out for delivery`.<br>4. Check `grep -c "PENDING_PAYMENT\|OUT_FOR_DELIVERY\|READY_FOR_COLLECTION"` on each page's HTML, after stripping `<script>` tags, gives 0.<br>5. `grep -n "getStepIndex" app/(storefront)/orders/lookup/page.tsx` gives no output. |
| R22 | Unit / E2E | The `LiveRefresh` fake-timer tests pass. On preview, open a `CONFIRMED` order's account page in a browser and advance it from the staff panel in another tab. Within about 45 s, without a reload, the tracker's current step changes to `Out for delivery`. The lookup page's source contains no `LiveRefresh`. |
| R23 | Unit / E2E | The `NewOrdersNotice` tests pass. In a browser on preview, open `/staff/orders` as the demo store admin, then place and pay a dev order in another session (or use the test card on preview). Within about 30 s, `1 new order since you opened this page` appears. `Dismiss` clears it. The sound box is unchecked on first visit. |
| R24 | Unit | The guard test passes, and it iterates every template variant listed in R24. Check its list of forbidden phrases matches R24's 12. |
| R25 | Unit | Read the four docs for the named sections. `npm run kms:validate` and `npm run kms:check-generated` exit 0. Run `npm run kms:assemble:internal`, then a Next build in `kms/site-internal`; it succeeds. |
| R26 | Unit / E2E | `grep -n NOTIFICATION_OUTBOX_RETENTION_HOURS lib/data-retention.ts app/(storefront)/privacy/page.tsx lib/notifications/*.ts` shows the one export and both readers. `grep -rn "24 \* 60 \* 60\|86400000" lib/notifications` gives no output. On preview, `curl` `/privacy`: the HTML contains the staff-updates sentence and `24 hours`.
| R27 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an `[Unreleased]` entry naming `#1435`. |
| R28 | Unit | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` exit 0. `npx vitest run --maxWorkers=4`, run alone, reports 0 failed. |
