---
id: 2026-11-14-configurable-branding-plan
title: "Configurable platform branding terminology in Client Setup (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
summary: "Make platform branding terminology (defaulting to Levelled Up by Merqify) configurable across the platform via Platform Admin Client Setup, reflecting dynamically across Stripe Checkout, storefront footer, emails, and credits pages."
tags: [branding, client-setup, platform-admin, stripe, payments, footer]
related: [architecture]
---

# Configurable platform branding terminology in Client Setup (plan)

## Objective

Introduce configurable platform branding terminology (defaulting to `"Levelled Up by Merqify"`) managed centrally from the Platform Admin Client Setup interface (`/staff/platform/client-setup`). This terminology dynamically propagates across all platform touchpoints where the Merqify platform brand is reflected, including Stripe Checkout line items, storefront footers, transactional email footers, and third-party credits.

## Scope

1. **Database & Defaults**:
   - Add `platformBrandingTerminology String?` to `VendorConfig` via an additive migration.
   - Define `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY = "Levelled Up by Merqify"` in `lib/platform-defaults.ts`.
   - When unset or null, all consumers fall back to `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY`.
2. **Platform Admin Client Setup**:
   - Add a Branding & Ecosystem Identity card to `/staff/platform/client-setup`.
   - Allow platform admins to set or update the terminology per store or apply across all client stores in one action.
3. **Consumers**:
   - **Stripe Checkout**: Line item description uses the configured branding terminology (`"Levelled Up by Merqify"`).
   - **Storefront Footer**: Platform attribution line displays the branding terminology linked to `https://merqify.com`.
   - **Transactional Email Layout**: Footer attribution renders the branding terminology with its link.
   - **Icon & Third-Party Credits**: Generated icons attribution references the branding terminology.
   - **Storefront Terms**: Platform technology attribution references the branding terminology.
