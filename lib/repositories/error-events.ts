import type { getPrisma } from "@/lib/db";

/**
 * Server-side capture for the global error boundary (#508). See `plan.md` for why this table
 * has no vendor relation and why the write path uses `getPrismaUncached()` rather than the
 * memoized `getPrisma()`/`getPrismaWs()`.
 */

const MESSAGE_MAX = 2000;
const STACK_MAX = 8000;

/** Once in ~100 writes, also sweep rows older than RETENTION_MS — same pattern as
 *  lib/repositories/order-lookup-rate-limit.ts (added by #468 after an identical table shipped
 *  with no sweep and grew unbounded). */
const SWEEP_PROBABILITY = 0.01;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `onRequestError`'s `error` parameter is typed `unknown`, not `Error` — whatever a render, a
 * route handler or a Server Action actually threw. Extracts what a real `Error` instance would
 * carry, and degrades safely for anything else that was thrown instead.
 */
export function normalizeCaughtError(error: unknown): {
  message: string;
  stack: string | null;
  digest: string | null;
} {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest;
    return {
      message: error.message,
      stack: error.stack ?? null,
      digest: typeof digest === "string" ? digest : null,
    };
  }
  return { message: String(error), stack: null, digest: null };
}

/** Strips a query string so a value carried in one (an email, a search term) never lands here. */
function stripQuery(path: string): string {
  const i = path.indexOf("?");
  return i === -1 ? path : path.slice(0, i);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export interface RecordErrorEventInput {
  message: string;
  stack: string | null;
  digest: string | null;
  path: string;
  method: string;
  routerKind: string;
  routeType: string;
}

/** The stored column values for one row: truncated, query-stripped, ready to insert. */
export type ErrorEventRow = RecordErrorEventInput;

/**
 * Turns a caught error's fields into the values actually stored (#674).
 *
 * Pure and exported because there are now TWO write paths — this module's
 * Prisma `create`, and `lib/error-event-fallback.ts`'s fetch-based insert for
 * when Prisma itself is the thing that failed. They must truncate and strip
 * identically or the same error is recorded differently depending on which path
 * happened to survive, so `MESSAGE_MAX`, `STACK_MAX` and `stripQuery` stay
 * declared here, once, and the fallback calls this rather than re-implementing
 * them.
 */
export function buildErrorEventRow(input: RecordErrorEventInput): ErrorEventRow {
  return {
    message: truncate(input.message, MESSAGE_MAX),
    stack: input.stack === null ? null : truncate(input.stack, STACK_MAX),
    digest: input.digest,
    path: stripQuery(input.path),
    method: input.method,
    routerKind: input.routerKind,
    routeType: input.routeType,
  };
}

export async function recordErrorEvent(
  prisma: ReturnType<typeof getPrisma>,
  input: RecordErrorEventInput,
): Promise<void> {
  await prisma.errorEvent.create({
    data: buildErrorEventRow(input),
  });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.errorEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
}

export async function listRecentErrorEvents(prisma: ReturnType<typeof getPrisma>, limit: number) {
  return prisma.errorEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Counts errors recorded since `since` (P9.2, #437 — the detection half).
 *
 * The read side of a table that, until now, was only ever written to and
 * rendered a page at a time. `evaluateErrorRate` in `lib/error-rate.ts` turns
 * this number into a decision; this function knows nothing about thresholds.
 *
 * Deliberately unscoped by vendor, matching the rest of this module: the
 * `ErrorEvent` model carries no vendor relation at all (see `plan.md` for #508's
 * reasoning — an unhandled request error may occur before a vendor has been
 * resolved, so there is often no correct value to record).
 */
export async function countRecentErrorEvents(
  prisma: ReturnType<typeof getPrisma>,
  since: Date,
): Promise<number> {
  return prisma.errorEvent.count({
    where: { createdAt: { gte: since } },
  });
}
