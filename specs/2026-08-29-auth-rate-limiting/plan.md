---
id: p9-1-auth-rate-limiting
title: "P9.1: Production Authentication Rate Limiting"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-29
visibility: internal
summary: Introduce a Workers-compatible rate limiter for authentication routes to prevent credential stuffing and abuse, resolving #431.
tags: [security, rate-limiting, authentication, p9.1]
---

# P9.1: Production Authentication Rate Limiting (plan)

**Goal:** Ensure repeated credential and authentication abuse is bounded in production across Cloudflare Workers isolates, closing #431, without redesigning the authentication architecture or introducing new dependencies.

**Scope (this slice):**
- Add `AuthenticationAttempt` model to `prisma/schema.prisma`. It mirrors `OrderLookupAttempt`'s structure (`vendorId`, `ipHash`, `createdAt`) to reuse the known Postgres-backed counter pattern safely.
- Add `lib/repositories/auth-rate-limit.ts` containing the check logic `checkAuthRateLimit(prisma, vendorId, ip)`, enforcing a maximum of 5 attempts per IP per minute.
- Add `onRequest` hook logic to Better Auth in `lib/auth.ts` to inspect requests for sensitive paths (`/sign-in`, `/sign-up`, `/forget-password`, `/reset-password`, `/send-verification-email`) and execute the rate limit. 
- A rate limit rejection will short-circuit with a `429 Too Many Requests` response.

**Deliberately excluded:**
- Modifying Better Auth's internals or fixing its default rate-limiter `$transaction` bug. We are deliberately bypassing its limiter in favor of the proven custom pattern.
- Rate limiting non-sensitive requests (e.g. session fetching), which should remain unrestricted to avoid breaking valid user journeys.

**Open items carried forward:** None.
