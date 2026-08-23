"use server";

import { revalidatePath } from "next/cache";
import { setVendorRole } from "@/lib/roles-service";
import type { VendorRoleAction } from "@/lib/repositories/roles";

export async function assignRoleAction(prevState: any, formData: FormData) {
  const email = formData.get("email")?.toString();
  const role = formData.get("role")?.toString() as VendorRoleAction | "NONE";

  if (!email || !role) {
    return { error: "Missing email or role", success: undefined };
  }

  const roleValue = role === "NONE" ? null : role;

  try {
    await setVendorRole(email, roleValue);
    revalidatePath("/staff/team");
    return { success: true, error: undefined };
  } catch (err: any) {
    return { error: err.message, success: undefined };
  }
}
