# P1a — Email/password auth, RBAC, account shell (validation)

**Note on tooling**: every row that touches Prisma/the database uses `npm run preview`
(OpenNext build + local Workers/Miniflare runtime), not `npm run dev`. `next dev` runs in plain
Node, which cannot load `@prisma/client/wasm`'s WASM query engine — the DB path silently fails
there (confirmed while validating this slice: the M0 homepage has been silently showing
`error ✗` under `next dev` this whole time). `next dev` is fine for UI-only checks.

| Req | How to verify |
|-----|---------------|
| R1  | `npx prisma migrate dev` generates a new migration under `prisma/migrations/`; `npx prisma validate` passes; schema review confirms no `Json` columns, explicit `@relation` foreign keys on `Session`/`Account`, `role` enum with `@default(CUSTOMER)` on `User`. |
| R2  | Read `lib/auth.ts` — Prisma adapter configured, email/password provider present, `sendResetPassword`/verification email hooks call into `lib/email`, no Google/OAuth provider block. |
| R3  | Unit test: a mocked `STAFF` session is denied access to an `ADMIN`-gated check; a mocked `ADMIN` session passes an `ADMIN`-gated check; an unauthenticated request is denied, not silently allowed. |
| R4  | Unit test: the Resend adapter builds a correct request against Resend's REST API shape; with no `RESEND_API_KEY` set, sending fails with a caught, logged error rather than throwing an unhandled exception up through the request. |
| R4a | `npm run preview`, fire 5+ rapid sequential `POST /api/auth/sign-up/email` requests with distinct emails — none fail with `"Cannot perform I/O on behalf of a different request"`. (Rate-limit `429`s are fine — that's Better Auth's own protection, not this bug.) |
| R5  | `grep BETTER_AUTH_SECRET\|RESEND_API_KEY lib/config.ts .env.example .dev.vars.example` — present in all three; `npx tsc --noEmit` passes with the new zod schema. |
| R6  | `npm run preview`, `curl -X POST http://127.0.0.1:8787/api/auth/sign-up/email` with a valid body — returns a Better Auth JSON response (created user, `role: "CUSTOMER"`), not a 404 or 500. |
| R7  | `npm run preview`, visit `/register` — submitting an invalid email or a too-weak password shows an inline error, not a silent no-op or unhandled crash. |
| R8  | `npm run preview`: `/login`, `/register`, `/forgot-password`, `/reset-password` all render; visiting `/account` while logged out redirects to `/login`; after a real sign-up + email verification + login, `/account` shows name/email/role and logout works, redirecting back to a logged-out state. |
| R9  | `npm run preview`, visit `/` while logged out — renders normally, no forced redirect to `/login`. |
| R10 | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
| R11 | `CHANGELOG.md` has a new entry under `[Unreleased]` on this branch, naming the still-missing `RESEND_API_KEY`/`BETTER_AUTH_SECRET` production setup as a follow-up, and documenting the `getPrisma()` fix. |
