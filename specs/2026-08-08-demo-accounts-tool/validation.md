# Demo-accounts add/remove tool (validation)

DB-touching checks run against a real database via each environment's `DIRECT_URL` (the tool is a
Node/tsx script like `prisma/seed.ts`); sign-in/`/dev` checks run against the deployed staging app.

| Req | How to verify |
|-----|---------------|
| R1  | `npm run demo:accounts` (no subcommand) prints usage and exits non-zero (`echo $?` ≠ 0); `package.json` has a `demo:accounts` script; `scripts/demo-accounts.ts` exists. |
| R2  | With `DIRECT_URL`/`DATABASE_URL` unset: `npm run demo:accounts -- add` exits non-zero with a "missing DIRECT_URL" message; a follow-up `select count(*) from "User"` is unchanged. |
| R3  | With `DIRECT_URL` set but `DEMO_ACCOUNT_PASSWORD` unset: `npm run demo:accounts -- add` exits non-zero with a "missing DEMO_ACCOUNT_PASSWORD" message; no `User` rows created. |
| R4  | `DIRECT_URL=<target> DEMO_ACCOUNT_PASSWORD=… npm run demo:accounts -- add` exits 0; querying the DB shows `demo-admin@example.com` role=ADMIN, `demo-staff@example.com` role=STAFF, `demo-customer@example.com` role=CUSTOMER, each `emailVerified=true` with one `Account` row; signing in as each on staging with the password succeeds. |
| R5  | Run `add` a second time immediately → exits 0; `select email, count(*) from "User" where email like 'demo-%@example.com' group by email` shows exactly 1 per email; roles/`emailVerified` unchanged. |
| R6  | On staging, sign in as `demo-admin@example.com` → `/dev` renders diagnostics; sign in as `demo-customer@example.com` → `/dev` shows the "administrators only" message. |
| R7  | `npm run test` includes a test that runs `add`'s account-creation path with the email service mocked to throw if called, and asserts it is never called (no verification email side effect). |
| R8  | `DIRECT_URL=<target> npm run demo:accounts -- remove` exits 0; `select count(*) from "User" where email like 'demo-%@example.com'` returns 0; `Session`/`Account` rows for them are gone; a subsequent staging sign-in as `demo-admin@example.com` fails. |
| R9  | `docs/env-setup.md` contains the demo-accounts tool section (usage, `DIRECT_URL` + `DEMO_ACCOUNT_PASSWORD`, keep-in-prod+staging note); `git diff` shows front-matter `version`/`updated` bumped. |
| R10 | `CHANGELOG.md` diff shows a new entry naming this tool and `#57`. |
| R11 | `npm run lint && npm run typecheck && npm run test && npm run format:check` all exit 0. |
