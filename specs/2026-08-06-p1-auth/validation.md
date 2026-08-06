# P1a — Email/password auth, RBAC, account shell (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx prisma migrate dev` generates a new migration under `prisma/migrations/`; `npx prisma validate` passes; schema review confirms no `Json` columns, explicit `@relation` foreign keys on `Session`/`Account`, `role` enum with `@default(CUSTOMER)` on `User`. |
| R2  | Read `lib/auth/index.ts` — Prisma adapter configured, email/password provider present, `sendResetPassword`/verification email hooks call into `lib/email`, no Google/OAuth provider block. |
| R3  | Unit test: a mocked `STAFF` session is denied access to an `ADMIN`-gated check; a mocked `ADMIN` session passes an `ADMIN`-gated check; an unauthenticated request is denied, not silently allowed. |
| R4  | Unit test: the Resend adapter builds a correct request against Resend's REST API shape; with no `RESEND_API_KEY` set, sending fails with a caught, logged error rather than throwing an unhandled exception up through the request. |
| R5  | `grep BETTER_AUTH_SECRET\|RESEND_API_KEY lib/config.ts .env.example` — present in both; `npx tsc --noEmit` passes with the new zod schema. |
| R6  | `npm run dev`, `curl -X POST http://localhost:3000/api/auth/sign-up/email` (or the equivalent Better Auth route) — returns a Better Auth response, not a 404. |
| R7  | `npm run dev`, visit `/register` — submitting an invalid email or a too-weak password shows an inline error, not a silent no-op or unhandled crash. |
| R8  | `npm run dev`: `/login`, `/register`, `/forgot-password`, `/reset-password` all render; visiting `/account` while logged out redirects to `/login`; after a real sign-up + login, `/account` shows name/email/role and logout works, redirecting back to a logged-out state. |
| R9  | `npm run dev`, visit `/` while logged out — renders normally, no forced redirect to `/login`. |
| R10 | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
| R11 | `CHANGELOG.md` has a new entry under `[Unreleased]` on this branch, naming the still-missing `RESEND_API_KEY`/`BETTER_AUTH_SECRET` production setup as a follow-up. |
