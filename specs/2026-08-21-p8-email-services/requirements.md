---
id: 2026-08-21-p8-email-services
title: P8 Email Services Requirements
summary: Detailed requirements for email integration in Phase 8 using Cloudflare Email Service.
audience: [dev, product]
type: spec
version: 1.1.0
updated: 2026-08-21
status: draft
visibility: internal
---

# Requirements (P8 Email Services)

We will use the native Cloudflare Workers \send_email\ binding and Email Routing to implement transactional emails. No third-party SMTP services (like SendGrid or AWS SES) are permitted.

## R1 - Infrastructure & Domain Setup
- **R1.1**: The application must include the \send_email\ binding in \wrangler.jsonc\ pointing to the Cloudflare Email Service.
- **R1.2**: The sending domain must be verified using \
px wrangler email sending enable <domain>\.
- **R1.3**: The application must fail gracefully if the email binding is missing in local development or if the Cloudflare API is temporarily unreachable.

## R2 - Order Confirmations (Customer)
- **R2.1**: A transactional receipt must be sent to the shopper immediately upon successful payment/checkout completion.
- **R2.2**: The email must include both HTML and plain-text fallbacks to avoid spam filters.
- **R2.3**: The email content must include: Order Number, items purchased, total paid, and vendor details.
- **R2.4**: The \Reply-To\ header must be set to the specific vendor's support email, not a global admin email.

## R3 - Vendor Notifications
- **R3.1**: A notification email must be sent to the vendor immediately upon successful order creation.
- **R3.2**: The email must securely link the vendor to the \/staff/orders\ page for fulfillment.
- **R3.3**: The email should summarize the items that need to be prepared.

## R4 - Welcome & Authentication Emails
- **R4.1 - Welcome**: A welcome email should be dispatched when a new user successfully registers an account.
- **R4.2 - Password Reset**: A password reset email containing a secure, time-limited token must be sent when requested.
- **R4.3 - Magic Links (Optional)**: If passwordless login is enabled, magic link emails must be reliably delivered with low latency.

## R5 - Inbound Email Routing
- **R5.1**: The Worker must export an \email()\ handler to process inbound messages routed by Cloudflare Email Routing.
- **R5.2**: Incoming emails must be safely buffered (\wait new Response(message.raw).arrayBuffer()\) as the raw stream is single-use.
- **R5.3**: Customer support replies to order emails should be parsed and (if applicable) appended to an internal ticket or forwarded to the vendor's actual inbox using \message.forward()\.
