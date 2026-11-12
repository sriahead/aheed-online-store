"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { bulkSetInventoryQuantities } from "@/lib/products-service";
import {
  describeBulkQuantityResult,
  parseBulkQuantityForm,
  type BulkQuantityState,
} from "@/lib/bulk-quantity";

/**
 * #1523 — "Save quantities" on /staff/products. STAFF and ADMIN, the same roles as the inventory
 * quick update (/staff/inventory) and as the page itself. The vendor comes from the session, never
 * from the form; the repository scopes every id to it.
 *
 * "use server": this file may export ONLY async functions (CLAUDE.md). The form contract, state and
 * parser live in lib/bulk-quantity.ts.
 */
export async function saveBulkQuantities(
  _prev: BulkQuantityState,
  formData: FormData,
): Promise<BulkQuantityState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    return {
      status: "error",
      message:
        auth.status === 401
          ? "Your session has expired. Sign in again."
          : "Your account cannot change stock for this store.",
    };
  }

  const parsed = parseBulkQuantityForm(formData.entries());
  if (!parsed.ok) return { status: "error", message: parsed.error };
  if (parsed.updates.length === 0) {
    return { status: "error", message: "No quantities were changed." };
  }

  try {
    const result = await bulkSetInventoryQuantities(auth.vendorId, parsed.updates);
    revalidatePath("/staff/products");
    revalidatePath("/staff/inventory");
    revalidatePath("/");
    return {
      status: "ok",
      message: describeBulkQuantityResult({ ...result, missing: result.missing.length }),
    };
  } catch {
    return { status: "error", message: "Could not save the quantities. Nothing was changed." };
  }
}
