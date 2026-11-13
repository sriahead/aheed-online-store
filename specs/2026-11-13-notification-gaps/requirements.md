# Notification gaps (requirements)

R1. `ORDER_EVENTS` gains `PAYMENT_FAILED`. Its customer email subject reads
    `Order <n> was cancelled: payment didn't go through — <store>`, its heading says the payment did not go through,
    and its next step says no money was taken, the items were released and the shopper can order
    again. The owner title is `Payment failed`.
R2. The Stripe webhook sends `PAYMENT_FAILED` through `notifyOrderEvent` only for
    `checkout.session.async_payment_failed` and only when `orders.fail` returned `ok: true`.
    `checkout.session.expired` and a refused or repeated failure send nothing.
R3. Every contact submission that returns success (not the honeypot, not a rejection) sends one
    acknowledgement email to the shopper's address. Subject: `We've received your message — <store>`
    (`complaint` instead of `message` for a complaint). The body names the store, the contact type and
    the order number when one was verified, and contains no shopper-supplied text.
R4. The acknowledgement goes through `dispatchNotifications` with the store's sender, audience
    `CUSTOMER`, event `CONTACT_ACKNOWLEDGEMENT`. A failure or rejection never changes the shopper's
    result and is logged without the address.
R5. Creating a user sends each of the current store's Telegram order-alert recipients
    `New account: <store>` (environment-tagged), `Method: Email` or `Method: Google`, `Time:` in UK
    time, and `<base>/staff/customers` when the store has a canonical host. It carries no name or
    email. A failure never fails the sign-up.
R6. `getPlatformAlertChatId()` reads `PLATFORM_ALERT_TELEGRAM_CHAT_ID`; blank or missing is unset.
    It never throws. `configure-env` pushes it as an optional Worker secret.
R7. When the error-rate check breaches and a chat id is set, the job sends one Telegram message
    (`Error rate alert`, environment tag, count, threshold, window, `/staff/errors`), at most once per
    hour per Worker (KV key `error-rate:last-alert-at`; without KV it always sends). It still logs the
    existing line and returns the same body. A send failure is logged and never fails the job.
R8. On Aheed staging after deploy: a contact enquiry from an allowlisted address produces an
    acknowledgement `status=sent` line, and an email sign-up produces a `New account` Telegram alert.
