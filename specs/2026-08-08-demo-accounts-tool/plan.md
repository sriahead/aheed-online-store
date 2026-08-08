---
id: demo-accounts-tool
title: "Demo-accounts add/remove tool (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: A standalone, reusable script to add or remove the platform's demo login accounts on demand against any environment, separate from prisma/seed.ts, so demo accounts survive DB resets and can be managed independently.
tags: [demo-accounts, auth, tooling, ops, better-auth]
related: [adr-002-auth-library, env-setup, neon-db-separation]
---

# Demo-accounts add/remove tool (plan)

Narrative for issue #57. `requirements.md` holds the checkable criteria.

**Goal:** make the platform's demo login accounts **reproducible and reversible** via a dedicated
tool, so they can be (re)provisioned or removed on demand in any environment — and, per the standing
directive, kept present in **both production and staging until all phases are complete**. Today these
accounts exist only because they were hand-created in the old shared DB; nothing in code recreates
them, so any DB reset silently loses them (which would break the just-shipped `/dev` feature and the
directive).

**Scope (this slice):**
- A tsx script `scripts/demo-accounts.ts`, invoked as `npm run demo:accounts -- add` /
  `npm run demo:accounts -- remove`. It targets whichever environment's `DIRECT_URL` is set in the
  process env — same convention as `prisma/seed.ts` — so one tool serves local, staging, and prod.
- Manages a fixed, code-defined roster: `demo-admin@example.com` (ADMIN),
  `demo-customer@example.com` (CUSTOMER), and `demo-staff@example.com` (STAFF) for full RBAC coverage.
- Accounts are created **through Better Auth** (`getAuth()` / `auth.api.signUpEmail`) so the password
  is hashed into an `Account` row and the account can genuinely sign in — not a raw Prisma insert
  that would produce an unloggable user.
- The password is read from `DEMO_ACCOUNT_PASSWORD` (env), never hardcoded or committed.
- Two Better-Auth constraints from `lib/auth.ts` are handled explicitly:
  - `role` is `input: false` → the tool sets ADMIN/STAFF via a **Prisma `user.update` after signup**,
    since signup can't assign a role (defaults to CUSTOMER).
  - `requireEmailVerification: true` → the tool sets `emailVerified: true` directly via Prisma and
    **does not trigger real verification emails** to the `@example.com` addresses.
- `add` is **idempotent** (an already-present account is reconciled to the right role/verified state,
  not errored); `remove` deletes the demo users (their `Session`/`Account` rows cascade).

**Deliberately excluded:**
- Wiring the tool into any CI workflow or `deploy-*.yml` — it is run **manually, on demand**. Folding
  it into automated deploys is out of scope (and would re-create accounts on every deploy).
- Adding demo accounts to `prisma/seed.ts` — the whole point is to keep them **separate** from the
  catalogue seed so they can be managed independently.
- Any change to the auth model, roles, or `lib/auth.ts` behaviour — the tool only *uses* Better Auth.
- Removing demo accounts anywhere — they stay in prod + staging until all phases complete
  (`remove` exists for future use, not to be run now).

**Open items carried forward:**
- Running the tool needs each environment's `DIRECT_URL` (from `secrets/*.vars`) and a chosen
  `DEMO_ACCOUNT_PASSWORD`; those are supplied at run time, not committed.
- This tool unblocks #56 (staging Neon split): after the staging cutover, `add` restores the demo
  accounts on the fresh staging project.
- **Implementation boundary for build:** the tool runs in **Node** (via tsx, like `prisma/seed.ts`),
  not workerd — so it must use a Node-appropriate Prisma client (bare `@prisma/client`, as `seed.ts`
  does), **not** `lib/db.ts`'s `@prisma/client/wasm` import, and therefore should not reuse
  `getAuth()` directly (which is wired for the Workers runtime). How it produces a Better-Auth-valid
  password credential — the official sign-up API vs Better Auth's exposed password hasher + a direct
  `Account` insert — is a build decision, constrained by R4 (accounts can actually sign in) and R7
  (no emails sent). Confirm the chosen path with `npm run preview`/staging, not `npm run dev`.
