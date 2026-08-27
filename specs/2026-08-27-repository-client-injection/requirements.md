# Repository client injection — slice 1 of 3 (requirements / acceptance criteria)

Slice 1 of **#409** (tracked as **#410**). `CLAUDE.md`'s repository-layer rule requires every export
in `lib/repositories/*.ts` to take its Prisma client as an explicit parameter; 32 of 109 do not, and
`tests/repository-purity.test.ts`'s docstring contradicts the rule by declaring internal resolution
"compliant". A live probe settled it: a `lib/db` client cannot execute a query in plain Node, because
`@prisma/client/wasm`'s query compiler will not load there, so those functions are unreachable from a
script by construction. This slice adds the missing enforcement, reconciles the two documents, and
clears the six exports in the four smallest affected files. Slices 2 (#411) and 3 (#412) follow.

R1. `tests/repository-client-injection.test.ts` exists and fails when a file in `lib/repositories/`
    contains a **call expression** to `getPrisma` or `getPrismaWs`. The check is AST-based over the
    whole file, matching the posture of `tests/repository-transaction-safety.test.ts`.

R2. That test's failure message names, for each violation, the file, the line, and the sibling
    `lib/<name>-service.ts` the resolution belongs in.

R3. The test's coverage is limited to a list of **files**, not functions, and the source contains a
    comment naming issues #409, #411 and #412 as the reason the list is temporary. No function-level
    or symbol-level exemption exists anywhere in the check.

R4. The test's file list covers exactly `customers.ts`, `order-lookup-rate-limit.ts`, `reports.ts`
    and `discounts.ts`, and the test passes.

R5. `listCustomersForAdmin` in `lib/repositories/customers.ts` declares a Prisma client as a
    parameter and its body contains no call to `getPrisma`/`getPrismaWs`.

R6. `checkOrderLookupRateLimit` in `lib/repositories/order-lookup-rate-limit.ts` declares a Prisma
    client as a parameter and its body contains no call to `getPrisma`/`getPrismaWs`.

R7. `getCatalogueHealth` and `getLoyaltyLiability` in `lib/repositories/reports.ts` each declare a
    Prisma client as a parameter and neither body contains a call to `getPrisma`/`getPrismaWs`.

R8. `lib/repositories/discounts.ts` contains no call to `getPrisma`/`getPrismaWs`. Its
    `createCodeForVendor` and `deactivateCodeForVendor` wrappers are **relocated** to
    `lib/discounts-service.ts` rather than given a client parameter — they are pure facades over
    `createCode`/`deactivateCode`, which already take a client, so parameterising them in place would
    leave two identical entry points. (Corrected during Build: the spec first required a parameter
    here; see `build-notes.md`.)

R9. `lib/customers-service.ts`, `lib/reports-service.ts` and `lib/order-lookup-rate-limit-service.ts`
    exist, each resolving a Prisma client per call and taking `vendorId` as a parameter.

R10. `lib/discounts-service.ts` exports request-scoped entry points for discount-code creation and
     deactivation, resolving the client per call.

R11. `deactivateCodeForVendor`'s caller passes a client obtained from `getPrismaWs`, not `getPrisma` —
     the `updateMany` HTTP-mode constraint from #382 is preserved.

R12. `tests/repository-transaction-safety.test.ts` passes unchanged — this slice does not alter which
     client any write path uses.

R13. All six call sites compile and resolve against the new signatures:
     `app/(admin)/staff/customers/page.tsx`, `app/(admin)/staff/reports/page.tsx`,
     `app/(storefront)/orders/lookup/page.tsx`, `app/(storefront)/orders/lookup/export/route.ts`,
     `features/orders/guest-data-rights.ts`, `features/admin/discount-codes.ts`.

R14. No file under `app/`, `features/` or `components/` gains an import of `@/lib/db`.
     `app/api/health/route.ts`'s existing import is the only one permitted to remain. (ADR-004 slice
     2's `no-restricted-imports` rule in `eslint.config.mjs` already enforces this, which is why the
     new resolution must live in `lib/<name>-service.ts` — a caller in those layers physically
     cannot hand a client in.)

R15. `scripts/verify-repository-injection.ts` exists, and when run with `npx tsx` against a database
     it exercises at least one converted repository export using a Prisma client the script itself
     constructs from the bare `@prisma/client` specifier, printing a pass/fail line per check.

R16. Running that script exits 0 and reports a pass for every check.

R17. `tests/repository-purity.test.ts`'s docstring no longer states that a repository function calling
     `getPrisma()` internally is compliant, and instead points at the new check for that half of the
     rule.

R18. `CLAUDE.md`'s repository-layer section states the client-parameter rule once, names both
     enforcing tests, and records the `@prisma/client/wasm` finding that makes internal resolution
     script-unreachable.

R19. `specs/roadmap.md` gains a change-log row citing `PR #393` for the `staging → main` promotion of
     the #382 fix (carry-forward from the previous slice), and `npm run sdd:audit` reports no
     documentation gaps.

R20. `ARTIFACT_INDEX.md` is regenerated by `npm run kms:build-index` after all front-matter edits, and
     `npm run kms:validate` reports zero invalid front-matter.

R21. `CHANGELOG.md` updated (Gate 4).

R22. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
