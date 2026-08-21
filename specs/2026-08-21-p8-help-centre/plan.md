---
id: p8-help-centre
title: "P8.1 Help Centre (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-21
visibility: internal
summary: A role-aware unified Help Centre at `/help` replacing the dead link in the global header, resolving Issue #318.
tags: [ui, p8]
related: [sdd-workflow]
---

# P8.1 Unified Role-Aware Help Centre (plan)

**Goal:** Replace the dead 'Help Guide' link in the global storefront header with a unified, role-aware `/help` page that provides FAQs for shoppers and navigational guidance to the Runbook for staff/admin users. 

**Scope (this slice):**
- Updates `components/layout/Header.tsx` to point the 'Help Guide' link to `/help`.
- Creates `app/(storefront)/help/page.tsx` as a Server Component.
- Implements static accordion-style FAQs for shoppers covering delivery zones, loyalty points, discount codes, and data privacy.
- Conditionally renders an "Internal Staff Resources" section containing a link to `/staff/runbook` and View Switcher instructions, strictly gated by `requireVendorRole("STAFF", "ADMIN")`.

**Deliberately excluded:**
- We are not moving the actual `Store Admin & Shop-Floor Operational Runbook` from `/staff/runbook`. The `/help` page acts as a signpost to it, not a replacement.
- We are not implementing dynamic/database-backed help articles. The content will be hardcoded (static) for the MVP.

**Open items carried forward:**
- None.
