---
id: 2026-11-04-order-alerts-telegram-plan
title: "Telegram alerts for order-related inquiries (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-04
visibility: internal
summary: A store's staff get a short Telegram message when an order-related email or contact-form message arrives. Built channel-neutral so WhatsApp (#1424) is a later adapter, not a rework.
tags: [alerts, telegram, email, contact, client-setup]
related: [2026-11-01-cloudflare-email-service-plan, 2026-11-03-storefront-contact-form-plan, env-setup, tech-stack]
---

# Telegram alerts for order-related inquiries (plan)

Issue `#1390`. Proposed 2026-11-04. The owner chose the **Telegram Bot API** route and alerts on
**both** triggers. The owner also gave a direction: "keep it telegram now but in future the plan is
to divert them to whats app as well." WhatsApp is follow-up `#1424`. The options comparison is the
`/propose` comment on `#1390`.

**Goal:** when a customer gets in touch with a store about an order, by email or through the
storefront contact form, the store's staff get a short Telegram message within a minute so they can
deal with it quickly. A failed alert never affects the email forwarding or the contact form.

## Why both triggers need their own hook

`#1390` was written against `workers/inbound-email`, and its log line was named as the hook point.
The storefront contact form (`#1409`) never passes through that Worker. `processContactSubmission`
(`lib/contact/submit.ts`) sends straight to the store's real mailbox (`forwardTo`). A Worker-only
hook would therefore miss every contact-form inquiry, so there are two call sites. Both call one
shared function.

## Scope (this slice)

**1. Recipients, stored per channel (R1, R2, R8).** A new child table `VendorOrderAlertRecipient`
holds `vendorId`, `channel` and `destination`. The `OrderAlertChannel` enum has only `TELEGRAM` for
now. The destination is a Telegram chat id. A table rather than a `Vendor.orderAlertTelegramChatId`
column, because of the WhatsApp direction: `#1424` adds an enum value, an adapter and rows, with no
column rename and no change at the call sites. A vendor may have several recipients (for example a
staff group and the owner's own chat). The migration is hand-authored, because `migrate dev`
refuses on dev (`#895`, CLAUDE.md). It copies Prisma's own `migrate diff` output, exactly as
`20261101120000_vendor_inbound_address` did.

**2. One platform bot (R3, R4).** The owner's 2026-11-01 decision, "one platform sender", carries
over: a single bot whose token is the Worker secret `TELEGRAM_BOT_TOKEN`. It is read by its own
non-throwing reader in `lib/config.ts`, in the `getInboundDefaultForward` style, so a missing token
can never break the resolve route, the contact form or the page. `configure-env` treats it as
optional. The inbound-email Worker does not need it: the app sends.

**3. The alert core, `lib/order-alert/` (R5–R7).**
- `formatOrderAlert` builds the message as **plain text**. There is no `parse_mode`, so a subject
  cannot inject Telegram markup, and the same text later fits a WhatsApp utility-template body.
- The brief carries the order number, sender name and subject, as the owner decided on 2026-11-01.
  It also carries the store name and which route it came by. Neither of those is customer data, and
  without them a chat that serves two stores could not tell them apart.
- The **message body, the customer's email address and phone number never leave the platform.** The
  `OrderAlertBrief` type has no field that could carry them.
- Staging and development alerts carry `[STAGING]` / `[DEV]`, through the existing
  `withEnvironmentTag`, so a staging test never looks like a real order.
- `OrderAlertChannelAdapter` is the channel seam. The registry is typed over the Prisma enum, so
  adding `WHATSAPP` without an adapter fails `typecheck`.
- `sendOrderAlert` never throws, and it logs no subject and no sender name. That matches `#1217`'s
  R22 rule that nothing personal is logged.

**4. Incoming email (R9–R11).** The inbound-email Worker forwards first, exactly as today. Only
afterwards, and only when the resolution says `orderRelated`, does it call a new route,
`POST /api/inbound-email/alert`. That call carries the address, the subject and the sender's
**display name** (parsed from the `From` header, without the address part). The route re-resolves
the address itself rather than trusting a vendor id from the caller, then alerts. Because the alert
call comes after `forward()`, it cannot delay or break forwarding. `/api/inbound-email/resolve`
stays read-only and unchanged.

The definition of order-related is unchanged from `#1217`:
- the address's purpose is ORDERS, or
- the subject names a real order of that store.

**5. Contact form (R12).** `processContactSubmission` gets an `alert` dependency. It is called once,
after the email is sent or queued, when the message is a complaint or names the shopper's own
verified order. Those are the same conditions under which the form already routes to the ORDERS
mailbox (`lib/contact/recipient.ts`). The form has no "urgent" field, so order-related stands in for
urgent. A rejected alert is logged and the shopper still sees success.

The alert is **awaited**, not fired and forgotten. On a Worker, a promise nobody awaits can be
cancelled once the response is sent. The adapter's 5-second timeout bounds what a slow Telegram can
add to the shopper's wait.

**6. Client Setup (R13–R15).** The Email section gets an "Order alerts" card, platform admins only
like the rest of the page. It has:
- add a chat ID,
- remove a recipient,
- **Send test alert** per recipient, which proves the bot can reach the chat before a real order
  depends on it.

There is no new `/staff/*` route, so `nav-items.ts` is untouched.

**7. Docs (R16–R18).**
- The platform admin guide's Client Setup section, including how to find a chat ID.
- `tech-stack.md`, a standing decision: a new external service behind a port.
- `env-setup.md`.
- One sentence on the privacy page, because a customer's name and subject now reach a third-party
  messaging service.

## Deliberately excluded

- **WhatsApp delivery.** `#1424`, blocked by this slice.
- **Retry or outbox for a failed alert.** A failed alert is logged only. A late alert is worth less
  than none, and the email itself is never lost: forwarding and the contact-form outbox are
  untouched.
- **Throttling.** Every email to an ORDERS address alerts, so a spam wave to `orders@` produces a
  burst of messages, and Telegram limits a bot to roughly 20 messages a minute in one group. This is
  accepted for now. If it bites, a per-vendor cap is a follow-up.
- **Reading the order number from the email body.** That needs MIME parsing in the Worker; it was
  left out of `#1217` and stays out (see the owner note on `#1390`). Subject-only classification is
  kept.
- **Self-service linking** (a vendor sends `/start <code>` to the bot). That needs a Telegram
  webhook route. For now the platform admin types the chat ID.
- **Vendor-admin access.** Client Setup is platform-admin only. Letting a store admin manage their
  own alert recipients is a later decision.
- **An Email-guide step or section status for alerts.** Alerts are optional, so they do not affect
  whether the Email section reads Complete.
- **A Telegram webhook, inbound commands, or replies from Telegram.** The bot only sends.

## Open items carried forward

- **Owner-created resources (hard stop for live proof).** Create a bot with BotFather and give its
  token to both `secrets/<env>.vars` files, then `configure-env`. Create a staff group with the bot
  added. Until a token exists, the live rows in `validation.md` (R19) are **blocked**, not passed.
  Unit and route tests still run.
- **Privacy wording (R18)** is legal-facing copy. The proposed sentence is in `requirements.md`; the
  owner may change it at review.
- **`#1424`** picks up WhatsApp through the same adapter seam.
