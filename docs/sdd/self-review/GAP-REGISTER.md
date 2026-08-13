---
id: gap-register
title: Phase 6.5 Gap Register
audience: [dev, staff]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-13
visibility: internal
summary: Master tracking register for all identified, fixed, deferred, or blocked gaps during Phase 6.5 audit loop.
tags: [gap-register, self-review, audit, hardening]
---

# Phase 6.5 — Master Gap Register

| ID | Area | Severity | Finding | Evidence | Recommendation | Auto-fix? | Status |
|---|---|---|---|---|---|---|---|
| GAP-001 | Security / Tenancy | High | `getCurrentVendorIdOrNull()` truncates IPv6 loopback hosts (`[::1]:8787` -> `[`) | `lib/tenant.ts` line 15 `.split(":")[0]` | Parse hostname using `splitHostPort(host).hostname` | Yes | Fixed |
| GAP-002 | Security / Auth | High | Local preview auth requests (`http://localhost:8787`) 403 on sign-in due to port stripping & wrangler dev x-forwarded-proto default (#176) | `lib/auth-origin.ts` line 64 and issue #176 | Implement `splitHostPort` and `inferProto` in `lib/auth-origin.ts` with unit tests | Yes | Fixed |
| GAP-003 | Frontend / UI | Medium | Unstyled fallback 404 page rendered for missing routes | Absence of `app/not-found.tsx` | Add vendor-branded `app/not-found.tsx` component | Yes | Fixed |
| GAP-004 | KMS Docs | Low | `ARTIFACT_INDEX.md` front-matter timestamp needs refresh | `npm run kms:build-index` | Rebuild KMS index and reassemble docs | Yes | Fixed |
