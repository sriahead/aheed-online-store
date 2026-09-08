---
id: p9-2-error-event-fallback-capture-plan
title: "P9.2 — Prisma-free ErrorEvent fallback capture (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-08
visibility: internal
summary: "Closes #674. A failure inside Prisma's WASM query compiler defeats the recorder meant to record it, because that recorder builds a new compiler. Adds a fetch-based fallback write as a narrow, documented exception to the no-raw-SQL rule. No schema change."
tags: [p9, observability, instrumentation, prisma, resilience]
# related: [architecture, roadmap]
---

# P9.2 — Prisma-free ErrorEvent fallback capture (plan)

**Goal:** make an unhandled request error recordable even when the failure is inside Prisma's own
WASM query compiler — the one class of error the current recorder is structurally guaranteed to
lose. Shipping this means a second occurrence of `#674` produces evidence instead of another
silence, and it closes a hole in the substrate `#437`'s production alerting reads from.

## Why this is not a one-off incident cleanup

On 2026-09-08 a single real production request to the storefront homepage returned 500, and
`instrumentation.ts`'s `onRequestError` then failed to record it with an identical stack. The
issue as filed treated that second failure as plausibly incidental. It is not.

Mapping the reported stack frame-by-frame onto `node_modules/.prisma/client/query_compiler_bg.js`
(Prisma 6.19.3's generated wasm-bindgen bindings) identifies every frame:

| Reported frame | Binding |
|---|---|
| `at new E2` | `class E` — `QueryCompiler`; its constructor body is `o.querycompiler_new(t)` |
| three `wasm-function` frames | inside `querycompiler_new` |
| `at K` | `__wbindgen_string_get` — wasm calling back into JS for a string |
| `at x2` | `passStringToWasm` |
| `at Uint8Array.subarray` | `l().subarray(g, g + i.length).set(i)` inside that function |

`E` becoming `E2` and `x` becoming `x2` are ordinary bundler renames on collision.

So the panic is in **constructing** the query compiler, not in running a query. And
`instrumentation.ts` records failures via `recordErrorEvent(getPrismaUncached(), ...)`, where
`getPrismaUncached()` builds a **brand-new** `PrismaClient` and therefore a brand-new
`QueryCompiler`. The recorder re-enters the exact code path that just threw. For this whole class
of error it cannot succeed — the lost row was not bad luck.

That matters past this one request because `#437`'s detection half counts rows in this same table
(`countRecentErrorEvents`). Production error-rate alerting is blind, by construction, to the
failure class most likely to take the whole site down — inside the phase whose stated objective is
to make production observable.

**Scope (this slice):**

- **`lib/error-event-fallback.ts`** (new). Writes one `ErrorEvent` row through
  `@neondatabase/serverless`'s `neon()` HTTP client — already an exact-pinned dependency at
  `1.1.0`, `fetch`-based, and involving no WASM query compiler at any point. It exports the SQL
  text and a pure parameter builder alongside the executor, so the shape of the statement is
  unit-testable without a database.
- **It lives at `lib/` root, not in `lib/repositories/`**, and that is deliberate rather than
  incidental. It resolves its own connection string, which is exactly the property `CLAUDE.md`'s
  repository-layer rule says belongs in a sibling module _beside_ `lib/repositories/`, never
  inside it — and `tests/repository-client-injection.test.ts` walks that directory from the
  filesystem, so putting it there would fail on sight.
- **It reads `readEnv("DATABASE_URL")` directly, never `getEnv()`.** `getEnv()` runs
  `schema.parse` across the entire `AppEnv` and throws when any _unrelated_ variable is absent or
  invalid. In a path that only runs because something already failed, that is a second, wholly
  avoidable way to fail — the same trap `CLAUDE.md` records for `getPaymentEnv()`, where a
  throwing accessor made a caller's own graceful branch dead code.
- **The fallback supplies its own `id`.** `20260901040953_error_event_log/migration.sql` declares
  the id column as `TEXT NOT NULL` with **no database default** — Prisma generates that uuid
  client-side, so a raw insert omitting it fails on a not-null violation. `createdAt` is the
  opposite case (it does carry a default) and is deliberately omitted so the database stamps it.
- **Truncation is shared, not re-implemented.** `lib/repositories/error-events.ts` gains one
  exported pure function producing the row's field values; both write paths call it. The 2000 and
  8000 character caps and the query-string strip exist in exactly one place.
- **`instrumentation.ts`** keeps the Prisma write as the normal path and calls the fallback only
  when it throws. Its existing contract — never compound the original error, never reject —
  extends to the fallback, whose own failure logs and stops.
- **`scripts/verify-error-event-fallback.ts`**, guarded by `lib/db-target-guard.ts`'s
  `checkDestructiveTarget` and following `scripts/verify-guest-cart-reaper.ts`'s shape: creates a
  real row against the dev database, reads it back, deletes it.
- **The exception is written down where it will be found** — `CLAUDE.md`'s schema rules and both
  places `specs/architecture.md` states the no-raw-SQL rule.

## Why raw SQL here, and how narrow the exception actually is

There is no raw SQL anywhere in `app/`, `lib/` or `features/` today; the only two `$queryRaw`
mentions in the tree are comments explaining that it is banned. This slice is the first exception
and is treated as one.

The rule's stated purpose in `architecture.md` section 3.1 is that `schema.prisma` stays the
single source of truth for the data model and that queries stay portable. Neither is weakened
here: the model is still declared in Prisma, the migration still creates the table, and the
statement is a single parameterised `INSERT` naming columns Prisma already describes. What the
rule actually protects against — an injection surface and a portability trap at request time — is
addressed by using `sql.query(text, params)` with numbered placeholders and no interpolation of
any value.

It is worth being precise about what this exception is **not**. `architecture.md`'s
compare-and-set bullet says a guard column counts in whichever direction Prisma can express,
"which raw SQL is not permitted to rescue". That sentence is about contended writes on the hot
path and is untouched here: this is an insert into an append-only diagnostic table with no vendor
relation, reachable only from an error handler.

**Deliberately excluded:**

- **The WASM panic itself.** One occurrence, cause inside Prisma's compiled WASM, nothing here can
  fix it, and there is not enough evidence to justify guessing. Retrying client construction was
  considered at `/propose` and rejected: it would add a code path we cannot test, resting on a
  mechanism we have not established. This slice makes the failure recordable, not impossible.
- **Any change to the normal Prisma write path.** `recordErrorEvent` keeps its behaviour and its
  opportunistic retention sweep. The fallback deliberately performs **no** sweep — it runs only
  when the database path is already degraded, and issuing a second statement there is the wrong
  instinct, so the module sends exactly one statement per call.
- **Routing any other caller through the fallback.** `listRecentErrorEvents`,
  `countRecentErrorEvents` and the `/staff/errors` page are unchanged. This is a write-path
  resilience fix, not a migration away from Prisma.
- **Widening the exception.** No second raw statement, no general-purpose raw-SQL helper, and
  nothing exported that would make the next raw query easier to add without its own argument.
- **`#437`'s remaining work.** Making this table trustworthy is a prerequisite for alerting on it,
  not the alerting itself; the outbound channel stays blocked on `#104`.

**Open items carried forward:**

- **`#674` closes on this slice's observability half**, which is what it was milestoned into P9.2
  for. If the panic recurs, the row this slice makes possible is the evidence a genuine
  root-cause slice would need, and that slice needs its own `/propose`.
- **`#246`** — Workers Logs retention is still unconfirmed, which is precisely why a durable
  database row is worth having rather than relying on the `console.error` trail alone.
- **PR #675's roadmap change-log row** is pending carry-forward from the previous promotion and
  must land on this slice's branch, per `sdd:audit`.
