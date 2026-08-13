"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { quickUpdateInventory } from "@/lib/repositories/products";

export async function updateInventoryAction(
  productId: string,
  data: { quantity?: number; isActive?: boolean }
) {
  // Both STAFF and ADMIN can do this!
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { ok: false, error: "Unauthorized" };

  try {
    const result = await quickUpdateInventory(auth.vendorId, productId, data);
    if (result.ok) {
      revalidatePath("/staff/inventory");
      revalidatePath(`/staff/products/${productId}`);
      revalidatePath("/");
    }
    return result;
  } catch (error) {
    return { ok: false, error: "Failed to update inventory." };
  }
}
