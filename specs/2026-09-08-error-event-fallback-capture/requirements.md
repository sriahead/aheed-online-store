# P9.2 — Prisma-free ErrorEvent fallback capture (requirements / acceptance criteria)

Closes **#674**. `instrumentation.ts`'s `onRequestError` records an unhandled request error by
writing an `ErrorEvent` row through `getPrismaUncached()`, which builds a fresh `PrismaClient` and
therefore a fresh WASM `QueryCompiler`. When the original error _is_ a query-compiler construction
failure, the recorder re-enters the code path that just threw and is guaranteed to fail — so the
one class of error most likely to take the site down is the one class that cannot be recorded, and
`#437`'s alerting (which counts rows in this table) is blind to it. This slice adds a second,
`fetch`-based write path that involves no WASM at all, as a narrow and explicitly documented
exception to the no-raw-SQL rule. Builds on `plan.md`; no schema change and no migration.

R1. `lib/error-event-fallback.ts` exists and has exactly three **runtime** exports:
`ERROR_EVENT_INSERT_SQL` (a string), `buildErrorEventInsertParams` (a pure function) and
`recordErrorEventDirect` (an async function). Type-only exports are erased at runtime and are
neither required nor forbidden by this requirement.

R2. `lib/error-event-fallback.ts` contains no import statement for `@prisma/client`,
`@prisma/client/wasm`, or `@/lib/db`, and no call expression naming `getPrisma`, `getPrismaWs` or
`getPrismaUncached`.

R3. `ERROR_EVENT_INSERT_SQL` names the table `ErrorEvent` and no other table, contains exactly the
eight numbered placeholders `$1` through `$8` and no other placeholder, and contains no template
substitution or string concatenation of any value.

R4. `ERROR_EVENT_INSERT_SQL` names exactly these eight columns, in this order: `id`, `digest`,
`message`, `stack`, `path`, `method`, `routerKind`, `routeType`. It does **not** name `createdAt`.

R5. `buildErrorEventInsertParams` returns an array of exactly 8 elements whose first element is a
string matching the RFC 4122 UUID form, and returns a different first element on two successive
calls with identical input.

R6. `lib/repositories/error-events.ts` exports one pure function that produces the truncated,
query-stripped field values for a row, and both `recordErrorEvent` and
`buildErrorEventInsertParams` obtain their field values from it. The cap constants `MESSAGE_MAX`
and `STACK_MAX` are declared in exactly one file under `lib/`, namely
`lib/repositories/error-events.ts`, and `lib/error-event-fallback.ts` declares neither.

R7. `recordErrorEventDirect` resolves its connection string via `readEnv("DATABASE_URL")` and not
via `getEnv()`; `lib/error-event-fallback.ts` contains no call expression naming `getEnv`.

R8. `recordErrorEventDirect` returns `false` and does not throw or reject when the connection
string is absent, and does not attempt a query in that case.

R9. `recordErrorEventDirect` returns `false` and does not throw or reject when its SQL executor
throws synchronously, and when its SQL executor returns a rejected promise.

R10. `recordErrorEventDirect` returns `true` and issues exactly one query — one call to the
injected executor — when the executor resolves. It issues no retention-sweep statement and no
second statement of any kind.

R11. `instrumentation.ts`'s `onRequestError` does not call `recordErrorEventDirect` when the
Prisma write resolves.

R12. `instrumentation.ts`'s `onRequestError` calls `recordErrorEventDirect` exactly once, with the
same normalised payload passed to the Prisma path, when the Prisma write rejects.

R13. `onRequestError` resolves to `undefined` and does not reject when both the Prisma write and
the fallback fail, and `console.error` is called for the original error, for the Prisma write
failure, and for the fallback failure.

R14. `scripts/verify-error-event-fallback.ts` exists, imports `checkDestructiveTarget` from
`@/lib/db-target-guard`, and refuses to run against a staging or production connection string.

R15. Running `npx tsx scripts/verify-error-event-fallback.ts` against the dev database exits 0,
having inserted a real `ErrorEvent` row through `recordErrorEventDirect`, read it back with every
one of the eight column values matching what was supplied, and deleted it — leaving the table's
row count unchanged from before the run.

R16. The run in R15 completes in plain Node without any WASM loader error — its output contains
no occurrence of `ERR_UNKNOWN_FILE_EXTENSION` and no occurrence of `.wasm`.

R17. `CLAUDE.md`'s schema-rules section states that `lib/error-event-fallback.ts` is a permitted
exception to the no-raw-SQL rule, on one line naming both the file and the words `raw SQL`, and
states the exception's scope.

R18. `specs/architecture.md` records the same exception at both places it states the no-raw-SQL
rule, and its front-matter `version` is greater than it was before this slice.

R19. `npm run kms:validate` exits 0, and `npm run kms:check-generated` reports the generated
artefacts as current.

R20. `CHANGELOG.md` is updated on this branch (Gate 4).

R21. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all remain
green after this slice.

<!--
  Numbering note: R1..R21, no lettered sub-requirements at Spec time. R15/R16 are the only rows
  needing a real database; everything else is a unit test, a source-level check or a doc check.
  R21 is the Gate-3 catch-all and R20 is Gate 4, per the template convention.
-->
