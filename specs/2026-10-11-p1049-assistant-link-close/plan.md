---
id: p1049-assistant-link-close
title: "Help assistant links, WhatsApp via the assistant, Help Centre contact card (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-11
visibility: internal
summary: Closes the help assistant when an in-panel link is followed, routes WhatsApp through the assistant while it is on, and adds a Help Centre card that opens the assistant or falls back to WhatsApp.
tags: [help-centre, storefront, multi-vendor]
related: [app-conventions]
---

# Plan — #1049

Add `onClick={onClose}` to the two `<Link>`s in `HelpAssistant.tsx`. Closing via `onClose` (rather
than a `usePathname` effect in `FloatingContact`) keeps the fix local, also covers a link to the
current page (no pathname change), and reuses the existing focus-return path. Add one test to the
existing panel test file.
