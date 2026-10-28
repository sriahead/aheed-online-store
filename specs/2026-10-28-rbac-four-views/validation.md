# RBAC four views (validation)

> **Testing strategy (lean 80/20).** Pure logic is unit-tested. The gate matrix is a static AST
> test, proved by mutation. Real access is proved live, under `npm run preview` (never `npm run dev`;
> the WASM Prisma engine does not load there), and then on staging. This is auth work, so the
> security rows (R22-R25) are not optional.

**Live-walk mechanics (R22-R25):**
- **Sign in:** `POST http://localhost:8787/api/auth/sign-in/email` with header `Origin: http://localhost:8787`
  and a JSON body of `email` and `DEMO_ACCOUNT_PASSWORD`, read from `.dev.vars` without printing it.
  Keep the cookie jar per account.
- **Page requests:** `curl -s -o <file> -w '%{http_code} %{redirect_url}'`, with no `-L`.
- **In Git Bash,** prefix with `MSYS_NO_PATHCONV=1` and never pass `-o /dev/null`. HTTP `000` /
  error 43 is the shell, not the app (`CLAUDE.md`). PowerShell `Invoke-WebRequest -MaximumRedirection 0`
  is the fallback.
- **Rate limits:** Better Auth answers 429 after a few sign-ins. Wait 30 s and retry
  (`local-dev-playbook.md`).
- **Before `demo:accounts`,** check `DIRECT_URL` and `DATABASE_URL` one at a time and print the host
  only. It must be the dev Neon host from `secrets/`, never staging or production.

## Validation steps

| Req | Testing area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/auth-landing.test.ts` passes; read `safeNextPath` and confirm the three conditions. |
| R2  | Unit | Same test file passes; read `landingPath`'s three defaults. |
| R3  | Unit | `grep -nE "^import\|fetch\(" lib/auth-landing.ts` prints nothing. |
| R4  | Unit | Read `tests/auth-landing.test.ts` and confirm every listed input appears, including the newline case. The file passes. |
| R5  | Unit | Read `app/(storefront)/signed-in/route.ts` (amended from `page.tsx` at Build) and confirm `force-dynamic`, the exported `GET`, the single gate call, the 401 branch to `/login`, and the three-way mapping. R22 proves it live. |
| R6  | Unit | `grep -n 'router.push' features/auth/components/LoginForm.tsx` shows `/signed-in` only. `grep -c 'router.push("/account")' features/auth/components/LoginForm.tsx` prints 0. |
| R7  | Unit | `grep -n callbackURL features/auth/components/GoogleSignInButton.tsx` shows `/signed-in`, and `grep -c 'callbackURL: "/account"'` on the same file prints 0. |
| R8  | Unit | Read `app/(storefront)/login/page.tsx`: `next` from `searchParams` is passed to both components. `git diff origin/staging --stat -- 'app/(storefront)/register'` prints nothing. |
| R9  | Unit | `npx vitest run tests/demo-accounts.test.ts` passes; read the roster. |
| R10 | Unit | Same file: the demotion test exists and passes. |
| R11 | Docs | Read the roster doc comment. `grep -n "demo-platform-admin\|demo-admin" docs/developer-portal/env-setup.md` shows the new account as platform ADMIN and `demo-admin` as store ADMIN only. |
| R12 | Security | `git diff origin/staging -- scripts/demo-accounts.ts docs/ specs/2026-10-28-rbac-four-views/ \| grep -E '^\+.*(DEMO_ACCOUNT_PASSWORD=[^ "]\|password: *["'"'"'])'` prints nothing. |
| R13 | Unit + E2E | Read the page: the gate, both refusal branches, `PageContainer width="wide"` and the three data attributes. R23 proves the counts live. |
| R14 | Unit | Read `components/staff/platform-nav-items.ts`. `npx vitest run tests/staff-nav-parity.test.ts tests/icon-imports.test.ts` passes. |
| R15 | Unit | The `isRouteActive` test named in R15 passes. |
| R16 | Docs | `npx vitest run tests/operator-doc-coverage.test.ts` passes. Read the landing paragraph and confirm the version bump. |
| R17 | Static | `npx vitest run tests/rbac-gate-matrix.test.ts` passes. Read the test and confirm the `createSourceFile` use, the filesystem walk, and no skip or exemption list (`grep -niE "skip\|exempt\|allow" tests/rbac-gate-matrix.test.ts` shows only comments explaining their absence). |
| R18 | Static | Read the one-hop resolution. Confirm `app/(admin)/staff/team/actions.ts` passes through `lib/roles-service.ts`. |
| R19 | Static | Read the four minimum-count assertions. |
| R20 | Static | R17 passes. `build-notes.md` lists each code fix, or states "None found". |
| R21 | Mutation | Apply each of the four edits alone and run the test: it fails. Run `git checkout -- <file>` and run it again: it passes. Record all four results. |
| R22 | E2E | Live walk per the mechanics above. Record the `Location` for each account and both `next` cases, plus the signed-out 307. |
| R23 | E2E / Security | Each row of the R23 table, recording the status and the marker counts. |
| R24 | E2E / Security | SriMart-host walk per `local-dev-playbook.md`. Record each status. |
| R25 | E2E | At Ship, after `deploy-staging` and the owner's `demo:accounts add` against staging (hand over the command; do not run it). Run the three checks against staging. |
| R26 | Static | `git diff origin/staging --stat -- prisma/` prints nothing. |
| R27 | Static | `git diff origin/staging \| grep -E '^\+.*from "better-auth'` prints nothing. `git diff origin/staging --stat -- lib/auth.ts lib/auth-rbac.ts` prints nothing. |
| R28 | Docs | `grep -c "#1319" CHANGELOG.md` prints at least 1, inside `[Unreleased]`. |
| R29 | Gates | Run each listed command; each exits 0. Run vitest alone, with no build running alongside. |
