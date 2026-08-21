---
id: 2026-08-21-p8-email-services
title: P8 Email Services Validation
summary: Edge cases and standard scenarios for validating the Cloudflare Email Service implementation.
audience: [qa, dev]
type: spec
version: 1.1.0
updated: 2026-08-21
status: draft
visibility: internal
---

# Validation Scenarios

## 1. Domain & Binding Infrastructure
- [ ] **Standard**: The \send_email\ binding is accessible at runtime via \env.EMAIL\.
- [ ] **Edge Case (Local Dev)**: When running locally (\
ext dev\), \env.EMAIL\ may be undefined or a mock. The application must not crash; it should log a warning instead.
- [ ] **Edge Case (Unverified Domain)**: Attempting to send from an unverified domain should throw a specific error. The wrapper function must catch this and log it gracefully.

## 2. Customer Order Receipts
- [ ] **Standard**: Place an order; the customer receives an email with correct totals, taxes, and item lists.
- [ ] **Standard**: The \Reply-To\ header must correctly point to the vendor's configured support email address.
- [ ] **Edge Case (Missing HTML)**: Verify that email clients without HTML support correctly render the plain-text fallback string.
- [ ] **Edge Case (Checkout Failure)**: If the Stripe payment fails, the confirmation email must **not** be sent.

## 3. Vendor Order Alerts
- [ ] **Standard**: The vendor receives an email indicating a new order is ready to pack.
- [ ] **Edge Case (Multiple Vendors)**: If a single checkout contains items from multiple vendors, **each vendor** must receive a targeted email containing only their items, not the entire cart.

## 4. Authentication Emails
- [ ] **Standard (Welcome)**: Register a new account; receive a branded welcome email.
- [ ] **Standard (Password Reset)**: Request a password reset; verify the link is clickable and routes to the correct page.
- [ ] **Edge Case (Invalid Email Address)**: If the user inputs a malformed email address, the underlying \env.EMAIL.send()\ will reject it. The application must surface a polite error message to the user rather than crashing the auth flow.

## 5. Inbound Email Routing
- [ ] **Standard**: Send an email to \support@<our-domain>\; the Worker's \email()\ handler executes.
- [ ] **Standard (Forwarding)**: The handler parses the email and successfully executes \message.forward()\ to a verified destination.
- [ ] **Edge Case (Double Read)**: Verify the code buffers \message.raw\ into an ArrayBuffer before parsing to prevent stream-lock errors.
- [ ] **Edge Case (Unverified Destination)**: If \message.forward()\ targets an address that is not verified in the Cloudflare dashboard, it will throw an error. The handler must catch this and gracefully exit or log a warning.
