---
id: 2026-11-01-cloudflare-email-service-plan
title: "Cloudflare Email Service and Client Setup dashboard (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-01
visibility: internal
summary: "#1217. Client Setup dashboard for platform admins (Email first), provider-agnostic EmailService on Cloudflare with Resend as fallback, per-vendor senders, and an inbound Email Routing Worker."
tags: [email, cloudflare, p12, inbound, outbound, multi-tenant]
related: [architecture, env-setup]
---

# Cloudflare Email Service: per-vendor outgoing and incoming email (plan)

Issue `#1217` (re-scoped 2026-11-01 to cover both directions), part of `#1337` (P12-B). WhatsApp
alerts for order mail are the next slice, `#1390`, and are not built here.

**Goal:** stores send transactional email through **Cloudflare Email Service** from **their own
address**. Email to a store's `orders@`/`support@` address reaches the store's real inbox, and every
received message is classified as order-related or not. Afterwards nothing in production depends
on Resend, but Resend stays **one config value away** if Cloudflare has to be abandoned.

## Owner decisions this spec encodes

- 2026-10-29: Resend is retired as the provider; Cloudflare Email Service in the Merqify account
  replaces it.
- 2026-11-01 (`/propose`):
  - outgoing and incoming email ship as **one slice**, WhatsApp as another (`#1390`);
  - the **From address is per vendor** (both `merqify.com` and `aheedfoodcentre.co.uk`);
  - received mail is **forwarded to a real mailbox**, and no email body is stored in our database;
  - the WhatsApp brief will carry order number, sender and subject only.
- 2026-11-01 (`/spec` instruction): **keep the implementation provider-agnostic so Resend can be
  restored later.** This **supersedes** the 2026-10-29 note on `#1217` to "drop the Resend adapter".
  The adapter stays, selectable by `EMAIL_PROVIDER=resend`, but nothing requires its keys unless it
  is selected.
- 2026-10-22 (still in force): development and staging send only to an **approved test-address
  allowlist**; arbitrary recipients only in production.

## What exists today (verified 2026-11-01)

- `lib/email.ts` defines `EmailService.send({ to, subject, html })`. The Resend `fetch` call is
  written straight into `getEmailService()`. When keys are missing it logs and returns, and it
  never throws.
- There are three send sites:
  - `lib/auth.ts`, password reset and email verification (subject uses
    `getCurrentVendorSenderName()`);
  - `features/checkout/send-confirmation.ts`, order confirmation (uses
    `fetchVendorProfile(order.vendorId)`).
- Email is platform-wide: one `RESEND_FROM_EMAIL`. `VendorConfig.senderEmail` exists but is not used
  as the From address.
- `lib/config.ts` `emailSchema` requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL` whenever
  `NODE_ENV === "production"`. **That is true on staging too** (both Workers run a production
  build), so `NODE_ENV` cannot tell staging from production. The recipient allowlist therefore
  needs its own explicit setting.
- `scripts/configure-env.mjs` lists `RESEND_API_KEY` and `RESEND_FROM_EMAIL` as required.
- The application Worker's entry, `.open-next/worker.js`, is **generated** and exports only
  `fetch`. A second Worker already exists for exactly this reason: `workers/scheduler` (cron). It
  holds no database or vendor data, and calls the app over HTTPS with a shared-secret header
  (`x-job-token`, `app/api/jobs/*`).
- `@cloudflare/workers-types` 5.20260804.1 types `SendEmail.send(builder)` with `from` (string or
  `{name,email}`), `to`, `subject`, `html`, `text` and `replyTo`. It also types the email handler's
  `ForwardableEmailMessage` with `headers`, `forward(rcptTo)` and `setReject(reason)`.
- Order numbers are `<PREFIX>-<YYYYMMDD>-<6 chars>` (`lib/order-totals.ts` `buildOrderNumber`), and
  `Order.orderNumber` is unique.

## Scope (this slice)

### 1. Provider-agnostic outgoing email (`lib/email.ts` and siblings)

- **The `EmailService` port** gains an optional `sender: { name, email }`. Callers pass the
  vendor's identity, and the port stays the only thing callers import.
- **Adapters, one file each**, under `lib/email/`. `lib/email.ts` re-exports, so import paths don't
  change:
  - `cloudflare`: uses the `EMAIL` `send_email` binding through `getCloudflareContext()`;
  - `resend`: today's `fetch` call, moved unchanged in behaviour;
  - `log`: logs only. It is the default when nothing is configured, which is the current
    degradation behaviour.
- **Selection by `EMAIL_PROVIDER`** (`cloudflare` | `resend` | `log`):
  - if unset, `cloudflare` when the `EMAIL` binding is present, otherwise `log`;
  - adding a provider means one new adapter file and one enum value, with no caller change.
- **From address resolution, one pure function:**
  - use the vendor's `senderEmail` when its domain is listed in `EMAIL_VERIFIED_DOMAINS`;
  - otherwise use the platform `EMAIL_FROM`, with `replyTo` set to the vendor's `senderEmail`, so
    replies still reach the store;
  - the display name is always the vendor's `senderName`.
  This is how a vendor whose domain isn't set up yet (Aheed until `#1342`) still gets working
  password resets.
- **Recipient policy, one pure function, `EMAIL_RECIPIENT_MODE`** (`allowlist` | `open`):
  - **`allowlist` is the default** and is used unless `open` is set;
  - in `allowlist`, only addresses in `EMAIL_ALLOWED_RECIPIENTS` are sent to;
  - every other recipient is **skipped and logged**, never thrown;
  - production sets `open` in `[env.production.vars]`, and staging does not.
  A forgotten setting therefore fails safe: no stray mail to real customers from staging.
- **Config** (`lib/config.ts` `emailSchema`):
  - replace the two `RESEND_*` keys with `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_VERIFIED_DOMAINS`,
    `EMAIL_RECIPIENT_MODE` and `EMAIL_ALLOWED_RECIPIENTS`;
  - keep `RESEND_API_KEY`, now optional;
  - the production `superRefine` requires `EMAIL_FROM` always, and `RESEND_API_KEY` **only when
    `EMAIL_PROVIDER=resend`**;
  - `RESEND_FROM_EMAIL` is retired, and `EMAIL_FROM` serves every provider.
- **Callers:**
  - `lib/auth.ts` gets the vendor's name and email from a new `getCurrentVendorSender()` in
    `lib/vendor-service.ts` (beside `getCurrentVendorSenderName`, which stays for any other caller);
  - `send-confirmation.ts` passes `vendor.senderName` and `vendor.senderEmail`;
  - subjects and HTML are unchanged.
- **`wrangler.toml`:** `[[env.staging.send_email]]` and `[[env.production.send_email]]` with
  `name = "EMAIL"`. Remove the 2026-10-29 Resend stopgap note if `wrangler.toml` carries one.
- **`scripts/configure-env.mjs`:** stops requiring `RESEND_*`. It requires `EMAIL_FROM`, plus
  `INBOUND_EMAIL_TOKEN` for the inbound Worker (below).
- **Cost entries:**
  - `lib/running-costs.ts` `cloudflare-email`: price confirmed, 3,000 included per month, then
    $0.35 per 1,000, Workers Paid;
  - `lib/pricing/cost-drivers.ts` `email-transactional`: provider becomes Cloudflare Email Service,
    with Cloudflare's pricing URL as the source.

### 2. Incoming email: `workers/inbound-email` plus one app route

- **Data model, additive and 3NF:**
  - `enum InboundAddressPurpose { ORDERS SUPPORT }`;
  - `model VendorInboundAddress` with fields `id`, `vendorId` (foreign key, cascade), `address`
    (unique, stored lower-case), `purpose` and `forwardTo` (the vendor's real mailbox), plus
    `createdAt` and `@@index([vendorId])`;
  - it mirrors `VendorDomain`. The address resolves the vendor, as a host does.
  - **The migration is hand-authored** (CLAUDE.md, `#895`).
- **Repository** `lib/repositories/inbound-address.ts`: a pure lookup by address, taking a client
  parameter. **Service** `lib/inbound-email-service.ts` holds the request-scoped facade: it finds
  the address row, then, if the subject carries an order number, checks that the order belongs to
  that vendor.
- **App route** `POST /api/inbound-email/resolve`:
  - authenticated by header `x-inbound-token` against `INBOUND_EMAIL_TOKEN`, with the same
    fail-closed shape as `app/api/jobs/*` (503 when unset, 401 on mismatch, constant-time compare);
  - body `{ to, subject }`;
  - response `{ forwardTo, vendorId, purpose, orderRelated, orderNumber }`, or 404 for an unknown
    address;
  - `orderRelated` is true when `purpose === ORDERS`, **or** the subject contains an order number
    belonging to that vendor;
  - it stores nothing.
- **Worker** `workers/inbound-email` (own `wrangler.toml`, staging and production envs, like the
  scheduler):
  - its `email()` handler POSTs `{ to, subject }` to the route;
  - on 200 it calls `message.forward(forwardTo)` and logs one structured line,
    `inbound-email vendorId=… purpose=… orderRelated=… orderNumber=…`. **No sender address,
    subject or body is logged**;
  - on 404 it calls `message.setReject("Unknown recipient")`;
  - on any other failure (network, 5xx, 401) it forwards to `INBOUND_FALLBACK_FORWARD`, so mail is
    never lost to an app outage;
  - it has no database binding and no vendor data;
  - `#1390` attaches the WhatsApp alert at the point the structured line is logged.
- **Rows are written from the Client Setup dashboard** (section 3). There is no CLI.
- **Deploy:** `deploy-staging.yml` and `deploy-production.yml` each gain one step that deploys
  `workers/inbound-email`, placed beside the existing scheduler deploy step (after the application
  deploy). No quality check is added, so `quality.yml` is untouched, and the build-before-migrate
  order is not changed. Until the owner creates the Email Routing rules, the deployed Worker simply
  receives nothing.

### 3. Client Setup dashboard (Platform admin), first section: Email

**Owner vision (2026-11-01):** during client onboarding the platform admin has one dashboard per
client. On it they configure every required parameter, follow links to the right external
consoles, work through a step-by-step guide, and come back later to update anything. **This slice
builds the screen and its first section, Email.** Other sections (domains, payments, branding and
so on) are added one at a time later.

- **Route:** `/staff/platform/client-setup`, registered once in
  `components/staff/platform-nav-items.ts` as "Client Setup". Gate: platform admin only (the
  `requireVendorRole("ADMIN")` + `auth.via === "platform-admin"` shape every `/staff/platform/*`
  page uses), with `PanelRefusal` on refusal and `PageContainer width="wide"`.
- **Client picker:** `?vendor=<slug>`, listing vendors from the existing platform-admin read.
- **Extensible by data:** `lib/client-setup/sections.ts` lists sections. Each has a status and
  ordered guide steps, with an optional external link and a `done` evaluator. The page renders the
  list, so a new section is one entry plus one component, with no page rewrite.
- **The Email section:**
  - *Edit:* the vendor's sender name and email (`VendorConfig.senderName`/`senderEmail`, which no
    screen can edit today), and its inbound addresses (add and remove, with purpose and forward-to
    mailbox).
  - *Status, read-only:* active provider, platform `EMAIL_FROM`, recipient mode, whether this
    vendor's domain is verified, the From address mail will actually use (computed by the same
    function the sender uses), and the Cloudflare limits. Secrets are never shown.
  - *Guide:* seven ordered steps with links into the Cloudflare dashboard and docs. Steps we can
    check from our own data show done or not done. Steps only Cloudflare knows (domain setup,
    destination verified, routing rule) say "check in Cloudflare", because there is no API call
    and so no false "done".
  - *Send test email:* to the signed-in admin's own address only, through the real
    `EmailService`, so it proves the whole sending path, recipient policy included.
- **Server actions** in a `"use server"` module that exports only async functions. Each action
  re-checks the platform-admin gate, validates with zod, and returns a result instead of throwing.
  - **Duplicate-address detection accepts both `P2002` and `"23505"`**, verified against a real
    duplicate through `getPrisma()`, the adapter the action uses (CLAUDE.md; the `#232` lesson).
  - Writes are singular, childless `create`/`update`/`delete`, so `getPrisma()` is safe (no
    implicit transaction).
- **Readiness hook:** the `outgoing_email_service` item in `lib/vendor-readiness-service.ts`
  stops being `PLANNED`, takes its status from the verified domain, and links here.

### 4. Documentation (persistent)

- `specs/architecture.md`: the email section names the provider-agnostic port, the Cloudflare
  default, the Resend fallback, and the inbound Worker as the third Worker in a cell.
- `docs/developer-portal/env-setup.md`: a new section, "Email: sending and receiving". It covers:
  - sending-domain setup per vendor;
  - Email Routing rules (address → `aheed-inbound-email[-staging]` Worker);
  - verifying `forwardTo` destinations;
  - the new keys;
  - the Client Setup dashboard as where senders and inbound addresses are managed;
  - the limits table;
  - a sanity check.
- `docs/platform-admin-guide/platform-admin-guide.md`: a section for Client Setup. Every
  capability sentence traces to a real control (`tests/operator-doc-coverage.test.ts`).
  **Coordinate with the KMS-documents agent before editing `docs/`** (owner note, 2026-11-01).

## Limits recorded for the owner (Cloudflare docs, read 2026-11-01)

| | Outgoing | Incoming |
|---|---|---|
| Plan | Workers Paid only | Free and Paid |
| Volume | 3,000/month included per account, then $0.35 per 1,000 | Unlimited, free |
| Daily | New accounts start with a conservative quota that grows; no number published. Read it in the dashboard. Raise it with the Limit Increase Request Form. | No cap |
| Per message | 50 recipients, 25 MiB | 25 MiB |
| Other | Bounces count, API rejections don't. Sends to verified addresses are free. Before a domain is set up, only verified addresses can receive. Public beta. | 200 rules per domain, 200 verified destinations per account, 30 routing + sending domains per zone |

The app sends one email per recipient (`to` is a single string), so the 50-recipient cap cannot
bind.

## Deliberately excluded

- **WhatsApp alerts:** `#1390`.
- **Storing received mail, a staff-panel inbox, attachments:** forwarding was chosen instead.
- **Parsing the email body (MIME)** to find order numbers. Classification reads the **subject**
  only, so no MIME-parsing dependency is added. A body-based match is a `#1390` follow-up if
  subject-only proves too weak.
- **Other Client Setup sections** (domains, Stripe, branding, catalogue import, and the rest).
  The section list is built to take them; each is its own later slice.
- **A store-admin (vendor-side) screen for email.** Client Setup is platform-admin only, as
  onboarding is a platform task.
- **Reading Cloudflare state through its API** (domain verified, routing rule present). The guide
  links there instead; an API integration would need an account token with wider scope.
- **Deleting the Resend account (`#1348`) or its keys from the secret stores.** That is an owner
  action after this is live in both environments.
- **Automatic detection of domain setup** through the Cloudflare API. `EMAIL_VERIFIED_DOMAINS` is
  set by hand per environment.
- **Bounce and complaint handling** (suppression lists). Cloudflare exposes none to a Worker
  binding today.

## Open items carried forward (owner, no code)

1. Set up the sending domain `merqify.com` (and SriMart's sender domain, if different) in the
   Merqify account, in Email Sending. `aheedfoodcentre.co.uk` waits for `#1342` (around
   2026-11-05).
2. Verify each `forwardTo` mailbox and the `INBOUND_FALLBACK_FORWARD` mailbox as Email Routing
   destination addresses.
3. Register each store's addresses in Client Setup, then create Email Routing rules sending them
   to the inbound Worker (after it is deployed).
4. Put `INBOUND_EMAIL_TOKEN` in both stores (Cloudflare secret on **both** Workers, and
   `secrets/*.vars`).
5. Read the account's actual daily sending quota from the dashboard and record it in `env-setup.md`.
