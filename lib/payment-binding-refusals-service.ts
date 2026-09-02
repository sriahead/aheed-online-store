import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  findBindingRefusalForVendor,
  listBindingRefusalsForVendor,
  recordRefusalResolution,
  type BindingRefusalRow,
  type RefusalRecoveryTarget,
} from "@/lib/repositories/payment-binding-refusals";

/**
 * Request-scoped facade over `lib/repositories/payment-binding-refusals.ts`
 * (#454), living BESIDE the repository rather than inside it — the location rule
 * `tests/repository-purity.test.ts` enforces, so every function in the
 * repository itself stays runnable from a plain `tsx` script.
 *
 * Vendor-scoped, unlike the webhook write path in `lib/orders-service.ts`. Every
 * caller here is a staff page or a staff action arriving on a real host, so
 * there IS a vendor to scope by, and the un-scoped exemption the recording path
 * needs does not extend to reading or resolving.
 *
 * Constructs its client fresh per call and never caches it across requests
 * (CLAUDE.md).
 */
export function getBindingRefusalService() {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async list(take: number): Promise<BindingRefusalRow[]> {
      return listBindingRefusalsForVendor(prisma, await vendorId(), take);
    },

    async find(id: string): Promise<RefusalRecoveryTarget | null> {
      return findBindingRefusalForVendor(prisma, await vendorId(), id);
    },

    async recordResolution(id: string, resolution: string, detail: string): Promise<void> {
      return recordRefusalResolution(prisma, await vendorId(), id, resolution, detail);
    },
  };
}
