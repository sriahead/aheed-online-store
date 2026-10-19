---
id: platform-admin-guide
title: "Platform & Technical Admin Guide"
audience: [platform-admin]
type: guide
status: approved
version: "1.2.0"
updated: "2026-10-19"
visibility: internal
summary: "A guide for Platform Administrators managing the multi-tenant infrastructure, onboarding new vendors, and configuring global platform settings."
tags: ["admin", "platform", "technical", "multi-tenancy"]
---

# Platform & Technical Admin Guide

Welcome to the **Platform Admin** documentation. Unlike Store Admins (who manage a single vendor's shop), Platform Admins are the technical operators of the entire multi-tenant platform.

## Global Roles vs Vendor Roles
It is critical to understand the distinction between the two types of administrative roles in the system:
- **Global Platform `ADMIN`**: This role transcends all vendors. It grants access to system-wide configurations, vendor onboarding, and global user management.
- **Vendor-Specific `ADMIN`**: This is a Store Admin. Their administrative powers are strictly scoped to a single vendor (e.g., managing the catalogue or delivery rules for "Aheed Food Centre" only). 

## Managing Vendors (Tenants)
The platform is designed to host multiple independent store fronts (vendors) from a single database.
- **Onboarding New Vendors:** When a new vendor joins the platform, the Platform Admin creates the new Vendor record.
- **Host Resolution:** Each vendor can be mapped to specific hostnames (e.g., `srimart.nocaped.com`). Platform Admins configure these routing rules so that incoming traffic is automatically served the correct vendor's branding, catalogue, and configuration.
- **Vendor Status:** You have the authority to suspend a vendor (`VendorStatus: SUSPENDED`), immediately disabling their storefront and checkout capabilities.

## Global Infrastructure & Fallbacks
- **Secret Management:** Platform Admins are responsible for managing environment secrets via Cloudflare Workers and GitHub environments. (See `docs/developer-portal/env-setup.md` for the technical runbook).
- **Global Feature Flags:** Managing platform-wide feature rollouts (like activating a new payment gateway provider) is done at the platform level.
- **Workers AI budgets and plan (#1028, #1029):** Every store's AI features draw on one Cloudflare account. Each store has a daily neuron budget (default 3,000; `0` switches its AI off). To change it, open the store's **AI Allowance** page at `/staff/ai-usage` on that store's host while signed in as a platform admin, enter the new figure (a whole number up to 1,000,000) and **Save budget**. Store admins can read the page but cannot change the budget, because it caps spend the platform pays for. The `WORKERS_AI_PLAN` setting (`free` or `paid`, Free when unset or misspelled) must match the Cloudflare dashboard's **Workers & Pages → Plans**. On `free`, AI pauses for every store once all stores together use the shared 10,000-neuron daily allowance; on `paid` that shared cap is lifted, usage above it is billed at $0.011 per 1,000 neurons, and the AI Allowance page shows platform admins an estimate of today's charge. The shared count covers only this platform's own usage records, so other usage on the same Cloudflare account is not included. Setting the value is a Worker environment change; see `docs/developer-portal/env-setup.md`.

## Store Impersonation (Dev/Support)
For support and debugging, Platform Admins can use the View Switcher to impersonate specific vendors and view the platform exactly as a Store Admin or Staff member of that vendor would see it.

## Error events — `/staff/errors`

**Purpose:** The most recent server-side errors across the whole platform, so a fault can be seen
without opening the hosting provider's logs.

**Who can access:** Platform admins only

**What you can do:** Read the 50 most recent errors, newest first. The page has no controls and
nothing to edit.

**Typical workflow:** A vendor reports that something failed. Open this page and look for an error
whose time and path match what they describe, then use the message and digest to investigate.

**Important fields and filters:** Each row carries when it happened, the HTTP method and path, which
router raised it, the error type and message, and a digest that groups repeats of the same fault.
There is no filter or search — the list is the 50 newest, and nothing else.

**Common mistakes and limitations:** **This page is deliberately closed to store admins, even though
they hold an admin role.** An error message or path can reveal internal implementation details that a
vendor-scoped account has no reason to see, so the page refuses anyone who is not a platform admin.
It is also **not** a complete error record: it captures server-side errors that were actually thrown,
so a request that failed quietly by returning an error response without raising anything will not
appear. It is independent of the hosting provider's own logs and does not replace them. Rows are not
scoped to one vendor, which is the other reason store admins cannot open it.

**What happens after changes are saved:** Nothing is editable. New errors appear as they occur;
reload to see them.

