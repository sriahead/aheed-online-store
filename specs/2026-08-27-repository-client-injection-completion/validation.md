# Repository client injection — completion, slices 2+3 (validation)

> **Read this before running any row.**
>
> 1. **Do not verify "no call to `getPrisma`" with a bare grep.** These files legitimately *name*
>    `getPrisma()` and `getPrismaWs()` in prose comments (`lib/repositories/vendor.ts:161` carries the
>    "`getPrismaWs(), not getPrisma()`" explanation of the #382 constraint) and in
>    `ReturnType<typeof getPrisma>` type positions. A bare-word grep matches all of those, and the only
>    way to "pass" it is to delete the explanation. **R1's AST test is the authority** for every
>    no-call row below; greps appear only as a secondary signal, and each one says what to expect.
> 2. **Exclude `app/(admin)/staff/runbook/docs.ts` from every grep in this file.** It is a generated
>    file that embeds spec and doc prose, so it matches every function name in this slice, plus
>    `getPrisma` and `@/lib/db`. Those are references, not uses.
> 3. **R33 and R34 cannot be checked before merge.** `deploy-staging` only runs on the merge to
>    `staging`, so those two rows are confirmed at **Ship**, not at `/validate`. Report them as
>    deferred-to-Ship rather than as passing or failing.
> 4. **No migration ships in this slice**, so the "apply the pending migration to staging first" step
>    that `specs/sdd-workflow.md` requires of migration-bearing slices does not apply.

| Req | How to verify |
|-----|---------------|
| R1  | Read `tests/repository-client-injection.test.ts`. Confirm no array/constant/set of file names remains, and that it enumerates `lib/repositories/` from the filesystem. Then run these four greps **separately** — each must return nothing: `grep -n "customers" F`, `grep -n "reports" F`, `grep -n "discounts" F`, `grep -n "order-lookup" F`, where `F` is that test file. (Four separate commands, deliberately: an alternation pattern cannot be written in a GFM table cell without escaping the pipe, and an escaped pipe searches for a literal pipe character and passes vacuously.) |
| R2  | Read the same file: no test case asserting "every scoped file still exists" remains. |
| R3  | `npx vitest run tests/repository-client-injection.test.ts` exits 0. Then temporarily reinsert `const prisma = getPrisma();` into `listCategoriesForAdmin` in `lib/repositories/categories.ts`, re-run, and confirm the test **fails** naming that file and line; revert. A check never seen failing is not known to work — #382's guard was proven this way twice, and slice 1's was too. |
| R4  | Follows from R3's passing run over an unscoped walk. Secondary: `grep -rnE 'getPrisma(Ws)?\(\)' lib/repositories/` — read every hit and confirm each is inside a comment or a type position, not a statement. |
| R5  | R3's test passes with `categories.ts` in scope. Read the four signatures at `lib/repositories/categories.ts` (formerly at lines 109, 138, 191, 218) and confirm each takes a client. |
| R6  | R3's test passes with `loyalty.ts` in scope. Read the three signatures (formerly lines 439, 478, 520). |
| R7  | Read `lib/loyalty-service.ts`'s entry point for `saveLoyaltySettings`: it passes `getPrismaWs()`. Cross-check `npx vitest run tests/repository-transaction-safety.test.ts` exits 0. |
| R8  | R3's test passes with `vendor.ts` in scope. Read the five signatures (formerly lines 66, 145, 149, 153, 160). |
| R9  | Read `lib/vendor-service.ts`'s entry point for `updateVendorStorefrontConfig`: it passes `getPrismaWs()`. Confirm the explanatory `getPrismaWs(), not getPrisma()` comment survives somewhere sensible — deleting it to satisfy a grep is the failure mode, not the fix. |
| R10 | `grep -n "data: any" lib/repositories/vendor.ts` returns nothing. Read the new signature and confirm `data` has a named object type with explicit field types. |
| R11 | R3's test passes with `products.ts` in scope. Read all 14 signatures and confirm each takes a client. `npm run typecheck` exits 0. |
| R12 | Read the signatures of `updateProductForVendor`, `setPrimaryProductImage` and `quickUpdateInventory`: each declares two Prisma client parameters. Compare against `applyVendorRole` in `lib/repositories/roles.ts` for the established shape. |
| R13 | Read the signatures of `addProductImage`, `promoteProductImage`, `removeProductImage`, `reorderProductImages`: exactly one client parameter each. Read their service entry points in `lib/products-service.ts` and confirm each passes `getPrismaWs()`. |
| R14 | `ls lib/*-service.ts` shows the same 15 files as on `origin/staging` — `git diff origin/staging --diff-filter=A --name-only -- lib/` lists no new service file. Read the four edited services and confirm they hold the new entry points. |
| R15 | Read each new entry point: the `getPrisma()`/`getPrismaWs()` call is inside the exported function body. Secondary: `grep -n "getPrisma" lib/categories-service.ts lib/loyalty-service.ts lib/vendor-service.ts lib/products-service.ts` — every hit that is a call must be **indented**, i.e. inside a function. A hit at column 0 is a module-scope resolution and a failure. |
| R16 | Read each new entry point: it accepts `vendorId` as a parameter and does not call `getCurrentVendorId()`. The pre-existing `getXRepository()` factories legitimately do call it — R17 covers those, and they are not in scope for this row. |
| R17 | Three separate greps, each finding an `export`: `grep -n "getCategoryRepository" lib/categories-service.ts`, `grep -n "getProductRepository" lib/products-service.ts`, `grep -n "getLoyaltyRepository" lib/loyalty-service.ts`. Then `npx vitest run` and `npm run build` both exit 0. |
| R18 | `grep -rn "updateConfigRepo" features/ app/ components/ --include=*.ts --include=*.tsx` shows the call going through the service (or the alias gone entirely). Then sweep for remaining direct repository imports with four **separate** commands — `grep -rn 'repositories/products' app/ features/ components/`, and the same for `repositories/vendor`, `repositories/categories`, `repositories/loyalty` (all `--include=*.ts --include=*.tsx`, excluding `docs.ts`). Read each hit: a type-only import is fine, a value import of a converted function is a failure. |
| R19 | `grep -rn 'from "@/lib/db"' app/ features/ components/ --include=*.ts --include=*.tsx` returns exactly one line: `app/api/health/route.ts`. Exclude `docs.ts`. |
| R20 | `npm run typecheck` exits 0. |
| R21 | `npx vitest run tests/repository-transaction-safety.test.ts` exits 0, **and** `git diff origin/staging -- tests/repository-transaction-safety.test.ts` is empty. |
| R22 | `npx vitest run tests/repository-purity.test.ts tests/repository-vendor-scoping.test.ts` exits 0. |
| R23 | Read `git diff origin/staging -- lib/repositories/categories.ts lib/repositories/loyalty.ts lib/repositories/vendor.ts lib/repositories/products.ts`. For each converted function the diff shows only: the signature line(s), the removed `const prisma = getPrisma();` (or inlined equivalent), and mechanical renames. Any changed `where`, `select`, `orderBy`, `take`/`skip` or return type is a finding — report it, do not fix it under Validate. |
| R24 | Read `scripts/verify-repository-injection.ts`: it imports `PrismaClient` from `@prisma/client` (bare specifier, **not** `/wasm`, and not through `lib/db`), and its check list names at least one read and one write from each of the four files. |
| R25 | Read the same script: `createProductForVendor` and one of `addProductImage`/`setPrimaryProductImage`/`promoteProductImage` are exercised. |
| R26 | Read the cleanup section: it deletes what it created and re-counts to confirm. Then run R28 twice in a row — the second run must also exit 0 and report the same PASS lines, which it cannot do if the first run left rows behind (a duplicate slug would fail `createProductForVendor`). |
| R27 | First read the guard and confirm it runs **before** any client is constructed. Then demonstrate it: take the staging host from `secrets/staging.vars`, build a `DATABASE_URL` that uses that host **with a deliberately wrong password**, and run the script with it. Expect a non-zero exit and a refusal message naming the host, with no connection attempted. The wrong password is the second layer: if the guard were broken, authentication fails and nothing is written either way. Do **not** run this test with real staging credentials. |
| R28 | Confirm `.env`'s `DATABASE_URL` host against `secrets/staging.vars` and `secrets/production.vars` first — check the **host**, not the filename (`CLAUDE.md`: the two files have already agreed on production once while every surrounding value looked like staging). The dev branch is `ep-sparkling-paper`. Then `npx tsx scripts/verify-repository-injection.ts`; it exits 0, prints the resolved host, and every check line reads PASS. |
| R29 | Read `lib/products-service.ts`'s docstring: the sentence claiming the admin write path is script-exercisable is gone or corrected, and the new text says what was previously false. Verify by reading — a grep for an absent word would match the correction itself. |
| R30 | Read `CLAUDE.md`'s repository-layer section: it states the check is now unscoped across `lib/repositories/`, and records the fourth false docstring (`lib/products-service.ts`) alongside the three slice 1 found. |
| R31 | `grep -n "getPrisma" lib/repositories/campaigns.ts` line 1 reads `import type { getPrisma }`. `npm run typecheck` exits 0. |
| R32 | `grep -n -A2 "\[limits\]" wrangler.toml` shows `cpu_ms = 300` with a comment naming #415. |
| R33 | **Deferred to Ship.** After the PR merges to `staging`, confirm the `deploy-staging` run concluded `success` via `gh run list --workflow deploy-staging --limit 1` and `gh run view <id> --json status,conclusion`. Do not infer success from the merge alone. |
| R34 | **Deferred to Ship.** After R33 passes, issue 10 sequential requests to `https://staging.aheedfoodcentre.nocaped.com/` and confirm each returns HTTP 200 with no `Error 1102` in the body. Record the result; a 1102 here means the raise was insufficient and reopens #415 rather than reverting this slice. |
| R35 | `ls specs/2026-08-27-repository-client-injection-completion/` lists all four files. |
| R36 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice. |
| R37 | `npm run kms:validate` reports `invalid front-matter (failing): 0`. `npm run kms:build-index` is run **last**, after every front-matter edit, then CI's `gates` job is the confirmation — do **not** use a bare `git diff --exit-code ARTIFACT_INDEX.md`, which always shows a one-commit footer difference by construction (`specs/sdd-workflow.md` 2.10.0). |
| R38 | `npm run sdd:audit` exits 0 and prints no `✘` line. A "skipped" line for the promotion half (no `gh` auth) is not a pass — re-run once `gh auth status` succeeds. |
| R39 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI's `gates` job on the PR is the authority, not local output. |
| R40 | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` succeeds. **Read the real exit status** — piping this through `tail` reports the pipe's success, not the build's, which is how a failing build has looked green here before. |

## Notes

- **No `npm run preview` row is required.** This slice changes where a Prisma client is constructed,
  not what any query does; R20's `typecheck`, R17's `build` and R28's live script cover it. If a
  reviewer wants a runtime check anyway, exercise `/staff/products`, `/staff/inventory`,
  `/staff/categories`, `/staff/loyalty` and `/staff/storefront` under `npm run preview` — never
  `npm run dev`, which cannot load `@prisma/client/wasm` and fails DB-touching routes silently.
- **`/staff/storefront` is the page worth opening if only one is.** It is the only caller of
  `getVendorConfig`, `getVendorBranding` and (via the alias) `updateVendorStorefrontConfig`, and the
  aliased import is the single hazard in this slice that a name-based sweep would miss.
- **R23 is the row most likely to surface a real defect**, because it is the only one that looks at
  what the conversion did to query semantics rather than to signatures. Budget time for it.
