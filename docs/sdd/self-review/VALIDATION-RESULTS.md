---
id: self-review-validation-results
title: Phase 6.5 Validation & Test Results
audience: [dev, staff]
type: doc
status: approved
version: "1.1.0"
updated: 2026-08-17
visibility: internal
summary: Verification log of test runs, build checks, and validation evidence for Phase 6.5 audit loop.
tags: [self-review, validation, tests]
---

# Phase 6.5 — Validation Results Log

## Summary of Automated Checks
- `npx vitest run`: **PASSED** (30 test files, 347 tests passed)
- `npm run kms:validate`: **PASSED** (54 valid KMS artifacts, 0 failing)
- `npm run sdd:audit`: **PASSED** (all shipped slices documented)
- `npm run kms:build-index`: **PASSED** (`ARTIFACT_INDEX.md` written with 54 artifacts)
- `npm run kms:assemble:internal`: **PASSED** (54 docs assembled to `kms/site-internal/content`)

---

## Log of Audit Steps & Fixes

### 1. GAP-001 (High - Tenancy / Host Resolution)
- **Problem:** `lib/tenant.ts` used `.split(":")[0]`, truncating bracketed IPv6 literal hosts (`[::1]:8787` -> `[`).
- **Fix:** Swapped to `splitHostPort(rawHost).hostname` from `lib/auth-origin.ts`.
- **Validation:** Unit tests passing cleanly (`tests/auth-origin.test.ts`).

### 2. GAP-002 (High - Security & Auth / Local Preview Origin Mismatch)
- **Problem:** Local preview sign-ins (`http://localhost:8787`) failed with 403 CSRF origin mismatch because port was stripped and `wrangler dev` default `x-forwarded-proto` was trusted over loopback HTTP.
- **Fix:** Exported `splitHostPort` and `inferProto` in `lib/auth-origin.ts`, preserving non-default ports and inferring loopback `http`.
- **Validation:** 26 dedicated unit tests added and passing in `tests/auth-origin.test.ts`.
- **Live validation (added 2026-08-17, #192):** the unit tests above were the *only* evidence
  recorded here, and they exercise the helpers rather than the reported failure. The symptom itself
  was re-fired on 2026-08-17 against `npm run preview`: headless, `Origin: http://localhost:8787`
  returns `401 INVALID_EMAIL_OR_PASSWORD` (origin accepted) while `Origin: http://localhost` returns
  `403 INVALID_ORIGIN` (correctly refused); from Chrome, the real login form's
  `POST /api/auth/sign-in/email` returned `401`. Issue #176 closed on that evidence.

### 3. GAP-003 (Medium - Frontend / UI Missing 404 Page)
- **Problem:** Missing custom 404 error page.
- **Fix:** Created `app/not-found.tsx` with design system tokens and store return link.
- **Validation:** Typecheck and route rendering verified.

### 4. GAP-004 (Low - KMS Docs Refresh)
- **Problem:** KMS artifact index required rebuild.
- **Fix:** Rebuilt `ARTIFACT_INDEX.md` and reassembled internal docs site.
- **Validation:** `npm run kms:validate` passing cleanly.
