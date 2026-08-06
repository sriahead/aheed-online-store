# P1a — Email/password auth, RBAC, account shell (requirements / acceptance criteria)

First P1 slice per `specs/roadmap.md`. Split from the roadmap's full P1 line ("email/password +
Google Sign-In...") because Google Sign-In needs a Google Cloud Console OAuth client the human must
create first (see issue #23) — that becomes its own P1b slice. This slice: email/password only,
session/refresh, RBAC, email verification + password reset, account area shell.

R1. `prisma/schema.prisma` gains Better Auth's standard relational models — `User` (with a `role`
    enum: `CUSTOMER` | `STAFF` | `ADMIN`, `@default(CUSTOMER)`), `Session`, `Account`,
    `Verification` — explicit foreign keys, no `Json` columns, provider-neutral types. Generated
    via `prisma migrate dev` against the `.env`-configured database (the real Neon staging
    instance — confirmed with the user, since this repo has no separate local Postgres) and
    committed under `prisma/migrations/`. This applies the migration to staging immediately;
    CI's `prisma migrate deploy` step will no-op on it when the PR merges, since Prisma tracks
    applied migrations and `deploy` only runs pending ones.
R2. `lib/auth/index.ts` exports a configured Better Auth instance: Prisma adapter, email/password
    provider (with email verification required before first sign-in, per the P1a scope decision to
    include verification now), password-reset flow wired to send via `lib/email`, `baseURL`
    sourced from `lib/config` (per-environment, not hardcoded) so cookies/redirects work correctly
    on staging vs production domains. No Google/OAuth provider configured in this slice.
R3. `lib/auth/rbac.ts` exports a helper that reads the current session's `role` and can gate a
    route/Server Action to one or more of `CUSTOMER`/`STAFF`/`ADMIN`, returning a clear
    unauthorized result (not a silent pass-through) when the role doesn't match.
R4. `lib/email/index.ts` exports an `EmailService` port (interface) and a Resend adapter
    implementing it via plain `fetch` against Resend's REST API (no SDK — same Workers
    bundle-size reasoning as `lib/storage.ts`'s `aws4fetch` choice over the AWS SDK). Reads
    `RESEND_API_KEY` / a from-address through `lib/config`. Sending will fail cleanly (not crash
    the request) until a real API key is provided — this slice ships the port/adapter, not a live
    key.
R5. `lib/config.ts`'s zod schema gains `BETTER_AUTH_SECRET` (required), `RESEND_API_KEY` and a
    from-address (optional — email sending degrades, doesn't hard-fail config parsing, since no
    key exists yet in any environment). `.env.example` documents all three.
R6. `app/api/auth/[...all]/route.ts` mounts Better Auth's Next.js catch-all handler.
R7. `features/auth/` contains: a Better Auth client instance, and login/register/forgot-password/
    reset-password forms that call it. Forms show validation errors inline (email format,
    password rules Better Auth itself enforces) — no silent failures.
R8. UI routes under a new `app/(storefront)/` route group: `login`, `register`,
    `forgot-password`, `reset-password`, and a protected `account` page (redirects unauthenticated
    visitors to `/login`; shows name, email, role, and a working logout control — shell scope only,
    no profile editing).
R9. Unauthenticated visitors can still reach the existing public pages (`/`) without being forced
    through login — guest browsing stays intact, no regression from adding auth.
R10. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R11. `CHANGELOG.md` updated (Gate 4), including the credentials the human still needs to provide
    (`RESEND_API_KEY` on staging/production, `BETTER_AUTH_SECRET` via `wrangler secret put`) before
    this is live end-to-end.
