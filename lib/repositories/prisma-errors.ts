/**
 * Prisma error-code predicates, shared across repositories.
 *
 * The code is the contract, not the error class: `@prisma/client/wasm`'s error
 * constructors are not reliably `instanceof`-able here, so every call site reads
 * `error.code` instead. That made the check easy to copy — which is exactly why
 * it now lives in one place.
 *
 * Extracted from `lib/repositories/discounts.ts` at P6b1 (#159), where the
 * catalogue writes needed the same P2002 check for `@@unique([vendorId, slug])`.
 * A second copy of a magic string is how two call sites drift.
 *
 * P8.5c `/validate` (2026-08-25, #347) found this checked only `P2002` — Prisma's
 * own normalised code, which is what `getPrismaWs()`'s WebSocket adapter
 * (`PrismaNeon`) throws. `getPrisma()`'s HTTP adapter (`PrismaNeonHttp`) — used
 * for ~99% of writes app-wide per CLAUDE.md's hybrid strategy, including every
 * `create()` this helper guards — throws the same `PrismaClientKnownRequestError`
 * but with the RAW POSTGRES SQLSTATE, `"23505"`, on its `.code` instead. A
 * duplicate-slug create through the HTTP adapter therefore rethrew uncaught
 * (confirmed live: `lib/repositories/bundles.ts`'s `upsertBundle` 500ed on a
 * real duplicate-slug submission) — this predicate is the only thing standing
 * between that and a handled form error, for every caller, not just bundles.
 */

const UNIQUE_VIOLATION_CODES = new Set(["P2002", "23505"]);

/** Unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    UNIQUE_VIOLATION_CODES.has(error.code)
  );
}
