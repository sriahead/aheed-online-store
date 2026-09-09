import { neon } from "@neondatabase/serverless";
import { readEnv } from "@/lib/config";
import { buildErrorEventRow, type RecordErrorEventInput } from "@/lib/repositories/error-events";

/**
 * A write path for `ErrorEvent` that does not go through Prisma at all (#674).
 *
 * WHY THIS EXISTS. `instrumentation.ts` records an unhandled request error via
 * `recordErrorEvent(getPrismaUncached(), ...)`, and `getPrismaUncached()` builds
 * a brand-new `PrismaClient` — therefore a brand-new WASM `QueryCompiler`. On
 * 2026-09-08 a production request 500'd with a panic inside that constructor,
 * and the recorder then failed with the identical stack. That is not bad luck:
 * for any error originating in query-compiler construction the recorder
 * re-enters the exact code path that just threw, so it can never succeed. The
 * row is lost precisely when it matters most, and `#437`'s alerting counts rows
 * in this same table.
 *
 * `@neondatabase/serverless`'s `neon()` client is `fetch`-based. It loads no
 * WASM, builds no query compiler, and shares no code with the path that failed —
 * which is the entire reason it can act as a fallback rather than a retry.
 *
 * THIS IS A DELIBERATE, NARROW EXCEPTION TO THE NO-RAW-SQL RULE, and the only
 * one in the codebase. Its scope: one parameterised INSERT, one table
 * (`ErrorEvent`, which carries no vendor relation), reachable only from
 * `onRequestError`'s fallback branch. The rule's purpose — `schema.prisma` stays
 * the source of truth, queries stay portable, no injection surface — is intact:
 * the model is still declared in Prisma, the migration still creates the table,
 * and every value travels as a numbered placeholder via `sql.query`, never
 * interpolated. Do not widen this into a general-purpose raw-SQL helper; a
 * second raw statement needs its own argument, not this file's precedent.
 *
 * It takes its dependencies as optional injected functions so the whole
 * contract — including both failure modes — is unit-testable with no database,
 * and so a plain `tsx` script can exercise the real thing against real Postgres
 * (`scripts/verify-error-event-fallback.ts`).
 */

/**
 * The insert, as a constant so its shape can be asserted without a database.
 *
 * `id` is supplied explicitly and is NOT optional: the migration declares it
 * `"id" TEXT NOT NULL` with **no** database default, because Prisma generates
 * that uuid client-side. Omitting it here would fail on a not-null violation.
 * `createdAt` is the opposite case — it carries `DEFAULT CURRENT_TIMESTAMP`, so
 * it is deliberately absent and the database stamps it.
 */
export const ERROR_EVENT_INSERT_SQL =
  'INSERT INTO "ErrorEvent" ("id", "digest", "message", "stack", "path", "method", "routerKind", "routeType") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';

/**
 * The ordered parameters for `ERROR_EVENT_INSERT_SQL`. Pure apart from the uuid.
 *
 * Field values come from `buildErrorEventRow`, the same function the Prisma path
 * uses, so both paths truncate and strip identically.
 */
export function buildErrorEventInsertParams(input: RecordErrorEventInput): unknown[] {
  const row = buildErrorEventRow(input);
  return [
    crypto.randomUUID(),
    row.digest,
    row.message,
    row.stack,
    row.path,
    row.method,
    row.routerKind,
    row.routeType,
  ];
}

export interface ErrorEventFallbackDeps {
  /** Resolves the connection string. Injected only by tests. */
  readConnectionString?: () => string | undefined;
  /** Executes the statement. Injected by tests and by the verification script. */
  execute?: (sql: string, params: unknown[]) => Promise<unknown>;
}

/**
 * Writes one `ErrorEvent` row without Prisma. Returns whether it landed.
 *
 * NEVER THROWS AND NEVER REJECTS, for any reason. This runs inside an error
 * handler that already has one failure in flight; a second thrown error here
 * would compound the original rather than record it. Every failure — no
 * connection string, a rejected query, a synchronous throw from the driver —
 * degrades to `false` and the caller decides what to log.
 *
 * Reads `readEnv("DATABASE_URL")` rather than `getEnv()` on purpose. `getEnv()`
 * parses the entire `AppEnv` schema and throws when any *unrelated* variable is
 * missing or invalid, which in a path that only runs because something already
 * broke is a second, wholly avoidable way to fail — the same trap `CLAUDE.md`
 * records for `getPaymentEnv()`, where a throwing accessor made a caller's own
 * graceful branch unreachable.
 *
 * Issues exactly one statement. It deliberately performs no retention sweep,
 * unlike `recordErrorEvent`: this path runs only when the database route is
 * already degraded, so adding a second statement is the wrong instinct.
 */
export async function recordErrorEventDirect(
  input: RecordErrorEventInput,
  deps: ErrorEventFallbackDeps = {},
): Promise<boolean> {
  try {
    const connectionString = (deps.readConnectionString ?? (() => readEnv("DATABASE_URL")))();
    if (!connectionString) return false;

    const execute =
      deps.execute ??
      ((sql: string, params: unknown[]) => neon(connectionString).query(sql, params));

    await execute(ERROR_EVENT_INSERT_SQL, buildErrorEventInsertParams(input));
    return true;
  } catch {
    return false;
  }
}
