import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createCode,
  deactivateCode,
  listCodes,
  type CodeListRow,
  type CreateCodeInput,
} from "@/lib/repositories/discounts";

/**
 * Request-scoped facade for the discount-code admin pages (#252, #409).
 *
 * Lives beside, not inside, `lib/repositories/discounts.ts`: that module's
 * concurrency guarantees are its most important property, and they can only be
 * proven from a plain `tsx` script because every export there takes `prisma`
 * and `vendorId` explicitly. A context-resolving factory in the same file would
 * be a second entry point into those exports and would break the property for
 * the whole module. `tests/repository-purity.test.ts` enforces the location, and
 * `tests/repository-client-injection.test.ts` enforces that no export there
 * resolves a client of its own.
 *
 * That "every export takes `prisma`" claim was false when it was first written:
 * `createCodeForVendor` and `deactivateCodeForVendor` lived in the repository and
 * resolved Prisma themselves. They are the two write functions below now (#409).
 *
 * Not to be confused with `lib/discounts.ts`, which holds the pure evaluation
 * rules and touches no database at all.
 *
 * Constructs Prisma fresh per call — a cached client cannot cross a Workers
 * request boundary (CLAUDE.md).
 */
export function getDiscountRepository() {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async list(): Promise<CodeListRow[]> {
      return listCodes(prisma, await vendorId());
    },
  };
}

/**
 * Admin write entry points for `features/admin/discount-codes.ts`.
 *
 * `vendorId` is a parameter, not resolved here: it comes from the caller's
 * `requireVendorRole`, which derives it from the request host and never from the
 * submitted form.
 *
 * These live here rather than in the repository because ADR-004 slice 2's
 * `no-restricted-imports` rule forbids `@/lib/db` in `features/` — a server
 * action physically cannot hand a client in, so `lib/` is where one is legally
 * resolved.
 */
export async function createCodeForVendor(
  vendorId: string,
  input: CreateCodeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return createCode(getPrisma(), vendorId, input);
}

export async function deactivateCodeForVendor(vendorId: string, codeId: string): Promise<number> {
  // getPrismaWs(), not getPrisma(): deactivateCode's updateMany needs a
  // transaction-capable client — PrismaNeonHttp can't execute the one Prisma 6's
  // client-side query compiler opens internally for updateMany (#382).
  return deactivateCode(getPrismaWs(), vendorId, codeId);
}
