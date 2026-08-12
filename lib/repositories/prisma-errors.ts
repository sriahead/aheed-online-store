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
 */

/** Unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
