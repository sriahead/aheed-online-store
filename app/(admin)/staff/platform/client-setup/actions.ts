"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  addInboundAddress,
  listClientSetupVendors,
  removeInboundAddress,
  saveVendorSender,
  sendClientSetupTestEmail,
} from "@/lib/client-setup-service";
import {
  firstIssue,
  inboundAddressSchema,
  removeInboundAddressSchema,
  senderSchema,
  testEmailSchema,
  type ClientSetupFormState,
} from "@/lib/client-setup/form-state";

/**
 * #1217 — the Client Setup dashboard's writes. Platform admins only: every action re-checks the
 * gate itself, because hiding a form is not the control. Each returns a form state instead of
 * throwing, so the page always shows a message.
 *
 * A "use server" file may export ONLY async functions (CLAUDE.md) — state, schemas and constants
 * live in lib/client-setup/form-state.ts.
 */

const PAGE = "/staff/platform/client-setup";

function refusal(message: string): ClientSetupFormState {
  return { ok: false, message };
}

/** The signed-in platform admin's email, or null when the caller is not one. */
async function platformAdminEmail(): Promise<string | null> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok || auth.via !== "platform-admin") return null;
  return auth.user.email;
}

/** A form-supplied vendor id must be a real vendor; the platform admin may act on any of them. */
async function knownVendor(vendorId: string): Promise<boolean> {
  return (await listClientSetupVendors()).some((v) => v.id === vendorId);
}

export async function saveSenderAction(
  _prev: ClientSetupFormState,
  formData: FormData,
): Promise<ClientSetupFormState> {
  if (!(await platformAdminEmail())) return refusal("Platform admin only.");
  const parsed = senderSchema.safeParse({
    vendorId: formData.get("vendorId"),
    senderName: formData.get("senderName"),
    senderEmail: formData.get("senderEmail"),
  });
  if (!parsed.success) return refusal(firstIssue(parsed.error));
  try {
    if (!(await knownVendor(parsed.data.vendorId))) return refusal("That store no longer exists.");
    const saved = await saveVendorSender(parsed.data.vendorId, {
      senderName: parsed.data.senderName,
      senderEmail: parsed.data.senderEmail,
    });
    if (!saved)
      return refusal("This store has no configuration row yet, so the sender cannot be saved.");
  } catch {
    return refusal("Saving the sender failed. Try again in a moment.");
  }
  revalidatePath(PAGE);
  return { ok: true, message: "Sender saved." };
}

export async function addInboundAddressAction(
  _prev: ClientSetupFormState,
  formData: FormData,
): Promise<ClientSetupFormState> {
  if (!(await platformAdminEmail())) return refusal("Platform admin only.");
  const parsed = inboundAddressSchema.safeParse({
    vendorId: formData.get("vendorId"),
    address: formData.get("address"),
    purpose: formData.get("purpose"),
    forwardTo: formData.get("forwardTo"),
  });
  if (!parsed.success) return refusal(firstIssue(parsed.error));
  try {
    if (!(await knownVendor(parsed.data.vendorId))) return refusal("That store no longer exists.");
    const outcome = await addInboundAddress(parsed.data.vendorId, parsed.data);
    if (!outcome.ok) {
      return refusal(
        outcome.reason === "duplicate"
          ? "That address is already registered (to this or another store)."
          : "The forward-to mailbox is itself a receiving address here, so mail would loop. Use the store's real mailbox.",
      );
    }
  } catch {
    return refusal("Adding the address failed. Try again in a moment.");
  }
  revalidatePath(PAGE);
  return { ok: true, message: "Address added." };
}

export async function removeInboundAddressAction(
  _prev: ClientSetupFormState,
  formData: FormData,
): Promise<ClientSetupFormState> {
  if (!(await platformAdminEmail())) return refusal("Platform admin only.");
  const parsed = removeInboundAddressSchema.safeParse({
    vendorId: formData.get("vendorId"),
    id: formData.get("id"),
  });
  if (!parsed.success) return refusal(firstIssue(parsed.error));
  try {
    const removed = await removeInboundAddress(parsed.data.vendorId, parsed.data.id);
    if (!removed) return refusal("That address was already removed.");
  } catch {
    return refusal("Removing the address failed. Try again in a moment.");
  }
  revalidatePath(PAGE);
  return { ok: true, message: "Address removed." };
}

/** R33 — always to the signed-in admin's own address; the form has no recipient field. */
export async function sendTestEmailAction(
  _prev: ClientSetupFormState,
  formData: FormData,
): Promise<ClientSetupFormState> {
  const adminEmail = await platformAdminEmail();
  if (!adminEmail) return refusal("Platform admin only.");
  const parsed = testEmailSchema.safeParse({ vendorId: formData.get("vendorId") });
  if (!parsed.success) return refusal(firstIssue(parsed.error));
  try {
    if (!(await knownVendor(parsed.data.vendorId))) return refusal("That store no longer exists.");
    const result = await sendClientSetupTestEmail(parsed.data.vendorId, adminEmail);
    if (result.status === "sent") {
      return { ok: true, message: `Sent to ${adminEmail}. Check that inbox.` };
    }
    if (result.status === "skipped") {
      return refusal(`Skipped by recipient policy or configuration: ${result.reason}.`);
    }
    return refusal(`Failed: ${result.reason}.`);
  } catch {
    return refusal("Sending the test email failed. Try again in a moment.");
  }
}
