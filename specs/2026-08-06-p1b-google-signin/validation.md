# P1b — Google Sign-In (validation)

**Note on tooling**: every row that touches Better Auth/the database uses `npm run preview`
(OpenNext build + local Workers/Miniflare runtime), not `npm run dev` — `next dev` cannot load
`@prisma/client/wasm` and silently fails on any DB-touching route (see `CLAUDE.md`, confirmed
during P1a's validation).

| Req | How to verify |
|-----|---------------|
| R1  | `grep GOOGLE_CLIENT_ID\|GOOGLE_CLIENT_SECRET lib/config.ts .env.example .dev.vars.example` — present in all three; `npx tsc --noEmit` passes with the extended schema; unsetting both in `.env` still lets `getEnv()` parse without throwing. |
| R2  | Unit test (`tests/auth.test.ts`, no DB needed — tests `buildSocialProviders` directly): with both env vars unset, returns `undefined`; with one set and one unset, returns `undefined`; with both set, returns `{ google: { clientId, clientSecret } }` matching the input values. Read `lib/auth.ts` — `emailAndPassword` block byte-identical to P1a's. |
| R3  | Read `GoogleSignInButton.tsx` — calls `signIn.social` with `provider: "google"` and `callbackURL: "/account"`; renders a `role="alert"` error element on a returned error, matching `LoginForm`'s pattern. |
| R4  | `npm run preview`: with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set in `.env`, `/login` and `/register` both show a "Sign in with Google" control; with both removed, neither page shows it and the rest of each page renders unchanged. |
| R5  | `npm run preview`, complete a real Google sign-in against the provisioned OAuth client (manual — needs a real Google account) — the resulting `User` row has `role = CUSTOMER`; `Account` row exists with `providerId = "google"`. |
| R6  | `git status --short prisma/migrations/` shows no new files on this branch; `npx prisma validate` passes. |
| R7  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
| R8  | `CHANGELOG.md` has a new entry under `[Unreleased]` on this branch stating Google Sign-In is live end-to-end with no further credential needed. |
