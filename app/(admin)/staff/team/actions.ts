"use server";

import { revalidatePath } from "next/cache";
import { setVendorRole } from "@/lib/roles-service";
import type { VendorRoleAction } from "@/lib/repositories/roles";

export async function assignRoleAction(prevState: any, formData: FormData) {
  const email = formData.get("email")?.toString();
  const role = formData.get("role")?.toString();

  if (!email || !role) {
    return { error: "Missing email or role", success: undefined };
  }

  // #1482 R20: only the four values the form offers; anything else never reaches the repository.
  // Kept local because a "use server" file may export only async functions.
  const allowed: readonly string[] = ["STAFF", "ADMIN", "PLATFORM_ADMIN", "NONE"];
  if (!allowed.includes(role)) {
    return { error: "Invalid role", success: undefined };
  }

  const roleValue = role === "NONE" ? null : (role as Exclude<VendorRoleAction, null>);

  try {
    await setVendorRole(email, roleValue);
    revalidatePath("/staff/team");
    return { success: true, error: undefined };
  } catch (err: any) {
    return { error: err.message, success: undefined };
  }
}
