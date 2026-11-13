---
id: 2026-11-13-existing-account-signup-plan
title: "Sign-up with an existing email: tell the account holder by email (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-13
visibility: internal
summary: "Wires Better Auth's onExistingUserSignUp hook so a sign-up with an already-registered email sends that inbox a 'you already have an account' email (sign in, forgot password or Google), while the screen and HTTP response stay neutral to prevent account enumeration."
tags: [auth, email, sign-up, enumeration]
related: [2026-11-13-notification-gaps-plan]
---

# Sign-up with an existing email (plan)

Issue #1558. Requirements: `requirements.md`.

## Why this approach

Better Auth already returns a generic success for a duplicate email when
`requireEmailVerification` is on, so the screen leaks nothing. What was missing is the message to the
inbox owner. Better Auth 1.x exposes `emailAndPassword.onExistingUserSignUp({ user }, request)` on
exactly that branch, after it hashes the submitted password to equalise timing. Wiring it needs no
route, no migration and no change to the response.

Rejected: saying "account already exists" on screen (enumeration); a Telegram alert for duplicates
(noise).

## Changes

1. `lib/notifications/existing-account.ts` (pure) — `existingAccountEmail({ storeName, baseUrl,
   providers })` returns `{ subject, html }` per R2–R4. Uses `escapeHtml`.
2. `lib/existing-account-signup-service.ts` — `notifyExistingAccountSignUp(user, baseUrl, deps)`,
   injectable (`loadProviders`, `resolveSender`, `send`, `log`); never rejects (R5). The live binding
   uses `getAccountProviders(getPrisma(), user.id)` from `lib/repositories/data-rights.ts`,
   `getCurrentVendorSender()` and `getEmailService().send`.
3. `lib/auth.ts` — `onExistingUserSignUp: ({ user }) => notifyExistingAccountSignUp(...)` with the
   request's resolved `baseURL`.
4. `features/auth/components/RegisterForm.tsx` — neutral success copy (R6).
5. Tests: `tests/existing-account-signup.test.ts`.
6. Docs: shopper guide (what happens if you register twice), store admin guide's notification matrix
   and `docs/developer-portal/notification-matrix.md` (new row), CHANGELOG.

## Risks

- Timing: the email is sent inside the request (`runInBackgroundOrAwait` awaits unless a background
  runner is configured), so a duplicate sign-up takes one email-send longer than a new one, which
  also sends an email (verification). Comparable; accepted.
- Abuse (sending a victim this email repeatedly) is bounded by the existing auth rate limit, same as
  forgot-password.
