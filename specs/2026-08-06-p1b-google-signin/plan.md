---
id: p1b-google-signin
title: "P1b — Google Sign-In (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Plan for adding Google as a Better Auth social provider alongside P1a's email/password flow, now that the human has provisioned the OAuth client and its secrets on Cloudflare.
tags: [p1, auth, better-auth, oauth, google]
related: [adr-002-auth-library, roadmap, p1a-auth-foundation]
---

# P1b — Google Sign-In (plan)

**Goal:** close out P1's auth line (`specs/roadmap.md`: "Better Auth: email/password + Google
Sign-In...") by adding Google as a second sign-in method, without touching the email/password
flow P1a already shipped.

**Trigger — why this waited:** P1a (issue #23, PR #24) deliberately shipped without Google
Sign-In because it needs a Google Cloud Console OAuth 2.0 Client ID/Secret, which `CLAUDE.md`'s
hard stop forbids inventing. That credential now exists — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
are confirmed present on both `staging` and `production` via `wrangler secret list --env <env>`
(issue #28).

**Base branch:** `feature/p1-auth-foundation` (PR #24), not `staging` — this slice's `lib/auth.ts`/
`lib/config.ts` changes build directly on P1a's, which isn't merged yet. Rebases onto `staging`
alongside P1a when that PR merges.

**Scope (this slice):**
- `lib/auth.ts` — add a `socialProviders.google` block to the existing `betterAuth()` config,
  alongside (not replacing) `emailAndPassword`. The conditional (both env vars present, or omit
  the block) is pulled into a small exported pure function, `buildSocialProviders(env)`, rather
  than inlined in `getAuth()` — `getAuth()` itself has no unit tests today (it depends on
  `getPrisma()`, untestable without a real DB, same reason `tests/` has no `auth.test.ts`), so the
  conditional logic needs to be extractable to be verifiable at all without an integration test.
- `lib/config.ts` — extend the existing zod `schema` with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
  both optional (same optional-credential pattern as `RESEND_API_KEY`). No new schema split needed
  — unlike `lib/email.ts`, `lib/auth.ts` already depends on the full `getEnv()`, so there's no CI
  test-env mismatch to avoid.
- `features/auth/components/GoogleSignInButton.tsx` — one shared client component (Better Auth's
  social sign-in creates an account on first use, so login and register need the same control, not
  two). Calls `signIn.social({ provider: "google", callbackURL: "/account" })` via the existing
  `authClient` export in `features/auth/api-client.ts` — no new client instance.
- `/login` and `/register` pages become the ones that know whether Google is configured: each
  reads `getEnv()` server-side and passes `googleEnabled={Boolean(clientId && clientSecret)}` down
  to `GoogleSignInButton`, which renders nothing when false. Keeps the "is it configured" check
  server-side (the client never sees whether a secret exists, only a boolean), and means the button
  correctly disappears in any environment that hasn't set the credential (e.g. a fresh local clone).

**Deliberately excluded:**
- No new Prisma migration — Better Auth's `Account` table (already in P1a's schema) already models
  provider-linked identities generically; a Google-linked account is just another `Account` row.
- No changes to the email/password flow, `LoginForm`/`RegisterForm`'s existing fields, or RBAC
  (`lib/auth-rbac.ts`) — a Google sign-in gets `role: CUSTOMER` the same way email/password
  sign-up does, via the same Prisma default.
- No account-linking UI (e.g. "connect Google to an existing email/password account") — out of
  roadmap scope for P1, not mentioned in `specs/roadmap.md`'s P1 line.
- No changes to the OAuth consent screen or redirect URIs themselves — already configured by the
  human against this repo's actual staging/production domains (issue #28).

**Open items carried forward:** none — the one external dependency this slice had (the OAuth
client) is already resolved.
