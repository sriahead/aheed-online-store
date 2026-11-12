---
id: 2026-11-12-staging-allowlist-client-setup-plan
title: "Staging email allowlist also accepts Client Setup forward-to mailboxes and the admin's test email (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "In allowlist mode, a recipient not on EMAIL_ALLOWED_RECIPIENTS is also allowed when it is a saved receiving address's forward-to mailbox, or when the message is Client Setup's test email to the signed-in platform admin. Production is unchanged; no migration."
tags: [email, client-setup, staging]
related: [2026-11-10-pr1481-enquiries-team-access-retro-plan]
---

# Staging allowlist: Client Setup addresses (plan)

Issue #1546. Owner: "when other is selected via platform admin can you auto include this into
EMAIL_ALLOWED_RECIPIENTS" (2026-11-12, with a screenshot of the test email skipped by the allowlist).
Approved as proposed: "go ahead".

## Why not write the secret

`EMAIL_ALLOWED_RECIPIENTS` is a Worker secret. A Worker cannot change its own secrets at runtime.
The Cloudflare API could, but only with a token that can edit Workers, and each change redeploys.
So the policy also reads what a platform admin has already saved.

## Design

- **The rule stays pure.** `lib/email/policy.ts` `isRecipientAllowed` is unchanged. In
  `lib/email.ts`, a recipient refused by the secret gets two further chances, in allowlist mode only:
  1. **Test email.** `OutgoingEmail.recipientIsSignedInAdmin` is true. Only
     `sendClientSetupTestEmail` sets it, which a guard test checks. The action passes the signed-in
     admin's own address, and the form has no recipient field.
  2. **Forward-to mailbox.** `isRegisteredForwardTo(prisma, to)` (a new repository function) finds a
     `VendorInboundAddress` whose `forwardTo` equals the address. `forwardTo` is stored lower-case.
- **Fails closed.** If the lookup throws, the mail stays skipped and the error is logged.
- **No extra work in production.** Open mode returns before any lookup.
- **Copy.** On staging, the Receiving addresses card says that forward-to mailboxes receive staging
  mail without the secret.

## Files

- `lib/email/types.ts`, `lib/email.ts`
- `lib/repositories/inbound-address.ts`, plus its scoping allowlist entry
- `lib/client-setup-service.ts`
- `components/staff/client-setup/EmailSetupForms.tsx`
- `tests/email-allowlist-client-setup.test.ts`
- `docs/developer-portal/env-setup.md`, the platform operator guide, `CHANGELOG.md`, `specs/roadmap.md`
