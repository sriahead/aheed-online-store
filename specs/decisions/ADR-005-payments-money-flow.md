---
id: adr-005-payments-money-flow
title: "ADR-005 — Payments & multi-vendor money flow"
audience: [dev]
type: adr
status: approved
version: "1.1.0"
updated: 2026-08-10
visibility: internal
summary: Stripe behind a PaymentService port, taking card payments via hosted Stripe Checkout. All vendors settle into a single platform Stripe account for now, with a Connect-ready seam so per-vendor payouts are an additive change rather than a rewrite.
tags: [adr, payments, stripe, multi-tenancy, compliance]
related: [architecture, tech-stack, adr-004-multi-tenancy, p3b-checkout-order-core]
---

# ADR-005 — Payments & multi-vendor money flow

- **Status:** **Accepted** (approved 2026-08-10). Decided during P3's proposal; recorded here because
  the choice sets a **legal posture**, not just a technical one, and was previously written down
  nowhere. Tracked by issue #96 (P3b).
- **Related:** `specs/tech-stack.md` (names the `PaymentService` port), ADR-004 (multi-tenancy),
  `specs/architecture.md`.

## Context

ADR-004 made the platform multi-tenant: two vendors (Aheed Food Centre and SriMart) already serve
different catalogues on different hosts from one codebase. P3 introduces payment. That raises a
question ADR-004 never addressed: **when a customer pays SriMart, whose bank account does the money
land in?**

`tech-stack.md` already committed to Stripe behind a `PaymentService` port with PCI scope minimised,
but said nothing about routing money between vendors, and the port itself had never been written.

## Decision

1. **Stripe, behind the `PaymentService` port** (`lib/payments.ts`). Card data never touches our
   servers in any implementation. The port exists so the provider is swappable and so P3b could ship
   and be tested with a **stub adapter** before any Stripe credential existed.

2. **Hosted Stripe Checkout, not embedded Elements.** Stripe hosts the payment page; we create a
   session server-side and confirm via a signature-verified, idempotent webhook. Rationale: Checkout
   handles **UK Strong Customer Authentication / 3-D Secure**, which is a legal requirement rather
   than a nicety, and brings Apple/Google Pay with the smallest PCI surface and least Worker code.
   **Rejected:** Payment Intents + Elements — better brand continuity (which matters more now that
   branding is per-vendor), but we would own the 3DS action flow and its failure modes. It remains a
   later swap behind this same port.

3. **A single platform Stripe account, with a Connect-ready seam.** Every vendor's payments settle
   into one Stripe account today. `CreatePaymentInput` carries `vendorId` so an adapter can route
   per vendor, and a `VendorPaymentAccount` table can be added later without reshaping the port.
   **Rejected:** full Stripe Connect now — the correct long-term marketplace model, but it needs
   Connect onboarding, KYC, payouts and per-account webhooks, and SriMart is a seeded demo vendor,
   not a real merchant. **Also rejected:** no seam at all — that would repeat exactly the
   hardcoded-single-vendor retrofit ADR-004 spent five slices undoing.

4. **Stock is decremented at order creation, not at payment success.** The order is created
   `PENDING_PAYMENT` with stock already held, so overselling is structurally impossible. Releasing
   stock when payment fails or the Checkout session expires is handled by P3c's webhook.

## Consequences

- **Positive:** one integration serves all vendors; PCI scope stays with Stripe; SCA is handled for
  us; adding a real second merchant is additive.
- **⚠️ Merchant of record.** With a single platform account, **the platform is the merchant of
  record for every vendor's sales** — SriMart's customers pay the platform, and the platform owes
  SriMart. That carries real obligations: settlement to vendors happens **off-platform** and is not
  modelled anywhere in this system; refunds and chargebacks land on the platform's account; and the
  platform's own terms, tax treatment and consumer-rights position must reflect that it is selling,
  not merely introducing. **This is acceptable only while the sole real merchant is Aheed itself.**
  Before onboarding a genuine third-party merchant, revisit this decision — the trigger is
  commercial, not technical, so it will not surface as a failing test.
- **Cost:** an abandoned checkout holds stock until P3c's release path exists. P3b must not reach
  production ahead of P3c.
- **Rule of thumb:** if taking payment for a new vendor requires anything beyond database rows and
  Stripe configuration, the seam has been violated.

## Implementation note (P3c, 2026-08-10, #99)

All four decisions above are **implemented**: `lib/payments.ts` creates hosted Checkout sessions via
raw `fetch` against the single platform account, carrying `vendorId` through `CreatePaymentInput` as
the Connect-ready seam; `/api/webhooks/stripe` verifies signatures with WebCrypto and confirms or
cancels orders idempotently; stock decremented at creation is **released** on payment failure or
session expiry, closing the gap P3b recorded. The stub adapter is kept as the fallback for
environments with no Stripe key.

One thing worth recording because it is easy to get wrong: **exactly one webhook endpoint is
registered per environment, not one per vendor host.** The same Worker serves every host and the
handler derives the vendor from the order, so per-host endpoints would only produce multiple signing
secrets that the single `STRIPE_WEBHOOK_SECRET` cannot represent.

## Deferred upgrade — Stripe Connect

When a real third-party merchant onboards: add `VendorPaymentAccount` (vendor → Stripe account id),
onboard vendors through Connect, and have the adapter set the destination/`on_behalf_of` per vendor.
Additive to the port defined here — not a rewrite. Platform fees, payout schedules and per-account
webhook routing come with it.
