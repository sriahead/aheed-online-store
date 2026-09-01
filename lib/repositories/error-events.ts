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

export async function recordErrorEvent(
  prisma: ReturnType<typeof getPrisma>,
  input: RecordErrorEventInput,
): Promise<void> {
  await prisma.errorEvent.create({
    data: {
      message: truncate(input.message, MESSAGE_MAX),
      stack: input.stack === null ? null : truncate(input.stack, STACK_MAX),
      digest: input.digest,
      path: stripQuery(input.path),
      method: input.method,
      routerKind: input.routerKind,
      routeType: input.routeType,
    },
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
