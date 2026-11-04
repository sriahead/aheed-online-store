# Telegram alerts for order-related inquiries (requirements / acceptance criteria)

Closes `#1390`. Builds on `#1217` (`workers/inbound-email`, `/api/inbound-email/resolve`, Client
Setup) and `#1409` (the storefront contact form). When an order-related email reaches a store
address, or a shopper sends an order-related contact-form message, the store's alert recipients get
a short plain-text Telegram message. It carries the store name, the order number, the sender's name,
the subject and which route it came by, and nothing else. A failed alert never affects forwarding or
the form. The recipient model and the sender are channel-neutral so that WhatsApp (`#1424`) is an
added adapter. `plan.md` holds the reasoning.

**Terms used below.**
- **Order-related email:** what `resolveInboundEmailWith` (`lib/inbound-email-service.ts`) already
  returns as `orderRelated: true`, unchanged.
- **Order-related contact message:** a valid, non-honeypot contact-form submission that passed the
  rate limit, whose `type` is `COMPLAINT` or which carries an order number that `findOwnOrder`
  verified.
- **Alert text:** the output of `formatOrderAlert` (R5).

## Data

R1. `prisma/schema.prisma` declares `enum OrderAlertChannel { TELEGRAM }` and
    `model VendorOrderAlertRecipient` with exactly these fields:
    - `id String @id @default(uuid())`
    - `vendorId String` with a relation to `Vendor` declaring `onDelete: Cascade`
    - `channel OrderAlertChannel`
    - `destination String`
    - `createdAt DateTime @default(now())`

    It also declares `@@unique([vendorId, channel, destination])` and `@@index([vendorId])`. `Vendor`
    gains only the back-relation field. No scalar column is added to `Vendor`. `npx prisma validate`
    exits 0.

R2. `prisma/migrations/20261104160000_order_alert_recipient/migration.sql` exists.
    - Its header comment says it is hand-authored, and why: `#895`.
    - Every SQL statement in it starts with `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`,
      `CREATE UNIQUE INDEX` or `ALTER TABLE ... ADD CONSTRAINT`.
    - Its SQL, ignoring comment lines and blank lines, is identical to the output of
      `prisma migrate diff --from-schema-datamodel <origin/staging's prisma/schema.prisma>
      --to-schema-datamodel prisma/schema.prisma --script`, ignoring comment lines and blank lines.

## Configuration

R3. `lib/config.ts` exports `getTelegramBotToken()`.
    - It reads `TELEGRAM_BOT_TOKEN` through `readEnv` and trims it.
    - It returns `{ status: "set"; token: string }` for a non-empty value and `{ status: "unset" }`
      for an empty or missing one.
    - It contains no `throw` and no zod `.parse` call.

R4. `TELEGRAM_BOT_TOKEN` is handled in three places:
    - It is an element of `OPTIONAL_WORKER_SECRETS` in `scripts/configure-env.mjs`, and it is not
      an element of `INBOUND_WORKER_ALSO`.
    - `docs/developer-portal/env-setup.md` lists it in the "Cloudflare Worker secrets" row of the
      secret-stores table, marked optional with `#1390`.
    - `env-setup.md` also lists it in the same table as `INBOUND_EMAIL_TOKEN` (the email
      variables), with a one-line purpose saying it is the platform bot's token for order alerts and
      that a missing token makes alerts skip.

## Alert core (`lib/order-alert/`)

R5. `lib/order-alert/brief.ts` is pure (it imports nothing that touches the network, a database or
    `process.env`) and exports two things:
    - `OrderAlertBrief`, whose keys are exactly `source` (`"email" | "contact-form"`), `storeName`
      (`string`), `orderNumber` (`string | null`), `senderName` (`string | null`) and `subject`
      (`string`).
    - `formatOrderAlert(brief, environment: AppEnvironment): string`.

    `formatOrderAlert` returns exactly five lines joined by `"\n"`:
    1. `withEnvironmentTag("Order inquiry: " + storeName, environment)`
    2. `"Order: "` + the order number, or `not given` when it is null
    3. `"From: "` + the sender name trimmed and cut to 100 characters, or `unknown` when it is null
       or blank
    4. `"Subject: "` + the subject trimmed, or `(no subject)` when it is blank; a subject over 200
       characters is cut to its first 200 characters followed by `…`
    5. `"Via: email"` or `"Via: contact form"`

    No other text appears in the output.

R6. `lib/order-alert/channels.ts` exports two things:
    - The interface `OrderAlertChannelAdapter`, with
      `send(destination: string, text: string): Promise<AlertSendResult>`. `AlertSendResult` is
      `{ status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string }`.
    - A function that builds the registry as a `Record<OrderAlertChannel, OrderAlertChannelAdapter>`.
      The key type is the Prisma enum, so a new enum value without an adapter fails `typecheck`.

    The Telegram adapter:
    - (a) Returns `skipped` with reason `TELEGRAM_BOT_TOKEN unset` and makes no `fetch` call when the
      token is unset.
    - (b) Otherwise makes one `POST` to `https://api.telegram.org/bot<token>/sendMessage`. The body
      is JSON with exactly the keys `chat_id` (the destination) and `text`, and no `parse_mode`. The
      request carries `AbortSignal.timeout(5000)`.
    - (c) Returns `sent` only when the HTTP status is 200 and the JSON body has `ok: true`.
    - (d) Otherwise returns `failed` with reason `telegram <status>: <description>`, using Telegram's
      `description` when present.
    - (e) When `fetch` throws or times out, returns `failed` with reason `telegram request error:
      <error.name>`. The error's `message` is never included, because the URL holds the token.
    - (f) Never throws.

R7. `lib/order-alert/send.ts` exports
    `sendOrderAlert(deps, vendorId, brief): Promise<{ sent: number; skipped: number; failed: number }>`.
    Its `deps` are injected: a recipient lister, the registry, the environment and a logger. It:
    - (a) Sends the alert text once to each of the vendor's recipients, through the adapter for that
      recipient's channel.
    - (b) Makes no adapter call and returns all zeros when there are no recipients.
    - (c) Never throws. A rejecting recipient lister or a rejecting adapter is caught and counted or
      logged as a failure.
    - (d) Logs one line per send attempt, in the form
      `order alert vendorId=<id> channel=<channel> status=<status>` plus ` reason=<reason>` when the
      status is not `sent`.
    - (e) Never logs the subject, the sender name or the destination: no log call receives them.

    A request-scoped facade `lib/order-alert-service.ts` wires the live Prisma client, the R8
    repository, `getTelegramBotToken` and `getAppEnvironment`.

## Repository

R8. `lib/repositories/order-alert.ts` exports three functions. Each takes the Prisma client and
    `vendorId` as explicit parameters:
    - `listOrderAlertRecipients`.
    - `createOrderAlertRecipient`, which is a singular `create` with no nested writes. It returns
      `{ ok: true }`, or `{ ok: false; reason: "duplicate" }` when `isUniqueViolation` (from
      `lib/repositories/prisma-errors.ts`) matches.
    - `deleteOrderAlertRecipient`, which is a `deleteMany` filtered by both `id` and `vendorId` and
      returns the deleted count.

    `tests/repository-purity.test.ts`, `tests/repository-client-injection.test.ts` and
    `tests/repository-vendor-scoping.test.ts` pass with no allowlist entry added.

## Incoming email trigger

R9. `workers/inbound-email/src/index.ts` changes as follows:
    - After `message.forward(resolution.forwardTo)` resolves and the existing log line is written,
      and **only when `resolution.orderRelated` is true**, the Worker makes one `POST` to
      `/api/inbound-email/alert` on `APP_BASE_URL`.
    - That request carries the `x-inbound-token` header and the JSON body
      `{ to, subject, fromName }`. `fromName` is `parseFromDisplayName(message.headers.get("from"))`.
      No sender address is in the body.
    - A network error or non-2xx response is caught and logged as `inbound-email alert call failed
      (<status | network error>)`. The handler never throws because of it.
    - No alert call is made on the 404 reject path, on any fallback-forward path, or when
      `orderRelated` is false.
    - The existing log line is unchanged.

R10. `parseFromDisplayName(header: string | null): string | null` is exported from the Worker
     module and:
     - returns the display name, with surrounding quotes removed, for `"Jane Doe" <j@x.com>` and
       for `Jane Doe <j@x.com>`;
     - returns `null` for `j@x.com`, `<j@x.com>`, an empty string and `null`;
     - decodes an RFC 2047 encoded word in UTF-8 with `B` or `Q` encoding, for example
       `=?UTF-8?B?Sm9zw6k=?= <j@x.com>` gives `José`;
     - returns any other charset's encoded word unchanged.

R11. `app/api/inbound-email/alert/route.ts` exports `POST` and `GET`.
     - `GET` returns 405.
     - `POST` returns:
       - 503 when `INBOUND_EMAIL_TOKEN` is unset;
       - 401 for a missing or wrong `x-inbound-token`, using a constant-time comparison (the
         resolve route's guard);
       - 400 unless the body has a non-empty string `to`, a string `subject`, and a `fromName` that
         is a string, `null` or absent;
       - 404 when `resolveInboundEmailWith` finds no owning address;
       - 200 `{ "alerted": false }` with no `sendOrderAlert` call when the resolution is not
         order-related;
       - otherwise 200 `{ "alerted": true, "sent": n, "skipped": n, "failed": n }`, after calling
         `sendOrderAlert` with `source: "email"`, the vendor's store name, the resolved
         `orderNumber`, `senderName: fromName` and the subject.
     - Nothing from the body is written to the database or to a log line.
     - `app/api/inbound-email/resolve/route.ts` has no diff.

## Contact form trigger

R12. `ContactDeps` (`lib/contact/submit.ts`) gains `alert(brief: OrderAlertBrief): Promise<void>`,
     and `processContactSubmission` changes as follows:
     - For an order-related contact message, after `deps.send` returns (and after the outbox
       enqueue when the send failed), it calls `deps.alert` exactly once with `source:
       "contact-form"`, `storeName`, the verified `orderNumber` (or `null`), `senderName` = the
       submitted name and `subject` = the submitted subject.
     - It does not call `deps.alert` for a honeypot submission, a validation failure, a rate-limited
       submission, an order-not-found refusal, a no-recipient refusal, or an `ENQUIRY` with no order.
     - When `deps.alert` rejects, the returned state is still the success state and `deps.logError`
       receives a message that contains neither the subject nor the name.
     - `lib/contact-service.ts` wires `alert` to `sendOrderAlert` through the R7 facade.

## Client Setup

R13. On `/staff/platform/client-setup`, for the selected store, the Email section renders a card
     titled `Order alerts`. It shows:
     - (a) each recipient as `Telegram` plus its chat ID, with a `Remove` button and a
       `Send test alert` button;
     - (b) `No alert recipients yet.` when there are none;
     - (c) an add form with a `Channel` select whose only option is `Telegram`, a `Chat ID` text
       input and an `Add recipient` button;
     - (d) a line reading `Telegram bot token: Set` or `Telegram bot token: Not set`, the latter
       with `role="alert"`.

R14. `app/(admin)/staff/platform/client-setup/actions.ts` gains
     `addOrderAlertRecipientAction`, `removeOrderAlertRecipientAction` and
     `sendTestOrderAlertAction`. The file still exports only `async function`s. Each action:
     - (a) returns `Platform admin only.` unless the caller is a platform admin;
     - (b) refuses an unknown vendor with `That store no longer exists.`;
     - (c) validates through zod schemas in `lib/client-setup/form-state.ts`.

     The chat ID is trimmed and must match `^-?\d{1,20}$`. Otherwise the action refuses with
     `Enter the numeric Telegram chat ID (group IDs start with -).` A duplicate refuses with
     `That chat is already an alert recipient for this store.`

     The test alert sends `withEnvironmentTag("Test alert from Client Setup: " + storeName,
     environment)` to that one recipient through its channel adapter, and reports:
     - `Test alert sent. Check the Telegram chat.` for `sent`;
     - `Skipped: <reason>.` for `skipped`;
     - `Failed: <reason>.` for `failed`.

R15. Removing or test-alerting a recipient with a `vendorId` that does not own it changes nothing.
     Remove refuses with `That recipient was already removed.` and the test alert refuses with
     `That recipient no longer exists.`

## Documentation and copy

R16. `docs/platform-admin-guide/platform-admin-guide.md`'s Client Setup section documents the Order
     alerts card. It covers:
     - adding, removing and test-alerting a recipient;
     - what triggers an alert (an order-related email; a contact-form complaint or message about an
       order);
     - exactly what an alert contains, and that the message body, the customer's email address and
       phone number are never sent;
     - how to find a group's chat ID (add the bot to the group, send a message, read the chat id);
     - two common mistakes: the bot not being a member of the group, and an unset token making every
       alert skip.

     Every capability sentence corresponds to a control on the page.

R17. `specs/tech-stack.md` has a `## Staff alerts` section. It names the Telegram Bot API behind
     `OrderAlertChannelAdapter` (`lib/order-alert/`), the `TELEGRAM_BOT_TOKEN` secret and WhatsApp
     as follow-up `#1424`.

R18. `app/(storefront)/privacy/page.tsx` section 3 contains, in **both** the `marketingEnabled`
     branch and the other branch, this sentence: "If you contact a store about an order, your name
     and the subject of your message may be passed to the store's staff through a messaging service
     so they can respond quickly; the message itself is not." The sentence names no store and no
     product type.

## Live behaviour

R19. Under `npm run preview`, with a real `TELEGRAM_BOT_TOKEN` in `.dev.vars` and a recipient added
     for a store through Client Setup:
     - (a) `Send test alert` delivers a Telegram message starting `[DEV] Test alert from Client
       Setup:`;
     - (b) a contact-form `COMPLAINT` submission delivers an alert whose five lines match R5 with
       `Via: contact form`;
     - (c) a `curl` `POST` to `/api/inbound-email/alert` with the dev token and that store's ORDERS
       address returns `alerted: true, sent: 1` and delivers an alert with `Via: email`;
     - (d) each delivery lands within 60 seconds.

## Gates

R20. `CHANGELOG.md` has an entry for `#1390` under the unreleased section (Gate 4).

R21. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run --maxWorkers=4`,
     `npm run kms:validate` and `npm run kms:check-generated` all exit 0. `npm run
     kms:assemble:internal` followed by `npx next build --webpack` in `kms/site-internal` exits 0.
