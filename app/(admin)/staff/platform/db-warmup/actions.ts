"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth-rbac";
import { saveDbWarmupSettings } from "@/lib/db-warmup-admin-service";
import type { DbWarmupFormState } from "@/lib/db-warmup/form";

/**
 * #1491 R14 — save the database warm-up settings. Platform admins only: refused here before anything
 * else runs, and again inside `saveDbWarmupSettings` (defence in depth). A `"use server"` file may
 * export only async functions (CLAUDE.md), so the form state type and the parsing live in
 * `lib/db-warmup/form.ts`.
 */
export async function saveDbWarmupAction(
  _prev: DbWarmupFormState,
  formData: FormData,
): Promise<DbWarmupFormState> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return { status: "error", message: "Only platform admins can change this." };

  const result = await saveDbWarmupSettings(formData);
  if (result.status === "saved") revalidatePath("/staff/platform/db-warmup");
  return result;
}
