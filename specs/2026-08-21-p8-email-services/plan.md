---
id: 2026-08-21-p8-email-services
title: P8 Email Services Plan
summary: Detailed implementation plan and sub-tasks for P8 Email Services.
audience: [dev]
type: spec
version: 1.1.0
updated: 2026-08-21
status: draft
visibility: internal
---

# Plan

## 1. Infrastructure & Boilerplate
- [ ] **1.1 Binding Configuration**: Add \"send_email": [{ "name": "EMAIL" }]\ to \wrangler.jsonc\.
- [ ] **1.2 Domain Onboarding**: Run \
px wrangler email sending enable <user-domain>\ to verify the sender domain.
- [ ] **1.3 Environment Setup**: Add \EMAIL: SendEmail\ to the \Env\ interface in \lib/config.ts\ or equivalent Cloudflare types definition.

## 2. Core Email Library (\lib/email.ts\)
- [ ] **2.1 Base Sender Function**: Implement a wrapper \sendTransactionalEmail({ to, subject, html, text, replyTo })\ that calls \env.EMAIL.send()\.
- [ ] **2.2 Error Handling**: Wrap the send call in a try/catch block. Ensure that non-critical email failures (like a welcome email bouncing) do not crash the main thread (e.g., using \ctx.waitUntil()\).
- [ ] **2.3 HTML Templates**: Create a robust, responsive HTML template system (or just string interpolation) for the Aheed branding. Ensure standard styling is applied inline.

## 3. Order Notifications Integration
- [ ] **3.1 Customer Receipt Template**: Build the HTML/Text strings iterating over \order.items\.
- [ ] **3.2 Vendor Alert Template**: Build the HTML/Text strings for the vendor.
- [ ] **3.3 Webhook Injection**: Inside the Stripe webhook handler (\pp/api/webhooks/stripe/route.ts\) or checkout completion action, dispatch both emails via \Promise.allSettled\ wrapped in \waitUntil\ so it doesn't block the checkout response.

## 4. Authentication Emails Integration
- [ ] **4.1 Welcome Email**: Hook into the registration server action to fire the welcome email upon successful DB write.
- [ ] **4.2 Password Reset Flow**: Generate a secure token, store it in the database with an expiry, and email the token link. (If a reset flow doesn't exist, stub the email sending function for it).

## 5. Inbound Email Routing
- [ ] **5.1 Worker Handler**: Modify the Next.js Cloudflare Edge adapter or write a custom worker entrypoint to export the \email(message, env, ctx)\ function.
- [ ] **5.2 Parsing**: Import \postal-mime\ to parse the inbound \message.raw\. (Remember to buffer the raw stream first).
- [ ] **5.3 Forwarding Logic**: Identify the vendor based on the recipient address (e.g., \endor-uuid@reply.aheed.com\) and use \message.forward()\ to route it to their verified real inbox.
