# Demo-accounts add/remove tool (requirements)

Delivers a standalone, reusable tool (issue #57) to add/remove the platform's demo login accounts on
demand against any environment, separate from `prisma/seed.ts`. Builds on Better Auth (ADR-002,
`lib/auth.ts`) and the `DIRECT_URL` convention from `prisma/seed.ts`. Unblocks #56 by making demo
accounts reproducible after the staging DB reset.

R1. `scripts/demo-accounts.ts` exists and is runnable via `npm run demo:accounts -- <add|remove>`
    (a `demo:accounts` script in `package.json`); invoked with no/invalid subcommand it prints usage
    and exits non-zero.

R2. Run with a subcommand but no `DIRECT_URL` (and no `DATABASE_URL`) in the environment, the tool
    exits non-zero with a clear message and creates/deletes nothing.

R3. Run with a subcommand but no `DEMO_ACCOUNT_PASSWORD` set, `add` exits non-zero with a clear
    message and creates nothing (the password is never hardcoded).

R4. `add` against an empty database creates three accounts — `demo-admin@example.com` (role ADMIN),
    `demo-staff@example.com` (role STAFF), `demo-customer@example.com` (role CUSTOMER) — each with a
    Better-Auth password credential (`Account` row) and `emailVerified = true`, and each able to sign
    in with `DEMO_ACCOUNT_PASSWORD`.

R5. `add` is idempotent: a second immediate `add` run exits 0, creates no duplicate `User` rows
    (still exactly one row per demo email), and leaves each role/`emailVerified` at its intended value.

R6. Signing in as `demo-admin@example.com` and loading `/dev` renders the diagnostics page; signing
    in as `demo-customer@example.com` and loading `/dev` shows the "administrators only" message.

R7. The tool sends **no** verification or transactional email as a side effect of `add` (no call
    reaches the email service — asserted by test with a mocked/failing email service that would throw
    if invoked).

R8. `remove` deletes all three demo users and their dependent `Session`/`Account` rows; afterwards
    none of the three emails resolves to a `User`, and a subsequent sign-in attempt fails.

R9. `docs/env-setup.md` documents the tool: what it manages, `add`/`remove` usage, the required
    `DIRECT_URL` + `DEMO_ACCOUNT_PASSWORD`, and the "keep in prod + staging until all phases" note;
    its front-matter `version`/`updated` are bumped.

R10. `CHANGELOG.md` updated (Gate 4), referencing #57.

R11. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice (Gate 3).
