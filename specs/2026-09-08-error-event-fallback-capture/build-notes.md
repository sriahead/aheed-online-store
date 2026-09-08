# P9.2 — Prisma-free ErrorEvent fallback capture (build notes)

Written at the end of Build, before the Clear. Two commits on
`feature/error-event-fallback-capture`: `1e86848` (spec) and `db8dc76` (implementation).

## What changed and why

**`lib/error-event-fallback.ts` (new)** holds the whole exception. It exports three runtime
symbols — `ERROR_EVENT_INSERT_SQL`, `buildErrorEventInsertParams` and `recordErrorEventDirect` —
because the statement's shape is the part most likely to be wrong and the part a database is least
needed to check. Splitting the constant and the parameter builder out of the executor is what lets
`tests/error-event-fallback.test.ts` assert the placeholder count, the column order and the
deliberate absence of `createdAt` with no I/O at all.

Two column facts drove the design and are invisible from `schema.prisma` alone; both come from
`prisma/migrations/20260901040953_error_event_log/migration.sql`. **`id` is `TEXT NOT NULL` with no
database default** — Prisma mints that uuid client-side, so a raw insert omitting it fails on a
not-null violation. **`createdAt` carries `DEFAULT CURRENT_TIMESTAMP`**, so it is deliberately not
in the statement and the database stamps it. Getting either backwards passes every unit test and
fails on the first real insert, which is exactly why R15/R16 exist.

**`lib/repositories/error-events.ts`** gained an exported pure `buildErrorEventRow`, and
`recordErrorEvent` now calls it instead of inlining the field mapping. There are two write paths
now and they must truncate and strip identically, or the same error is recorded differently
depending on which one survived. `MESSAGE_MAX`, `STACK_MAX` and `stripQuery` stay declared once,
in that file; the fallback imports rather than re-implements them. The file stays compliant with
both repository tests — the new export is pure and takes no client.

**`instrumentation.ts`** hoists the normalised payload into a `const` so the same object reaches
both paths (R12 compares them by identity of content), keeps the Prisma write as the normal path,
and calls the fallback only from the existing `catch`.

**`scripts/verify-error-event-fallback.ts` (new)** is the only thing that can answer "does Postgres
accept this statement". It calls the real `recordErrorEventDirect` with no injected executor, so it
exercises the same `readEnv`-resolving path the Worker takes, then reads the row back column by
column, deletes it, and asserts the table's row count is unchanged. It runs in plain Node under
`tsx`, which is itself the design claim: Node cannot load the WASM query compiler at all, so a
fallback that touched it would die here rather than write a row.

**Docs.** The exception is recorded in `CLAUDE.md`'s schema rules and at both places
`specs/architecture.md` states the no-raw-SQL rule (version `1.26.0` to `1.27.0`). All three say
the same scope: one parameterised INSERT, one table, error path only, do not widen.

## Decisions taken during the build

**`readEnv("DATABASE_URL")` rather than `getEnv()`.** The spec called for it and the reason is
worth repeating here: `getEnv()` runs `schema.parse` over the entire `AppEnv` and throws when any
_unrelated_ variable is missing. In a path that only runs because something already failed, that is
a second way to fail, and it is the same trap `CLAUDE.md` records for `getPaymentEnv()`.

**Dependency injection over module mocking.** `recordErrorEventDirect` takes an optional
`ErrorEventFallbackDeps` with `readConnectionString` and `execute`. Rejected: `vi.mock`-ing
`@neondatabase/serverless` in the test file. Injection makes both failure modes — a synchronous
throw and a rejected promise — trivially expressible, and it is what lets the verification script
run the *un*-injected path so the test double and the real thing are visibly different code paths.

**A plain string for the SQL constant, not a template literal.** No substitution is possible in
either, but a template literal invites one to be added later, and R3 asks the statement to carry no
interpolation. A single-quoted string makes the embedded double-quoted identifiers read cleanly.

**`sql.query(text, params)` rather than the tagged-template form.** The tagged form parameterises
correctly too, but the numbered-placeholder form keeps the statement inspectable as a constant,
which is what R3 and R4 check. It also reads unambiguously as parameterised to anyone auditing the
one raw statement in the codebase.

**Reused `parseEnvFile` instead of copying `readVar`.** The two existing `verify-*` scripts each
carry a hand-rolled secrets reader — the duplication filed as **#645**, which was milestoned into
P9.2 earlier the same day. A third copy would have deepened an open defect while it sat on the
board. `parseEnvFile` throws on a missing file where `readVar` returns `undefined`, so the local
`readSecret` wrapper restores that behaviour in three lines.

**Log label on fallback failure.** `Failed to persist ErrorEvent via fallback:` — deliberately
distinct from the existing `Failed to persist ErrorEvent:` so the two are separable in Workers
Logs. On a `false` return the second argument is the payload (there is no error object to log); on
a thrown one it is the error.

## Deviations from the spec

**One, and it is an expansion of R13 rather than a departure from it.** R13 requires
`onRequestError` not to reject "when both the Prisma write and the fallback fail", where the
fallback failing means returning `false`. While writing the tests I added a case for the fallback
_throwing_ — breaking its own documented contract — and found the implementation would propagate
it, because the `await` sits inside the `catch`. Rather than delete the test I wrapped the fallback
call in its own `try/catch`.

Justification: a throwing fallback is a way of failing, so this is within R13's plain meaning, and
the handler's one hard guarantee is that it never compounds the error it was called about. The cost
is three lines and one branch that `recordErrorEventDirect`'s own tests say is unreachable. It is
recorded here rather than left for validation to find as an unexplained extra branch.

**Also worth flagging, though not a deviation:** two rows in `validation.md` were corrected during
Build. R2's and R7's greps matched the new file's own docstring — which explains why it does not
build a Prisma client and why it avoids `getEnv()` — and so would have reported a false failure to
a fresh-context validator. Both now carry a `^[^*/]*` comment-excluding prefix and a note saying
the prefix is load-bearing. The requirements themselves are unchanged; only the commands that check
them were wrong.

## Known-shaky areas

**R15 and R16 have not been run. No live database check happened in this session at all.** They are
the only rows that touch Postgres and they are the only rows that can catch the `id`/`createdAt`
mistakes described above. Run them first, and read `validation.md`'s note about not piping the
script through `head` — it creates a real row and deletes it in its own cleanup section.

**The WASM panic itself is not reproduced anywhere, by design.** Nothing available can force
`new QueryCompiler(...)` to fail on demand. The claim is decomposed: unit tests prove the wiring
fires whenever the Prisma write throws _for any reason_, and the live script proves the fallback
writes correctly from a WASM-free runtime. If validation wants the real thing end to end, it cannot
have it — do not accept a fabricated stand-in as equivalent.

**The fallback has never executed inside a Worker.** Everything proving it works runs in Node
(`vitest`, `tsx`). `neon()` is `fetch`-based and this codebase already uses `@neondatabase/serverless`
under workerd through the Prisma adapter, so the risk is low — but "low" is not "checked". If a
validator has `npm run preview` up anyway, forcing any route to throw and confirming a row lands is
worth the few minutes, though no requirement demands it.

**`crypto.randomUUID()` is assumed present in both runtimes.** True on Node 22 and on workerd, and
the unit tests exercise it on Node. Nothing here checks it under workerd.

**Nothing mechanically prevents a second raw SQL statement from being added.** The exception is
held by prose in `CLAUDE.md` and `architecture.md` — which is precisely the enforcement model the
previous slice replaced with a filesystem-walking test, for exactly this reason. Filed as **#676**
rather than built here, since the spec did not ask for it and it is a repo-wide guard rather than
part of this fix.
