---
id: p1a-auth-foundation
title: "P1a — Email/Password Auth, RBAC, Account Shell (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Plan for the first P1 slice — Better Auth email/password, RBAC, verification/reset emails, and an account shell — split from Google Sign-In, which needs OAuth credentials the human must create first.
tags: [p1, auth, better-auth, rbac]
related: [adr-002-auth-library, roadmap]
---

# P1a — Email/Password Auth, RBAC, Account Shell (plan)

**Goal:** ship the first real feature slice of P1 (`specs/roadmap.md`: "Better Auth: email/password
+ Google Sign-In, session/refresh, RBAC (Customer/Staff/Admin). Account area shell.") without being
blocked on external credentials only the human can provision.

**Trigger — why this is split from the roadmap's full P1 line:** Google Sign-In needs a Google
Cloud Console OAuth 2.0 Client ID/Secret, which can't be invented per `CLAUDE.md`'s hard stop on
credentials. Two decisions were confirmed with the user before starting:
1. **Phasing** — ship email/password now (P1a, this slice); Google Sign-In follows as its own P1b
   slice once OAuth credentials exist (tracked separately, issue #23), rather than waiting for
   credentials to build anything, or half-wiring an unusable Google provider now.
2. **Email-flow scope** — the roadmap line doesn't mention email verification or password reset,
   but the user chose to include both now rather than defer them, accepting the follow-on need for
   a Resend API key (another credential only the human can create).

**Scope (this slice):**
- Prisma: `User` (+ `role` enum for RBAC), `Session`, `Account`, `Verification` — Better Auth's
  standard relational shape. Migration generated and applied directly against Neon staging
  (`prisma migrate dev` — explicitly confirmed with the user first, since this repo has no
  separate local Postgres and running it meant real DDL against shared infrastructure).
- `lib/auth.ts` — Better Auth server instance: email/password provider, required email
  verification, password reset wired to `lib/email`. `role` via `additionalFields` with
  `input: false` so a signup request can never set its own role.
- `lib/auth-rbac.ts` — `requireRole()`, returning 401/403 rather than ever silently passing.
- `lib/email.ts` — new `EmailService` port + Resend adapter (plain `fetch`, no SDK).
- `app/api/auth/[...all]/route.ts` + UI (`/login`, `/register`, `/forgot-password`,
  `/reset-password`, a protected `/account` shell) under a new `app/(storefront)/` route group.

**Deliberately excluded:**
- Google Sign-In entirely — not even stubbed. See P1b (issue #23) once OAuth credentials exist.
- Profile editing on `/account` — "shell" scope only, per the roadmap's own wording.

**Prerequisite fix, found stress-testing against the real Workers runtime** (`npm run preview`, not
`next dev` — the latter can't even load `@prisma/client/wasm`, so it never exercised this path for
real): `lib/db.ts`'s `getPrisma()` cached a Prisma/Neon client across requests, which Cloudflare
Workers forbids — rapid sequential requests failed ~1-in-3 times with `"Cannot perform I/O on
behalf of a different request."` Pre-existing since M0 (affects `/api/health` too). Fixed by
constructing fresh per call instead of caching; `CLAUDE.md`'s Database section updated since its
own guidance ("lazy singleton") was actually the bug.

**Open items carried forward:**
- `RESEND_API_KEY` — verification/reset emails currently log-and-skip until the human creates a
  Resend account/key.
- `BETTER_AUTH_SECRET` + `RESEND_API_KEY` need `wrangler secret put` on staging/production before
  this is live end-to-end.
- P1b (Google Sign-In) once OAuth credentials exist — issue #23.
