"use server";

import { revalidatePath } from "next/cache";
import { changeVendorEnquiryStatus, replyToVendorEnquiry } from "@/lib/enquiries-service";

export async function replyToEnquiryAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const id = formData.get("id")?.toString() ?? "";
  const replyBody = formData.get("replyBody")?.toString() ?? "";

  if (!id || !replyBody.trim()) {
    return { error: "Please enter a reply message." };
  }

  const res = await replyToVendorEnquiry(id, replyBody);
  if (!res.ok) {
    return { error: res.error };
  }

  revalidatePath("/staff/enquiries");
  return { success: true };
}

export async function updateEnquiryStatusAction(formData: FormData): Promise<void> {
  const id = formData.get("id")?.toString() ?? "";
  const status = formData.get("status")?.toString() as "OPEN" | "REPLIED" | "RESOLVED" | undefined;
  if (!id || !status) return;

  await changeVendorEnquiryStatus(id, status);
  revalidatePath("/staff/enquiries");
}
