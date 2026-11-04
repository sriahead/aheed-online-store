---
id: 2026-11-03-storefront-contact-form-plan
title: "Storefront contact and complaint form (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-03
visibility: internal
summary: A storefront Contact us form for shoppers. Mail goes to the store's Client Setup forward-to, with environment-tagged subjects and a retry outbox for failed sends. Shared stores hide their footer email.
tags: [email, storefront, contact, client-setup, scheduler]
related: [2026-11-02-forward-dropdown-default-sender-plan, 2026-11-02-default-forward-inbox-plan, env-setup]
---

# Storefront contact and complaint form (plan)

Issue `#1409`. Proposed and approved by the owner on 2026-11-03, with all four defaults accepted.

**Goal:** a shopper can send a store a complaint or an enquiry, optionally about one of their own
orders. The message reaches the mailbox that store configured in Client Setup, labelled with the
store's name, so the platform hub can tell stores apart. Staging and dev mail can never be mistaken
for production. A message is not lost when sending is broken.

## Why

Email Routing on `merqify.com` has a catch-all rule. Today every mail to a store address lands in
`info-merqifyhub@googlegroups.com`, so nobody can tell which store it is about, whether it is a
complaint, or which order it concerns. Shoppers have no form. The footer prints each store's raw
contact email, including on shared-platform stores, where the owner wants it hidden.

Outgoing mail from `merqify.com` currently fails, because the domain is not onboarded in Email
Sending. A form that only sent mail would lose every submission today. The owner chose a
**store-only-on-failure** outbox: a submission is saved only when its send fails, retried, and
deleted once sent. There is no permanent complaint record.

## Scope (this slice)

1. **Environment identity.**
   - **The variable:** `APP_ENV` in `wrangler.toml` `[vars]`, `staging` and `production`. It is read
     by a new `getAppEnvironment()` in `lib/config.ts`. Anything else, including unset, means
     `development`.
   - **Why a new variable:** `NODE_ENV` is `production` on both Workers. `lib/config.ts` already says
     so where it introduces `EMAIL_RECIPIENT_MODE`.
   - **Why unset means development:** a forgotten variable then shows `[DEV]`, rather than silently
     looking like production.
2. **The subject tag.**
   - `withEnvironmentTag()` (`lib/email/environment-tag.ts`) prefixes `[STAGING] ` or `[DEV] `.
     Production is left unchanged.
   - It is applied **once, inside `getEmailService().send`**, so every email the platform sends is
     tagged and no caller can skip it. That includes order confirmations, at the owner's choice.
   - The same helper tags `mailto:` subjects.
3. **The contact page, `/contact`, on every storefront.**
   - **Who can use it:** guests and signed-in shoppers.
   - **Fields:** name, email, optional phone, type (Complaint or Enquiry), subject and message.
   - **The order picker** appears only for a signed-in shopper, listing their most recent orders at
     *this* store.
   - **Abuse protection:** a hidden honeypot field, plus a per-IP, per-store rate limit (5 an hour).
     It follows the `OrderLookupAttempt` pattern, in a new `ContactAttempt` table.
4. **The recipient comes from Client Setup.**
   - A complaint, or any message naming an order, goes to the store's `ORDERS` receiving address's
     `forwardTo`. An enquiry goes to `SUPPORT`.
   - Each falls back to the other purpose, then to `INBOUND_DEFAULT_FORWARD` (`#1399`).
   - Nothing is hardcoded. This is the same configuration the inbound Worker uses, so there is no
     second mechanism.
5. **The email.**
   - **From:** the platform (`EMAIL_FROM`), with **Reply-To the shopper**, so staff press Reply. A new
     optional `replyTo` on `OutgoingEmail` overrides the policy's Reply-To.
   - **Subject:** `Complaint · <store> · Order <number> · <subject>`, then the environment tag.
   - **Body:** every field, HTML-escaped.
6. **The outbox.**
   - **When a row is written:** only when `send` returns `failed`. A row goes into a new
     `ContactOutbox` table, and a KV marker (`contact-outbox:pending`) is set.
   - **The retry job:** `workers/scheduler` calls a new job route on the 15-minute tick when the
     marker is present, and on the daily run.
   - **What the job does:** sends each row, deletes it on success, and deletes and logs it once it
     is older than 7 days. It clears the marker when the table is empty.
   - **The shopper:** sees the same "received" confirmation either way.
7. **Footer.**
   - **Own-domain test:** the request host is tested with the `#1403` own-domain rule (an eligible
     host that is not the platform domain or under it).
   - **Shared-platform host:** the contact email is not rendered.
   - **Own-domain host:** the email is shown, and its `mailto:` carries an environment-tagged
     subject.
   - **Both:** a "Contact us" link to `/contact`, beside "Leave a review".

## Decisions

- **Own domain is judged from the request host, not the store's `VendorDomain` rows.** It costs no
  query on every storefront render. "Dedicated client under its own domain" also describes the site
  the shopper is actually on. A store reachable on both kinds of host shows the email only on its
  own domain, which is the point of hiding it on the shared platform.
- **`skipped` is not queued.** The log adapter returns `skipped` in dev, and staging's allowlist mode
  returns it for an unlisted recipient. Retrying would never change either outcome. Staging testers
  add the forward-to to `EMAIL_ALLOWED_RECIPIENTS` to receive contact mail.
- **The recipient is stored on the outbox row** rather than re-resolved at retry, so a retried
  message goes where the shopper's submission was routed.
- **No recipient at all** (no receiving address and no default inbox) is an error shown to the
  shopper, and nothing is stored. Storing would only delay the same failure by 7 days.
- **The From is the platform, not the store.** The mail goes *to* the store, and Reply-To carries
  the shopper.

## Deliberately excluded

- **A staff inbox or list of submissions:** the owner chose delete-on-send.
- **An acknowledgement email to the shopper.** It would double the outgoing volume while sending is
  broken. It is a candidate follow-up.
- **Attachments and CAPTCHA.** The owner accepted honeypot plus rate limit.
- **Changing Email Routing rules:** owner dashboard work, tracked under `#1392`.
- **The footer contact email's source:** it stays the Storefront settings `contactEmail` (owner
  default). It is not the Client Setup `SUPPORT` address.
- **A staff-panel page:** none is added, so `nav-items.ts` is untouched.

## Risks

- **Personal data at rest.** Outbox rows hold a shopper's name, email and message for up to 7 days
  while sending is broken. Once sending works, rows live seconds. The 7-day cap and deletion are R17.
- **Every outgoing subject changes in staging and dev.** Tests asserting exact subjects through
  `getEmailService()` may need the tag. Production subjects are unchanged.
- **The migration is hand-authored.** `migrate dev --create-only` refuses on dev (`#895`), so it is
  hand-written per CLAUDE.md.
