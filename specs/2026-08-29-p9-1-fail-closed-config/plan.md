---
id: p9-1-fail-closed-config
title: "P9.1: Fail Closed on Missing Production Config"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-29
visibility: internal
summary: "Enforce presence of Stripe and Resend secrets in production via Zod refinement, preventing silent degradation to stub/logging providers."
tags: [config, payments, security, p9.1]
---

# P9.1: Fail Closed on Missing Production Config

**Goal:** Ensure the application fails closed (refuses to start or throws a validation error) if critical production secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) are missing, rather than gracefully degrading to a stub.

**Scope (this slice):**
- Update `lib/config.ts` to attach `.superRefine()` to `schema` and `emailSchema`.
- Assert that when `process.env.NODE_ENV === "production"`, the required keys for Stripe and Resend are present.
- Add `lib/config.test.ts` to verify the environment validation behaves differently between production and development.
- This fulfills the security requirement of issue #430 while preserving the ability of local development and CI to run without these secrets.

**Deliberately excluded:**
- Modification to `lib/payments.ts` or `lib/email.ts` implementation itself; the degradation logic remains untouched since it works perfectly for non-production environments.
- Enforcing other optional keys (e.g., `S3_ENDPOINT`) if they are legitimately allowed to be optional or have existing protections.
