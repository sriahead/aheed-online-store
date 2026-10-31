---
id: integrations-guide
title: "Platform Integrations & Technical Seams Guide"
audience: [platform-admin, store-admin]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Setup instructions, architecture seams, configuration, and troubleshooting for Stripe, Cloudflare Workers AI, Better Auth, and WhatsApp support."
tags: [integrations, stripe, cloudflare, workers-ai, better-auth, whatsapp]
related: [platform-admin-guide, store-admin-tabs-guide]
---

# Platform Integrations & Technical Seams Guide

The platform integrates with external infrastructure through environment-configured seams, ensuring vendor agnosticism and cloud portability.

---

## 1. Stripe Payments Integration

- **Architecture:** Payments are handled via Stripe Elements and Stripe Checkout. Card numbers and sensitive payment credentials never touch application servers.
- **Webhook Processing:** Asynchronous webhook events (`payment_intent.succeeded`, `payment_intent.payment_failed`) update order payment states in PostgreSQL.
- **Roadblock Status (#113):**
  - *Current State:* Verified and operational in test mode using Stripe test credentials.
  - *Planned:* Live production trading keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) require owner account configuration before commercial transactions can be processed.

---

## 2. Cloudflare Workers AI & Neuron Budgets (`/staff/ai-usage`)

- **Features Powered by AI:**
  - Net content pack size extraction and product normalization (`/staff/net-content`).
  - Search synonym suggestions (`/staff/search-synonyms`).
  - Storefront customer help assistant (`/staff/assistant`).
- **Quota Governance:**
  - Each store is assigned a daily neuron allowance (default: 3,000 neurons). Setting the allowance to `0` immediately disables AI calls for that tenant.
  - Platform admins can adjust tenant quotas up to 1,000,000 neurons per day.
  - The shared Cloudflare Workers AI plan (`free` vs `paid`) governs overall account billing ($0.011 per 1,000 neurons on paid plans).

---

## 3. WhatsApp Customer Support Contact

- **Configuration:** Store administrators provide a WhatsApp business number in `/staff/storefront`.
- **Storefront Floating Contact:** When configured, a floating WhatsApp button appears on the customer storefront and on the `/help` page.
- **Fallback Behaviour:** If no WhatsApp number is configured, the floating contact widget is completely hidden.

---

## 4. Identity & Authentication (Better Auth)

- **Architecture:** Self-hosted relational authentication via Better Auth (`prisma/schema.prisma`).
- **Session Tokens:** Bearer and cookie-based session tokens with automatic expiry and host-scoped cookie isolation.
- **Single Sign-On (SSO):** Shared authentication across preview and production hostnames under the apex domain.
