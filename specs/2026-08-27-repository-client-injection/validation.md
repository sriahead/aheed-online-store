# Repository client injection — slice 1 of 3 (validation)

> **Read before running the R5–R8 rows.** Do **not** verify "no call to `getPrisma`" with a bare
> `grep`. These files legitimately *name* `getPrisma()` and `getPrismaWs()` in prose — for example
> `lib/repositories/discounts.ts` carries the comment "`getPrismaWs(), not getPrisma(): ...`"
> explaining the #382 constraint, and every file uses `ReturnType<typeof getPrisma>` in type
> positions. A bare-word grep matches all of those and can only be "passed" by deleting the
> explanation, which is the exact trap `specs/sdd-workflow.md` records four prior instances of.
> **The AST test from R1 is the authority for those rows**; the greps below target the call syntax
> only, as a secondary signal.

| Req | How to verify |
|-----|---------------|
| R1  | `npx vitest run tests/repository-client-injection.test.ts` exits 0. Then temporarily reinsert `const prisma = getPrisma();` into `listCustomersForAdmin`, re-run, and confirm the test **fails**; revert. A check never seen failing is not known to work (#382's own guardrail was proven this way, twice). |
| R2  | From the deliberate-failure run in R1, confirm the output names `lib/repositories/customers.ts`, a line number, and `lib/customers-service.ts`. |
| R3  | Read the test source: the scoping constant is a list of file names, and its comment cites `#409`, `#411`, `#412`. Confirm no function or symbol name appears in any exemption structure — `grep -nE 'listCustomersForAdmin|getCatalogueHealth|createCodeForVendor' tests/repository-client-injection.test.ts` returns nothing (ERE alternation is a bare `|`; escaping it would search for a literal pipe and pass vacuously). |
| R4  | Read the same constant: it lists exactly `customers.ts`, `order-lookup-rate-limit.ts`, `reports.ts`, `discounts.ts`. `npx vitest run tests/repository-client-injection.test.ts` exits 0. |
| R5  | R1's test passes with `customers.ts` in scope. Secondary: `grep -nE 'getPrisma(Ws)?\(\)' lib/repositories/customers.ts` returns no line that is a statement rather than a comment (read each hit; expect none at all in this file). |
| R6  | R1's test passes with `order-lookup-rate-limit.ts` in scope. Secondary: same grep against that file, reading each hit. |
| R7  | R1's test passes with `reports.ts` in scope. Secondary: same grep against that file. |
| R8  | R1's test passes with `discounts.ts` in scope. Secondary: same grep against that file — expect hits **only** inside the `getPrismaWs(), not getPrisma()` explanatory comment, which must survive. |
| R9  | `ls lib/customers-service.ts lib/reports-service.ts lib/order-lookup-rate-limit-service.ts` lists all three. Read each: it calls `getPrisma()`/`getPrismaWs()` inside the exported function (not at module scope — a module-scope client is cached across requests, which throws on Workers per CLAUDE.md) and accepts `vendorId` as a parameter. |
| R10 | Read `lib/discounts-service.ts`: exported entry points for create and deactivate exist, each resolving its client inside the function body. |
| R11 | Read the deactivate entry point in `lib/discounts-service.ts` and confirm it passes `getPrismaWs()`. Cross-check `npx vitest run tests/repository-transaction-safety.test.ts` exits 0. |
| R12 | `npx vitest run tests/repository-transaction-safety.test.ts` exits 0, and `git diff origin/staging -- tests/repository-transaction-safety.test.ts` is empty. |
| R13 | `npm run typecheck` exits 0 (this is what actually proves the six call sites resolve). Then `npm run build` exits 0. |
| R14 | `grep -rn 'from "@/lib/db"' app/ features/ components/ --include=*.ts --include=*.tsx` returns exactly one line: `app/api/health/route.ts`. Exclude `app/(admin)/staff/runbook/docs.ts`, a generated file that embeds spec prose. |
| R15 | `ls scripts/verify-repository-injection.ts` succeeds. Read it: it imports `PrismaClient` from `@prisma/client` (bare specifier, **not** `/wasm`) and passes the constructed client into a `lib/repositories/*` export. |
| R16 | Confirm `.env`'s `DATABASE_URL` host against `secrets/staging.vars` and `secrets/production.vars` first (CLAUDE.md — check the host, not the filename; the dev branch is `ep-sparkling-paper`). Then `npx tsx scripts/verify-repository-injection.ts`; it exits 0 and every printed line reads PASS. |
| R17 | Read `tests/repository-purity.test.ts`'s docstring. The sentence declaring internally-resolving functions "compliant" is gone, and the docstring points at `tests/repository-client-injection.test.ts` for the client half. Verify by reading, not by grepping for an absent word — the docstring legitimately discusses `getPrisma` throughout. |
| R18 | Read `CLAUDE.md`'s repository-layer section: it states the client-parameter rule once, names both `tests/repository-purity.test.ts` and the new test, and records that `lib/db.ts`'s `@prisma/client/wasm` import makes an internally-resolved client unusable from a Node script. |
| R19 | `npm run sdd:audit` exits 0 and prints no `✘` line. Confirm the roadmap row for PR #393 exists: `grep -n "PR #393" specs/roadmap.md` returns a change-log row. |
| R20 | `npm run kms:validate` reports `invalid front-matter (failing): 0`. Run `npm run kms:build-index` **last**, after every front-matter edit, then confirm CI's `gates` job passes — do not use a bare `git diff --exit-code ARTIFACT_INDEX.md`, which always shows a one-commit footer difference by construction (`specs/sdd-workflow.md` 2.10.0). |
| R21 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice. |
| R22 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI's `gates` job on the PR is the authority, not local output. |

## Notes

- **No migration ships in this slice**, so the "apply the pending migration to staging first" step
  that `specs/sdd-workflow.md` requires of migration-bearing slices does not apply here.
- **No `npm run preview` row is needed.** This slice changes where a Prisma client is constructed, not
  what any query does; R13's `typecheck`/`build` plus R16's live script cover it. If a reviewer wants
  a runtime check anyway, exercise `/staff/customers`, `/staff/reports` and `/orders/lookup` under
  `npm run preview` — never `npm run dev`, which cannot load `@prisma/client/wasm`.
