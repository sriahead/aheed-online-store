# Demo logins on `@merqify.com`, with forwarded mail (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Unit tests prove the add/remove decisions and the demo predicate with the existing injected fake.
> The live rows prove the rename against the real new-staging database and Better Auth sign-in,
> because "the password survives a rename" is a claim about Better Auth's real tables, not about a
> fake. R15 and R16 are owner-gated and must be reported **UNVERIFIED**, not passed, until the
> owner's Email Routing setup is done.

**Setup for the live rows.**
- Run from the repository root in Git Bash.
- Check the process environment first (`CLAUDE.md`): test each of `DIRECT_URL`, `DATABASE_URL`
  and `DEMO_ACCOUNT_PASSWORD` **one at a time** with `if printenv "$v" >/dev/null 2>&1`, and prefix
  every command with `env -u DIRECT_URL -u DATABASE_URL -u DEMO_ACCOUNT_PASSWORD`.
- Take both values from `secrets/merqify-staging.vars`, whose `DIRECT_URL` host must be
  `ep-damp-snow-zamr1xa5`. Print hosts only, never a URL or the password.
- Prefix `curl` with `MSYS_NO_PATHCONV=1` and never use `-o /dev/null` (it becomes
  `curl: (43)`/`000`).
- If Windows reports `CRYPT_E_REVOCATION_OFFLINE`, add `--ssl-no-revoke`.

**Before R13, record the pre-run state:**
- each roster user's id, email, `role` and memberships (`slug:role`), from new staging;
- the query matches `email like 'demo-%@example.com' or email like 'demo-%@merqify.com'`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `scripts/lib/demo-roster.ts`. **Expect:** no `import` line. **Expect:** the six accounts' `name`/`platformRole`/`vendorRole`/`vendorSlug` equal `git show 0ca03fd:scripts/demo-accounts.ts`'s roster, emails `@merqify.com`. **Expect:** exactly one `platformRole: "ADMIN"` (`demo-platform-admin`). **Expect:** `DEMO_EMAILS`, `LEGACY_DEMO_EMAILS` and `legacyDemoEmail` exported. |
| R2  | Unit | `git grep -n "@example\.com\"" -- scripts/demo-accounts.ts scripts/lib/demo-roster.ts` prints at most the one line inside `legacyDemoEmail`. **Expect:** `scripts/demo-accounts.ts` has an `import` from `./lib/demo-roster` and exports `DEMO_ACCOUNTS`. |
| R3  | Unit | `npx vitest run --maxWorkers=4 tests/demo-accounts.test.ts`. A named test seeds one account with both addresses. **Expect:** it asserts the thrown message contains both addresses. **Expect:** the fake's update, upsert and sign-up call counts are all 0. |
| R4  | Unit | Same file. A named test seeds a legacy-only account. **Expect:** exactly one `user.update` with `where.email` = legacy and `data.email` = new. **Expect:** no sign-up for it. **Expect:** the printed line `~ <legacy> -> <new> [renamed]`. |
| R5  | Unit | Same file. **Expect:** a test with an empty fake asserts six sign-ups, all with `@merqify.com` addresses. |
| R6  | Unit | Same file. **Expect:** a test runs `addDemoAccounts` twice on the same fake. **Expect:** the second run makes 0 renames and 0 sign-ups. **Expect:** six `[reconciled]` lines. **Expect:** role, `emailVerified` and membership asserted on the new address. |
| R7  | Unit | Same file. **Expect:** a test asserts one `deleteMany` whose `email.in` has length 12 and contains every new and legacy address. |
| R8  | Unit | `npx vitest run --maxWorkers=4 tests/neon-migration-plan.test.ts`. **Expect:** the `isDemoEmail` tests assert `true` for all twelve roster addresses (one in mixed case with surrounding spaces) and for `someone@example.com`. **Expect:** `false` for `owner@merqify.com`, `info@merqify.com`, `demo@merqify.com` and `owner@aheedfoodcentre.co.uk`. |
| R9  | Integration | `npx tsx scripts/grant-role.ts --env-file secrets/merqify-staging.vars --email demo-customer@merqify.com --platform-admin; echo "exit $?"`. **Expect:** exit 1 with `is a demo or test account`. **Expect:** no `database:` line, which proves no client was built. Then `git grep -n "isDemoEmail" scripts/migrate-to-new-neon.ts`. **Expect:** it still shows the `User:` filter line. |
| R10 | Unit | `git grep -n "demo-[a-z-]*@example\.com" -- docs/developer-portal/env-setup.md docs/developer-portal/local-dev-playbook.md docs/platform-admin-guide/platform-admin-guide.md scripts/verify-mobile-layout.ts`. **Expect:** no line from the six roster bullets, the playbook's "seeds the roster" sentence, the platform admin guide or the `verify-mobile-layout.ts` comment. **Expect:** any remaining hit sits in a dated evidence note ("Seen at", "`/validate` (", "`/ship`"). Read each named location. **Expect:** it shows `@merqify.com`. |
| R11 | Unit | `rg -n "^#+ Demo mail forwarding" docs/developer-portal/env-setup.md` finds the heading. Read the subsection. **Expect:** all five points from R11 are present. Then `git grep -n -i -E "google[g]roups"`. **Expect:** it prints nothing (exit 1). |
| R12 | Unit | The R3–R8 runs above all pass. **Expect:** each named case exists. |
| R13 | Integration (live) | Run `env -u DIRECT_URL -u DATABASE_URL -u DEMO_ACCOUNT_PASSWORD DIRECT_URL=<new staging direct> DEMO_ACCOUNT_PASSWORD=<from file> npm run demo:accounts -- add`. **Expect:** six `[renamed]` lines on the first run. Re-run the pre-run query. **Expect:** six `@merqify.com` rows and zero `@example.com` roster rows. **Expect:** ids, `role` and memberships identical to the recorded pre-run state. Run `add` a second time. **Expect:** six `[reconciled]` lines and no `[renamed]`. |
| R14 | E2E (live) | `curl -sS -D - -X POST https://aheed-staging.merqify.com/api/auth/sign-in/email -H "Content-Type: application/json" -H "Origin: https://aheed-staging.merqify.com" --data '<json email+password>'`. **Expect:** status line `HTTP/1.1 200`. Repeat on `srimart-staging` with `demo-srimart-admin@merqify.com`. Build the JSON body with `node -e` from the file's password so it never appears on screen. |
| R15 | Integration (owner-gated) | `curl -sS -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=merqify.com&type=MX"`. **Expect:** `Answer` holds only `route1/2/3.mx.cloudflare.net`. Before the owner's setup this returns no `Answer`. Report **UNVERIFIED** in that case. |
| R16 | E2E (owner-gated) | The owner sends a message from a personal mailbox to `demo-customer@merqify.com`. **Expect:** the owner reports that it arrived in the forwarding inbox. Record the owner's confirmation and date. Without it, report **UNVERIFIED**. |
| R17 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1356`. |
| R18 | Regression | In CI on the PR, `quality / quality` and `quality / kms` are green. Locally: `npm run lint`, `npm run typecheck`, `npm run format:check`, then `npx vitest run --maxWorkers=4` run alone. |
