---
id: glossary-and-release-notes
title: "Platform Glossary & Release Notes"
audience: [store-admin, staff, platform-admin]
type: doc
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Platform terminology definitions, monetary conventions (integer pence), status indicator meanings, and recent feature release milestones."
tags: [glossary, release-notes, changelog, terminology]
related: [getting-started-onboarding, client-user-journeys]
---

# Platform Glossary & Release Notes

This reference explains domain terminology, currency handling conventions, and feature release notes.

---

## 1. Domain Glossary

| Term | Definition |
| :--- | :--- |
| **Integer Pence** | All monetary amounts in the database and code are stored as integer pence (e.g. £12.50 = `1250`). This prevents floating-point rounding errors. |
| **Tenant / Vendor** | An independent commercial shop operating on the platform with its own isolated catalogue, orders, staff, branding, and delivery rules. |
| **Outcode Prefix** | The first part of a UK postcode (e.g., `E1`, `SW1A`, `RG1`) used to define delivery boundaries in `/staff/delivery-areas`. |
| **Guest Token** | An opaque, cryptographically secure cookie token assigned to anonymous shoppers to maintain basket items prior to account sign-in. |
| **Workers AI Neurons** | The computational unit of Cloudflare Workers AI. Daily store usage is tracked and capped in `/staff/ai-usage`. |
| **Canonical Host** | The official primary domain designated for a store's public web traffic (e.g. `srimart.nocaped.com`). |

---

## 2. Status Indicators

Throughout the documentation and administrative panels, features carry status tags:
- **`Available`**: Fully deployed, verified in tests, and ready for operational use.
- **`Planned`**: Documented roadmap item or external dependency pending owner action (e.g., live Stripe merchant credentials).
- **`Updated`**: Feature or procedure that received recent enhancements or changes.

---

## 3. Release Milestones Summary

### Phase 10: Post-Launch Hardening & Onboarding Governance (Current)
- Introduced executive multi-tenant onboarding roll-up at `/staff/platform/onboarding`.
- Added vendor-scoped onboarding readiness audit at `/staff/onboarding`.
- Standardized navigation hierarchy across PanelNav and Overview Hub (`#1177`).
- Implemented comprehensive Client Help & Documentation Centre inside KMS.

### Phases 6–9: Operations & Storefront Enhancements
- Added bulk spreadsheet inventory importer (`/staff/products/import`).
- Integrated dynamic vendor FAQs (`/staff/faqs`) and storefront Help Centre (`/help`).
- Implemented Workers AI daily budget governance (`/staff/ai-usage`).
- Expanded delivery area configuration with postcode outcode prefixes and per-zone fees.
