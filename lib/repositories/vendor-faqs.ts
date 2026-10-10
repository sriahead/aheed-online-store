import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";

/**
 * The per-vendor approved-answer corpus (P10, #1012) — the ONLY DB access for it.
 *
 * NO ANSWER TEXT IS WRITTEN IN THIS FILE, or anywhere else under `lib/`, `components/` or
 * `prisma/seed.ts`. Every row is the vendor's own words, entered on `/staff/faqs`. The platform
 * authoring an answer on a vendor's behalf is exactly the defect #239 fixed and ADR-004 forbids:
 * Aheed sells groceries, SriMart sells electronics, and one authored set serves neither honestly.
 * `#1021` tracks the content itself.
 *
 * A vendor with no active rows gets no FAQ section at all (#239's null-hides rule). There is no
 * platform-authored fallback, which is why `listActiveFaqs` returning `[]` is a normal result
 * rather than a condition to paper over.
 *
 * WHY TWO CLIENT TYPES. `updateFaq`, `setFaqActive` and `reorderFaq` use `updateMany` so the
 * `vendorId` scope sits in the `where` clause rather than in a pre-read — a forged id from another
 * vendor then updates nothing instead of updating their row. `updateMany` crashes UNCONDITIONALLY
 * over the HTTP adapter, even on zero rows (#382, measured again for nested creates in #116), so
 * those three take `DbWs`. Everything else takes `Db`: `findMany`, a singular `create` with no
 * nested writes, and `deleteMany` are all safe on HTTP (CLAUDE.md). Same split, and same reason, as
 * `lib/repositories/brands.ts:158` and `lib/repositories/attributes.ts:230`.
 *
 * Type-only `@/lib/db` import and explicit `prisma`/`vendorId` parameters, per the repository rules
 * enforced by `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface VendorFaqRow {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

const FAQ_SELECT = {
  id: true,
  question: true,
  answer: true,
  sortOrder: true,
  isActive: true,
} as const;

/** Active answers for the storefront, in the vendor's chosen order. */
export async function listActiveFaqs(prisma: Db, vendorId: string): Promise<VendorFaqRow[]> {
  return prisma.vendorFaq.findMany({
    where: { vendorId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    select: FAQ_SELECT,
  });
}

/** Every answer, active or not, for the staff editor. */
export async function listAllFaqs(prisma: Db, vendorId: string): Promise<VendorFaqRow[]> {
  return prisma.vendorFaq.findMany({
    where: { vendorId },
    orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    select: FAQ_SELECT,
  });
}

export interface VendorFaqInput {
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Add an answer.
 *
 * Singular `create` with NO nested writes, so the HTTP client is correct — the rule is "does this
 * open an implicit transaction", and a nested child write would make it several inserts (#116).
 *
 * The input must already have been validated by `parseVendorFaq` in `lib/faq-form.ts`; this layer
 * does no validation of its own, matching the rest of the repository layer's treatment of
 * already-parsed input.
 *
 * A duplicate question for the same vendor violates `@@unique([vendorId, question])`. That is
 * reported, not swallowed, and the caller turns it into a field error — see `isDuplicateFaq` below
 * for why the check cannot be a bare `error.code` comparison.
 */
export async function createFaq(
  prisma: Db,
  vendorId: string,
  input: VendorFaqInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: "DUPLICATE_QUESTION" }> {
  try {
    const created = await prisma.vendorFaq.create({
      data: {
        vendorId,
        question: input.question,
        answer: input.answer,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isDuplicateFaq(error)) return { ok: false, reason: "DUPLICATE_QUESTION" };
    throw error;
  }
}

/**
 * Edit an existing answer.
 *
 * `updateMany`, not `update`: a singular `update` cannot carry a non-unique `vendorId` filter, so
 * another vendor's id would either throw `P2025` or — worse, if the filter were dropped — succeed
 * against their row. `updateMany` puts the tenancy scope in the query and reports a count, so a
 * cross-vendor id is `0` rather than an exception. Requires `DbWs` (see the file docstring).
 *
 * Returns the number of rows changed: `0` means "not this vendor's row, or no longer there".
 */
export async function updateFaq(
  prismaWs: DbWs,
  vendorId: string,
  faqId: string,
  input: VendorFaqInput,
): Promise<{ ok: true; count: number } | { ok: false; reason: "DUPLICATE_QUESTION" }> {
  try {
    const updated = await prismaWs.vendorFaq.updateMany({
      where: { id: faqId, vendorId },
      data: {
        question: input.question,
        answer: input.answer,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    return { ok: true, count: updated.count };
  } catch (error) {
    if (isDuplicateFaq(error)) return { ok: false, reason: "DUPLICATE_QUESTION" };
    throw error;
  }
}

/**
 * Show or hide one answer without deleting it. Vendor-scoped `updateMany`, as above.
 *
 * Separate from `updateFaq` because the staff list toggles visibility from a one-field form and
 * must not have to resubmit the question and answer to do it — resubmitting them is how an edit
 * form silently reverts a concurrent change.
 */
export async function setFaqActive(
  prismaWs: DbWs,
  vendorId: string,
  faqId: string,
  isActive: boolean,
): Promise<number> {
  const updated = await prismaWs.vendorFaq.updateMany({
    where: { id: faqId, vendorId },
    data: { isActive },
  });
  return updated.count;
}

/** Move one answer in the vendor's order. Vendor-scoped `updateMany`, as above. */
export async function reorderFaq(
  prismaWs: DbWs,
  vendorId: string,
  faqId: string,
  sortOrder: number,
): Promise<number> {
  const updated = await prismaWs.vendorFaq.updateMany({
    where: { id: faqId, vendorId },
    data: { sortOrder },
  });
  return updated.count;
}

/**
 * Remove an answer. Vendor-scoped so a forged id from another vendor deletes nothing.
 *
 * `deleteMany` rather than `delete`, exactly as `deleteReviewLink` does: confirmed safe on the HTTP
 * adapter, accepts a non-unique `where` so the tenancy filter goes in the query rather than a
 * pre-read, and a no-match is a zero count rather than a throw.
 */
export async function deleteFaq(prisma: Db, vendorId: string, faqId: string): Promise<number> {
  const result = await prisma.vendorFaq.deleteMany({ where: { id: faqId, vendorId } });
  return result.count;
}

/**
 * Did this error come from the `(vendorId, question)` unique index?
 *
 * Delegates to the shared `isUniqueViolation` (`lib/repositories/prisma-errors.ts`) rather than
 * comparing `error.code` here. That helper exists precisely because the two adapters report the
 * same Postgres unique violation under different codes — raw SQLSTATE `"23505"` from the Neon
 * driver and Prisma's `P2002` — and CLAUDE.md requires any such check to accept both. A local copy
 * would be a second place to get that wrong, which is the reason the helper was extracted.
 */
function isDuplicateFaq(error: unknown): boolean {
  return isUniqueViolation(error);
}
