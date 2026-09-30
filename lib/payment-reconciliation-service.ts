import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  getPaymentReconciliationOutcome,
  listExhaustedPaymentReconciliations,
  rearmPaymentReconciliation,
  type ExhaustedReconciliationRow,
  type ReconciliationOutcome,
} from "@/lib/repositories/payment-reconciliations";

/**
 * Request-scoped facade over `lib/repositories/payment-reconciliations.ts` for
 * the staff side of #945, beside the repository per the location rule
 * `tests/repository-purity.test.ts` enforces. Every caller is a staff page or a
 * staff action arriving on a real host, so the vendor comes from the request.
 *
 * Reads use the HTTP client; `rearm` is an `updateMany`, which needs the
 * WebSocket client (#382). Both are constructed fresh per call and never
 * cached across requests (CLAUDE.md).
 */
export function getPaymentReconciliationService() {
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listExhausted(take: number): Promise<ExhaustedReconciliationRow[]> {
      return listExhaustedPaymentReconciliations(getPrisma(), await vendorId(), take);
    },

    async rearm(orderNumber: string): Promise<boolean> {
      return rearmPaymentReconciliation(getPrismaWs(), await vendorId(), orderNumber, new Date());
    },

    async outcomeFor(orderNumber: string): Promise<ReconciliationOutcome | null> {
      return getPaymentReconciliationOutcome(getPrisma(), await vendorId(), orderNumber);
    },
  };
}
