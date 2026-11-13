---
id: notification-matrix
title: "Notification matrix — which email or alert is sent when"
audience: [dev, platform-admin, store-admin, staff]
type: doc
status: approved
version: "1.4.0"
updated: 2026-11-13
visibility: internal
summary: Every customer email, owner email and Telegram alert the platform sends — the event that triggers it, who receives it, what stops a duplicate, and the code that sends it. The one place to answer "will anyone be told when X happens?".
tags: [notifications, email, telegram, operations]
---

# Notification matrix

The single reference for **what is sent, to whom, and when** (`#1554`). The store admin guide, the
platform admin guide, the staff playbook and the shopper guide each carry the part their readers
need, and link here for the rest. When you add or change a notification, update this table first.

## Who receives what

| # | Event (what actually happened) | Customer email | Owner email | Owner Telegram | Kind |
| --- | --- | --- | --- | --- | --- |
| 1 | **Order confirmed**: payment succeeded (Stripe webhook, payment sweep or staff recovery) | Yes: "is confirmed", items, total, slot, points | Yes: "New order" | Yes: "New order" | Transactional |
| 2 | **Out for delivery** (staff status change) | Yes | Yes | Yes | Transactional |
| 3 | **Ready for collection** | Yes | Yes | Yes | Transactional |
| 4 | **Delivered** / **Collected** | Yes, with points earned | Yes | Yes | Transactional |
| 5 | **Cancelled by staff** | Yes: points and code returned; charge not yet refunded | Yes | Yes | Transactional |
| 6 | **Bulk status change** (several orders at once) | One per order | One digest per status | One digest per status | Transactional |
| 7 | **Payment failed** (asynchronous method, e.g. bank debit) | Yes: "no money has been taken" | Yes: "Payment failed" | Yes | Transactional |
| 8 | **Checkout expired** (abandoned, never paid) | **No** automatic email | No | No | — (listed in `/staff/abandoned-checkouts`) |
| 9 | **Abandoned-checkout reminder** (an admin presses Send reminder) | Yes: "Your basket is waiting", optional code | No | No | **Marketing** (consent required) |
| 10 | **Contact us** message (enquiry or complaint) | Yes: fixed acknowledgement, echoes nothing typed | Yes, to the receiving address's forward-to | Yes: "Enquiry" or "Complaint" | Transactional |
| 11 | **Email to a receiving address** (inbound) | No | Forwarded to the forward-to mailbox | Only when order-related (Orders address, or an order number in the subject) | — |
| 12 | **Staff reply** in Enquiries & Inbox | Yes: the reply itself | No | No | Transactional |
| 13 | **New account** (sign-up, email or Google) | Verification email only (no welcome email) | No | Yes: "New account", method and time | Transactional |
| 14 | **Password reset** requested | Yes: reset link | No | No | Transactional |
| 15 | **Error-rate breach** (scheduled check) | No | No | Yes, to the platform alert chat, at most hourly | Operational |
| 16 | **Staff "Resend confirmation email"** | Yes: the confirmation again | No | No | Transactional |
| 17 | **Sign-up with an email that already has an account** | Yes: "You already have an account with `<store>`", with sign-in and forgot-password (or Google) links; the screen stays neutral | No | No | Transactional |

Not sent today: **refunds** (there is no refund flow, `#606`), a **welcome email**, and any
automatic abandoned-cart email.

## What stops a duplicate

| Event | Guard |
| --- | --- |
| 1–7 | Sent only by the request that performed the status change. A Stripe retry finds the order already moved and sends nothing. |
| 9 | One row per order in `AbandonedCheckoutReminder` (unique `orderId`), claimed **before** the email is sent: a double click or a second admin gets "already sent". |
| 10 | The rate limit and honeypot. Two genuine submissions are two messages. |
| 15 | KV key `error-rate:last-alert-at`: at most one alert an hour per Worker. |

## Where the message goes

- **Customer email**: the order's buyer email, or the account email. It is sent from the store's
  sender (`no-reply@merqify.com` with the store's name until `#104` verifies the store's own domain).
- **Owner email**: the **forward-to** of the store's **Orders** receiving address, else its
  **Support** address, else nobody (Client Setup, Receiving addresses).
- **Owner Telegram**: every chat in Client Setup, **Order alerts**. Each cell's bot can only post
  to chats it has been added to.
- **Platform alert chat**: `PLATFORM_ALERT_TELEGRAM_CHAT_ID` (Worker secret, optional).
- **Staging** only emails `EMAIL_ALLOWED_RECIPIENTS` and Client Setup's forward-to mailboxes; every
  other recipient is skipped and logged. Every staging subject and alert starts with `[STAGING]`.

## Failure and retry

- **Customer and owner messages (1–7, 9, 10, 13)** are sent once. A failed send is stored in
  `NotificationOutbox` and retried by `/api/jobs/retry-notification-outbox` for up to 24 hours.
- **Contact form copies to the store (10)** use `ContactOutbox`, retried for up to 7 days.
- Each attempt writes one log line: `notification vendorId=… channel=… audience=… event=… status=…`.
  It never contains an address, a subject or a message body.
- A notification failure never fails or reverses the order, payment or sign-up that caused it.

## Marketing rules (event 9 only)

- Sent only to a **signed-in customer** whose newest marketing choice is "yes" **and** whose email
  is verified (`hasEffectiveMarketingConsent`). Guests are never emailed.
- One per abandoned checkout, within **7 days** of expiry. The page lists the last **30 days**.
- Every reminder carries a **Stop marketing emails** link to `/account/data`.
- The copy is persuasive but honest: it uses endowment, goal-gradient, cognitive ease, reciprocity
  and truthful loss framing. It **never** uses a countdown, an invented deadline, "only N left" or
  claims about other shoppers, all of which are banned by the CPRs and the DMCC Act 2024.

## How customer emails look (`#1564`)

Every customer email is rendered by one layout (`lib/email/layout/render.ts`) from structured
content, so they share one design: the store's mark and name at the top, a heading, the key facts
(order number, slot) in a panel, one button, a reassurance line, and a footer with the store's
address and site, why the email was sent, and "Powered by Merqify".

- **Branding is the store's own data**: name, square mark (PNG), dark brand colour for the button
  and accent, cream for the background, `VendorLocation` for the address. A colour white text
  cannot sit on falls back to a neutral dark. The full logo is not used: it is WebP, which Outlook
  desktop cannot show.
- **Every email has a plain-text part.** Templates write their own; anything else (an outbox retry)
  gets one derived from the HTML in `getEmailService().send`.
- **Wording lives in templates** (`lib/email/templates/registry.ts`): 14 keys, each with its
  placeholders, default subject, preview line, heading, intro, button label, reassurance and
  sign-off. Next-step sentences, items, totals, links and legal lines are locked.
- **Editable per store** (`#1564` part 2): store admins change those seven fields at
  `/staff/email-templates` (`EmailTemplateOverride`, one row per store per template; blank means
  default). Senders read the overrides at render time and fall back to the defaults if the read
  fails; queued retries keep what was rendered.
- **Preview:** `npm run email:preview -- --vars <secrets file> --vendor <slug> --out <file>` renders
  every template with the store's real branding into one page. Nothing is sent.
- "Powered by" is always Merqify, never `PLATFORM_NAME`: the dedicated cells set that to the
  store's own name.

## Code map

| Event | Sent from |
| --- | --- |
| 1–7, 16 | `lib/order-notifications/` via `lib/order-notifications-service.ts` |
| 7 | `app/api/webhooks/stripe/route.ts` (`async_payment_failed`) |
| 9 | `lib/abandoned-checkout/` via `lib/abandoned-checkouts-service.ts`; page `/staff/abandoned-checkouts` |
| 10 | `lib/contact/submit.ts` (`acknowledge`, `alert`) |
| 11 | `lib/inbound-email-service.ts` |
| 13 | `lib/notifications/registration.ts`, hook in `lib/auth.ts` |
| 15 | `lib/notifications/error-rate-alert.ts`, `app/api/jobs/check-error-rate/route.ts` |
| 17 | `lib/notifications/existing-account.ts` via `lib/existing-account-signup-service.ts`; Better Auth `onExistingUserSignUp` in `lib/auth.ts` (`#1558`) |
| All dispatch | `lib/notifications/dispatch.ts` (send first, queue on failure) |
| Customer email design | `lib/email/layout/`, `lib/email/templates/`, branding via `lib/email-brand-service.ts` (`#1564`) |

## Sanity check after a change (`#1552`, `#1554`, `#1558`)

Run on staging first, from an address on `EMAIL_ALLOWED_RECIPIENTS`, while tailing the app Worker
(`npx wrangler tail afc-store-staging`, with `CLOUDFLARE_ACCOUNT_ID` set to the Merqify account).

| Step | Expected |
| --- | --- |
| 1. Send a **Contact us** enquiry | The page says sent; the log shows `order alert … channel=TELEGRAM status=sent` and `notification … event=CONTACT_ACKNOWLEDGEMENT status=sent`; the inbox gets "We've received your message"; Telegram shows `[STAGING] Enquiry: <store>`. |
| 2. Create an account | Telegram shows `[STAGING] New account: <store>` with method and time, and no name or email. |
| 3. Open `/staff/abandoned-checkouts` as a store admin | The list loads; staff accounts see "Admins only". |
| 4. On an eligible row, press **Send reminder** | The row changes to "Sent … by `<you>`"; the log shows `event=ABANDONED_CHECKOUT_REMINDER status=sent`; pressing it again is impossible. |
| 5. With `PLATFORM_ALERT_TELEGRAM_CHAT_ID` set, wait for an error-rate breach | One "Error rate alert" in that chat, then nothing more for an hour. |
| 6. Register again with an allowlisted address that already has an account (`#1558`) | The screen says "Check your email"; the inbox gets "`[STAGING] You already have an account with <store>`"; no account is created and no "New account" alert fires. |

**Last run:** 2026-11-13, AFC staging (`#1558`). Step 1 passed earlier on Aheed staging
(`status=sent` for both lines). Step 2 passed: a new sign-up logged `event=REGISTRATION status=sent`
(Telegram accepted the alert). Step 3: the route answers (307 to login when signed out). Step 5:
chat id set on staging and production 2026-11-13, no breach yet. Step 6 passed: the owner received
the email at an allowlisted address; no account created, no alert. Step 4 not yet run (no abandoned
checkouts on AFC staging).
