---
id: platform-admin-guide
title: "Platform & Technical Admin Guide"
audience: [platform-admin]
type: guide
status: approved
version: "1.0.0"
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

## Store Impersonation (Dev/Support)
For support and debugging, Platform Admins can use the View Switcher to impersonate specific vendors and view the platform exactly as a Store Admin or Staff member of that vendor would see it.
