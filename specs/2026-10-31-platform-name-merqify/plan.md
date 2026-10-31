---
id: p1371-platform-name-merqify-plan
title: "Platform name Merqify by default; Third-party credits (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-31
visibility: internal
summary: "#1371: the footer's Powered by line defaults to Merqify and its tagline in every environment; the Icon credits link and page are relabelled Third-party credits."
tags: [branding, footer, platform, merqify, credits]
related: [design-system]
---

# Platform name Merqify by default; Third-party credits (plan)

**Goal:** the owner asked (2026-10-31) for the platform name to read **Merqify**, with the tagline
**"Your Merchandise, Digitised Quickly"**, on every store by default, and for "Icon credits" to
become a third-party libraries wording.

## Scope

- `lib/config.ts`: `PLATFORM_NAME` falls back to `Merqify`, and a new `PLATFORM_TAGLINE` to the
  tagline, when unset or blank. This reverses `#1055`'s "unset hides the line": Merqify is the
  operator, not a vendor, so naming it is not vendor copy. Local dev shows it too.
- `wrangler.toml`: staging and production `[vars]` set both values (replacing `[PLATFORM NAME]`).
- Footer: "Powered by Merqify · Your Merchandise, Digitised Quickly"; link "Third-party credits".
- Credits page: breadcrumb, heading and title "Third-Party Credits & Licences".

## Deliberately excluded

- The `/icon-credits` URL stays, so existing links and bookmarks keep working.
- The page's `vendorName` fallback and the email "from" name are untouched.
