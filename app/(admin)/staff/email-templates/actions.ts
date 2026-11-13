"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  previewEmailTemplate,
  resetEmailTemplate,
  saveEmailTemplate,
  sendTestEmailTemplate,
} from "@/lib/email-templates-service";
import { COPY_FIELDS, type CopyField } from "@/lib/email/templates/copy";
import { isTemplateKey } from "@/lib/email/templates/validate";

/**
 * #1564 R11/R12 — the editor's actions. Admin tier, re-checked in every action: the page's gate
 * does not protect a Server Action. The store comes from `requireVendorRole`, never the form, and
 * a test email only ever goes to the signed-in admin's own address. Async exports only (CLAUDE.md).
 */

function fieldsFrom(input: Record<string, unknown>): Partial<Record<CopyField, string>> {
  const out: Partial<Record<CopyField, string>> = {};
  for (const field of COPY_FIELDS) {
    const value = input[field];
    if (typeof value === "string") out[field] = value.slice(0, 2000);
  }
  return out;
}

export async function previewTemplateAction(
  key: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; subject: string; preheader: string; html: string } | { ok: false }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok || !isTemplateKey(key)) return { ok: false };
  const email = await previewEmailTemplate(auth.vendorId, key, fieldsFrom(input));
  return { ok: true, subject: email.subject, preheader: email.preheader, html: email.html };
}

export async function saveTemplateAction(
  key: string,
  input: Record<string, unknown>,
): Promise<
  | { ok: true; reset: boolean }
  | { ok: false; error?: string; errors?: Partial<Record<CopyField, string>> }
> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: "Only store admins can edit email templates." };
  if (!isTemplateKey(key)) return { ok: false, error: "Unknown email template." };
  const result = await saveEmailTemplate(auth.vendorId, auth.user.id, key, fieldsFrom(input));
  if (!result.ok) return { ok: false, errors: result.errors };
  revalidatePath("/staff/email-templates");
  revalidatePath(`/staff/email-templates/${key}`);
  return result;
}

export async function resetTemplateAction(key: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: "Only store admins can edit email templates." };
  if (!isTemplateKey(key)) return { ok: false, error: "Unknown email template." };
  await resetEmailTemplate(auth.vendorId, key);
  revalidatePath("/staff/email-templates");
  revalidatePath(`/staff/email-templates/${key}`);
  return { ok: true };
}

export async function sendTestTemplateAction(
  key: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, message: "Only store admins can send test emails." };
  if (!isTemplateKey(key)) return { ok: false, message: "Unknown email template." };
  const result = await sendTestEmailTemplate(
    auth.vendorId,
    auth.user.email,
    key,
    fieldsFrom(input),
  );
  if (result.status === "sent")
    return { ok: true, message: `Test email sent to ${auth.user.email}.` };
  return {
    ok: false,
    message:
      result.status === "skipped"
        ? `Not sent: ${result.reason}`
        : `The test email could not be sent: ${result.reason}`,
  };
}
