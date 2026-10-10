import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createFaq,
  deleteFaq,
  listActiveFaqs,
  listAllFaqs,
  reorderFaq,
  setFaqActive,
  updateFaq,
  type VendorFaqInput,
  type VendorFaqRow,
} from "@/lib/repositories/vendor-faqs";

/**
 * Request-scoped wrapper around `lib/repositories/vendor-faqs.ts` (P10, #1012).
 *
 * WHY BOTH CLIENTS APPEAR HERE. The three edit operations use `updateMany` so the `vendorId` scope
 * can sit in the `where` clause, and `updateMany` crashes unconditionally over the HTTP adapter —
 * even on zero rows (#382). They therefore get `getPrismaWs()`, and only they do; the reads, the
 * singular childless `create` and the `deleteMany` stay on `getPrisma()`. Keeping the websocket
 * client off the read path is what holds an isolate under its socket limit, which is the whole
 * point of the hybrid rule rather than defaulting everything to the websocket client.
 *
 * BOTH CLIENTS ARE CONSTRUCTED FRESH ON EVERY CALL and never cached across requests — including
 * inside this wrapper, which is exactly the shape CLAUDE.md names as the trap. `vendorId` is
 * memoised per returned object, which is per call, not per isolate.
 */
export interface VendorFaqRepository {
  listActive(): Promise<VendorFaqRow[]>;
  listAll(): Promise<VendorFaqRow[]>;
  create(input: VendorFaqInput): Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  update(
    faqId: string,
    input: VendorFaqInput,
  ): Promise<{ ok: true; count: number } | { ok: false; reason: string }>;
  setActive(faqId: string, isActive: boolean): Promise<number>;
  reorder(faqId: string, sortOrder: number): Promise<number>;
  remove(faqId: string): Promise<number>;
}

export function getVendorFaqRepository(): VendorFaqRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listActive() {
      return listActiveFaqs(prisma, await vendorId());
    },

    async listAll() {
      return listAllFaqs(prisma, await vendorId());
    },

    async create(input) {
      return createFaq(prisma, await vendorId(), input);
    },

    async update(faqId, input) {
      return updateFaq(getPrismaWs(), await vendorId(), faqId, input);
    },

    async setActive(faqId, isActive) {
      return setFaqActive(getPrismaWs(), await vendorId(), faqId, isActive);
    },

    async reorder(faqId, sortOrder) {
      return reorderFaq(getPrismaWs(), await vendorId(), faqId, sortOrder);
    },

    async remove(faqId) {
      return deleteFaq(prisma, await vendorId(), faqId);
    },
  };
}
