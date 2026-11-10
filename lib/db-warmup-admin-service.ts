import { getPrisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-rbac";
import { saveDbWarmupConfig } from "@/lib/repositories/db-warmup";
import { parseDbWarmupForm, type DbWarmupFormState } from "@/lib/db-warmup/form";
import { publishWarmupSchedule } from "@/lib/db-warmup-service";

/**
 * #1491 R14 — the warm-up settings save: platform admins only, every field allow-listed
 * (`lib/db-warmup/form.ts`), audited by `updatedBy`, then the schedule is republished to KV so the
 * scheduler sees the change on its next 4-minute tick.
 */
export async function saveDbWarmupSettings(form: FormData): Promise<DbWarmupFormState> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return { status: "error", message: "Only platform admins can change this." };

  const parsed = parseDbWarmupForm(form);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  await saveDbWarmupConfig(getPrisma(), parsed.value, auth.user.email);
  await publishWarmupSchedule();
  console.log(
    `db-warmup settings saved: enabled=${parsed.value.enabled} mode=${parsed.value.mode}`,
  );
  return { status: "saved" };
}
