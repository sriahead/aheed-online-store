# Cloudflare Email Service: per-vendor outgoing and incoming email (requirements / acceptance criteria)

Closes `#1217` (provider-agnostic outgoing email, re-scoped 2026-11-01 to cover incoming email too).
It builds on the existing `EmailService` port (`lib/email.ts`) and the second-Worker precedent in
`workers/scheduler`.

In one line: stores send through Cloudflare's `send_email` binding from their own address, with
Resend kept as a selectable fallback. Mail to a store address goes through a new inbound Worker,
which forwards it to the store's mailbox and classifies order mail. Read `plan.md` for the
decisions and exclusions.

"Skipped and logged" below means: `send()` resolves without throwing, makes no network or binding
call, and writes one `console.warn` or `console.error` line.

## Outgoing: provider-agnostic port

R1. `lib/email.ts` still exports `EmailService` and `getEmailService()`. `EmailService.send` accepts
    `{ to: string; subject: string; html: string; sender?: { name: string; email: string } }`, and
    each adapter lives in its own file under `lib/email/`: `cloudflare.ts`, `resend.ts`, `log.ts`.

R2. `getEmailService()` picks the adapter from `EMAIL_PROVIDER`: `cloudflare`, `resend` or `log`.
    When `EMAIL_PROVIDER` is unset, it picks `cloudflare` if the `EMAIL` binding is present in the
    Cloudflare context, and `log` otherwise. A unit test covers each of the five cases: three
    explicit values, and unset with and without the binding.

R3. The `cloudflare` adapter calls `env.EMAIL.send()` once per message with `from` as
    `{ name, email }`, a single `to`, `subject` and `html`, plus `replyTo` when the From resolution
    (R5) sets one. A unit test with a fake binding asserts the exact object passed.

R4. The `resend` adapter sends the same request today's code sends (`POST
    https://api.resend.com/emails`, bearer `RESEND_API_KEY`), using the R5-resolved `from`
    (formatted `Name <email>`) and `reply_to` when set. A unit test with a stubbed `fetch` asserts
    the URL, auth header and body.

R5. A pure exported function resolves the sender from the vendor's `{ name, email }`,
    `EMAIL_VERIFIED_DOMAINS` (a comma list, case-insensitive) and `EMAIL_FROM`:
    - if the vendor email's domain is listed, it returns `from = { name, email: vendorEmail }` with
      no `replyTo`;
    - otherwise it returns `from = { name, email: EMAIL_FROM }` and `replyTo = vendorEmail`;
    - when no `sender` is passed, it returns `from = { name: <platform name>, email: EMAIL_FROM }`.
    Unit tests cover all three branches and a mixed-case domain.

R6. A pure exported function decides recipients from `EMAIL_RECIPIENT_MODE` and
    `EMAIL_ALLOWED_RECIPIENTS` (a comma list, case-insensitive):
    - `open` allows every address;
    - any other value, or unset, means allowlist mode, which allows only listed addresses.
    A disallowed recipient is **skipped and logged** by `getEmailService().send()`. Unit tests
    cover open, allowlist-hit, allowlist-miss, unset mode, and an empty allowlist.

R7. Every adapter failure (binding throws, non-2xx from Resend, missing binding or key) is caught
    inside `send()`, logged once, and never rethrown. A unit test per adapter forces the failure
    and asserts that `send()` resolves.

## Outgoing: config and callers

R8. `lib/config.ts`'s email schema reads `EMAIL_PROVIDER`, `EMAIL_FROM`,
    `EMAIL_VERIFIED_DOMAINS`, `EMAIL_RECIPIENT_MODE`, `EMAIL_ALLOWED_RECIPIENTS` and
    `RESEND_API_KEY`, and no longer reads `RESEND_FROM_EMAIL`. Under `NODE_ENV=production`:
    - parsing fails when `EMAIL_FROM` is unset;
    - parsing fails when `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` is unset;
    - parsing succeeds with `EMAIL_PROVIDER` unset or `cloudflare` and no `RESEND_API_KEY`.
    A unit test covers these three cases.

R9. `grep -rn "RESEND_FROM_EMAIL" lib app features scripts workers wrangler.toml .github` prints
    nothing.

R10. `lib/auth.ts`'s reset-password and verification sends, and
    `features/checkout/send-confirmation.ts`, each pass `sender: { name, email }` from the
    resolved vendor's `senderName` and `senderEmail`. `lib/vendor-service.ts` exports
    `getCurrentVendorSender()` returning `{ name, email }`. Subjects and HTML bodies are unchanged:
    their existing tests still pass unmodified, or are changed only to add the `sender` argument.

R11. `wrangler.toml` declares a `send_email` binding named `EMAIL` under both `env.staging` and
    `env.production`. `[env.production.vars]` sets `EMAIL_RECIPIENT_MODE = "open"`, and
    `[env.staging.vars]` does not set it to `open`. `npx wrangler deploy --dry-run --env staging`
    and `--env production` both exit 0 after `npm run build`, or Validate records why they could not
    run.

R12. `scripts/configure-env.mjs` no longer requires `RESEND_API_KEY` or `RESEND_FROM_EMAIL`, and
    does require `EMAIL_FROM` and `INBOUND_EMAIL_TOKEN`. Its existing tests, if any, are updated and
    pass.

R13. `lib/running-costs.ts`'s `cloudflare-email` entry no longer carries the "price is not
    confirmed" note, and states 3,000 included emails per month then $0.35 per 1,000.
    `lib/pricing/cost-drivers.ts`'s `email-transactional` entry names Cloudflare Email Service as
    provider, with a `developers.cloudflare.com` `sourceUrl`.

## Incoming

R14. `prisma/schema.prisma` adds `enum InboundAddressPurpose { ORDERS SUPPORT }` and
    `model VendorInboundAddress`:
    - `id String @id @default(uuid())`;
    - `vendorId` with a cascade relation to `Vendor`;
    - `address String @unique`;
    - `purpose InboundAddressPurpose`;
    - `forwardTo String`;
    - `createdAt DateTime @default(now())`;
    - `@@index([vendorId])`.
    No `Json` column is added.

R15. Exactly one new directory under `prisma/migrations/` holds this change, and its `migration.sql`
    contains only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `CREATE UNIQUE INDEX` and
    `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` statements. Checked by
    `grep -inE '^\s*(DROP|UPDATE|INSERT|DELETE)\b'` printing nothing. Its header says why it was
    hand-authored (`#895`). It contains no `pg_trgm` index drop.

R16. `lib/repositories/inbound-address.ts` exports a lookup taking a Prisma client and an address,
    matching case-insensitively by lower-casing the input. `tests/repository-purity.test.ts` and
    `tests/repository-client-injection.test.ts` pass with no allowlist entry added.

R17. `POST /api/inbound-email/resolve`:
    - returns **503** when `INBOUND_EMAIL_TOKEN` is unset;
    - returns **401** when the `x-inbound-token` header is missing or wrong (compared with the
      existing `timingSafeEqual`);
    - returns **400** for a body without string `to` and `subject`;
    - returns **404** for an address with no `VendorInboundAddress` row;
    - otherwise returns **200** with `{ forwardTo, vendorId, purpose, orderRelated, orderNumber }`.
    A route test covers each status.

R18. On a 200 response, `orderRelated` is `true` when `purpose` is `ORDERS`. It is also `true`
    when the subject contains a string matching the order-number shape (`buildOrderNumber`'s
    `<PREFIX>-<YYYYMMDD>-<6>`, case-insensitive) **and** an order with that number exists **for the
    same `vendorId`**. In that case `orderNumber` is the matched number; otherwise `orderNumber` is
    `null`. Tests cover:
    - an ORDERS address with no number;
    - a SUPPORT address with the vendor's own order number (`true`);
    - a SUPPORT address with **another vendor's** order number (`false`, `null`);
    - a SUPPORT address with no number (`false`).

R19. The route writes nothing to the database. The resolve path lives in
    `lib/inbound-email-service.ts`, and that file makes only read calls (`findUnique` or
    `findFirst`). The dashboard's writes (R28) live in the repository and the client-setup service,
    not in this file.

R20. `workers/inbound-email/` exists with `wrangler.toml` (top-level plus `env.staging` and
    `env.production`, names `aheed-inbound-email-staging` and `aheed-inbound-email`) and
    `src/index.ts` exporting a default object with an `email(message, env, ctx)` handler. Its config
    has no database URL, no R2 binding and no KV binding.

R21. The handler's behaviour, each case covered by a unit test with a fake `ForwardableEmailMessage`
    and stubbed `fetch`:
    - **200:** it calls `forward(forwardTo)` exactly once, then logs one line containing `vendorId`,
      `purpose`, `orderRelated` and `orderNumber`;
    - **404:** it calls `setReject(...)` and does not forward;
    - **network error, 5xx or 401:** it calls `forward(env.INBOUND_FALLBACK_FORWARD)` and logs the
      failure status.

R22. No `console.*` call in `workers/inbound-email/src/` logs the message's `from`, `subject` or
    body. A unit test captures the log output for a message with distinctive from and subject
    strings and asserts that neither appears.

R23. `.github/workflows/deploy-staging.yml` and `deploy-production.yml` each deploy
    `workers/inbound-email` with `--config workers/inbound-email/wrangler.toml --env <env>`, in a
    step after the application deploy. The order of existing build and migrate steps is unchanged
    (`git diff` shows only added lines in those files).

## Client setup dashboard (Platform admin)

R24. `app/(admin)/staff/platform/client-setup/page.tsx` exists and is registered **once** in
    `components/staff/platform-nav-items.ts`, with label "Client Setup" and an icon from
    `components/icons/registry.ts`. No other file hand-writes a link to it, and
    `tests/staff-nav-parity.test.ts` passes.

R25. The page gates with `requireVendorRole("ADMIN")` plus `auth.via === "platform-admin"`:
    - 401 redirects to `/login`;
    - every other refusal renders `PanelRefusal`, never `return null`;
    - its top-level container is `PageContainer` with `width="wide"`;
    - `tests/page-container.test.ts` and `tests/platform-admin-rbac.test.ts` (or a new test of the
      same gate) pass.

R26. The page shows a vendor picker listing every vendor from the existing platform-admin vendor
    read. The selected vendor comes from the `?vendor=<slug>` search parameter, defaulting to the
    first vendor. An unknown slug renders a "not found" message, not an error page.

R27. The sections come from a data list, `lib/client-setup/sections.ts`. Each entry has `id`,
    `title`, a status evaluator (`complete` | `incomplete` | `blocked`) and an ordered list of guide
    steps. Each step has `title`, `detail`, an optional external `href` (the relevant Cloudflare
    dashboard or docs page) and a `done` evaluator. The list holds exactly **one** section in this
    slice, `email`. Adding a section is an append to this list plus its component; a unit test
    asserts every entry has a unique `id` and at least one step.

R28. The Email section lets a platform admin edit and save **through server actions**:
    - the vendor's `senderName` and `senderEmail` (on `VendorConfig`);
    - the vendor's inbound addresses: list, add (`address`, `purpose` ORDERS or SUPPORT,
      `forwardTo`), and remove.
    Every action re-runs the R25 gate itself, validates with zod (email format, lower-cased
    address), and returns a typed result the form renders as a message. An action never throws to
    the client.

R29. The server-actions module exports **only async functions** (CLAUDE.md "Server Actions").
    Shared constants and schemas live in a plain module. An add action refuses two cases with a
    clear message:
    - a `forwardTo` that is itself a registered inbound address (it would loop);
    - an address already registered to **any** vendor;

R30. The duplicate-address refusal relies on the unique constraint. The predicate accepts **both**
    `P2002` and raw SQLSTATE `"23505"`. It is verified by a script that makes a real duplicate
    insert through **`getPrisma()` (`PrismaNeonHttp`), the adapter the action uses**, against dev,
    and probes `getPrismaWs()` too. Both observed codes are recorded in build-notes.

R31. The Email section shows read-only platform status from `getEmailEnv()`:
    - the active provider, `EMAIL_FROM` and the recipient mode;
    - whether the vendor's `senderEmail` domain is in `EMAIL_VERIFIED_DOMAINS`, and so which From
      address mail actually goes out with (R5's result for this vendor, rendered from the same pure
      function, not reimplemented);
    - the Cloudflare limits from `plan.md`.
    It never renders a secret value (`RESEND_API_KEY`, `INBOUND_EMAIL_TOKEN`).

R32. The Email section's guide steps, in order:
    1. set up the sending domain (Cloudflare Email Sending);
    2. add the domain to `EMAIL_VERIFIED_DOMAINS`;
    3. set the sender name and email;
    4. verify the forward-to mailbox as a destination address;
    5. register the inbound addresses here;
    6. create the Email Routing rule to the inbound Worker;
    7. send a test email.
    Each step with an external page carries a link to it, on `dash.cloudflare.com` or
    `developers.cloudflare.com`. Steps 2, 3 and 5 compute `done` from data. Steps 1, 4 and 6 are
    marked "check in Cloudflare" (no API call), never shown as done.

R33. A "Send test email" action sends through `getEmailService()` with the vendor as `sender`,
    **to the signed-in platform admin's own email only** (no free-text recipient field). It reports
    "sent", "skipped by recipient policy" or "failed", with the reason. It therefore obeys R6, so on
    staging the admin's address must be on the allowlist.

R34. `lib/vendor-readiness-service.ts`'s `outgoing_email_service` item is no longer `PLANNED`:
    - its status derives from whether the vendor's sender domain is verified;
    - its `editHref` points to `/staff/platform/client-setup?vendor=<slug>`;
    - its existing tests are updated and pass.

## Documentation

R35. `specs/architecture.md` describes outgoing email as a provider-agnostic port with Cloudflare
    Email Service as default and Resend as a selectable fallback. It names `workers/inbound-email`
    beside `workers/scheduler`.

R36. `docs/developer-portal/env-setup.md` has a section titled "Email: sending and receiving". It
    covers:
    - every new key from R8 and R12, plus `INBOUND_FALLBACK_FORWARD`;
    - sending-domain setup;
    - Email Routing rules to the inbound Worker;
    - destination verification;
    - the Client Setup dashboard (R24) as the place inbound addresses and senders are managed;
    - the limits table from `plan.md`;
    - a sanity check with expected results and a "Last run" line.

R37. `docs/platform-admin-guide/platform-admin-guide.md` documents `/staff/platform/client-setup`.
    Every capability sentence in that section traces to a real control on the page, and
    `tests/operator-doc-coverage.test.ts` passes.

R38. `kms:validate`, `kms:check-generated` and `kms:coverage` exit 0. A real Next build in
    `kms/site-internal` succeeds after `kms:assemble:internal`.

## Live (owner-gated)

R39. On staging, after the owner steps in `plan.md` "Open items" 1–4:
    - a password reset requested for an address in `EMAIL_ALLOWED_RECIPIENTS` arrives in that
      inbox, from the vendor's address or from `EMAIL_FROM` with Reply-To set, as R5 dictates;
    - a reset for an address **not** on the list produces the R6 skip log line, and no email;
    - a message sent to a staging `ORDERS` address arrives at its `forwardTo` mailbox;
    - `wrangler tail aheed-inbound-email-staging` shows the R21 line with `orderRelated=true`.
    If the owner steps are not done, Validate records R39 as **UNVERIFIED (owner-gated)** and names
    the missing step. It is never recorded as a pass.

## Gates

R40. `CHANGELOG.md` updated (Gate 4).

R41. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`
    and `npm run build` all remain green after this slice.
