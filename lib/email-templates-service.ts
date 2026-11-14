import { getPrisma } from "@/lib/db";
import { getEmailService, type EmailSendResult } from "@/lib/email";
import { loadEmailBrand } from "@/lib/email-brand-service";
import type { EmailBrand } from "@/lib/email/layout/brand";
import type { CopyOverrides, RenderedEmail } from "@/lib/email/templates/compose";
import { COPY_FIELDS, type CopyField } from "@/lib/email/templates/copy";
import {
  allTemplateDefinitions,
  templateDefinition,
  type TemplateDefinition,
  type TemplateKey,
} from "@/lib/email/templates/registry";
import { renderSample } from "@/lib/email/templates/samples";
import { isTemplateKey, validateOverride } from "@/lib/email/templates/validate";
import { canonicalBaseUrl } from "@/lib/order-notifications/links";
import {
  deleteEmailTemplateOverride,
  listEmailTemplateOverrides,
  saveEmailTemplateOverride,
  type EmailTemplateOverrideRow,
} from "@/lib/repositories/email-templates";
import { fetchVendorProfile, listVendorHosts } from "@/lib/repositories/vendor";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";

/**
 * #1564 part 2 — the request-scoped half of editable email templates. Two audiences:
 *   - the senders, through `loadTemplateOverrides`, which never rejects (a failed read means the
 *     defaults, never a lost email — R13);
 *   - the `/staff/email-templates` page, whose callers have already passed `requireVendorRole`.
 */

export type TemplateOverrides = Partial<Record<TemplateKey, CopyOverrides>>;

function toOverrides(row: EmailTemplateOverrideRow): CopyOverrides {
  const out: CopyOverrides = {};
  for (const field of COPY_FIELDS) out[field] = row[field];
  return out;
}

/** R13 — a store's saved wording by template, or `{}` when the read fails. */
export async function loadTemplateOverrides(vendorId: string): Promise<TemplateOverrides> {
  try {
    const rows = await listEmailTemplateOverrides(getPrisma(), vendorId);
    const out: TemplateOverrides = {};
    for (const row of rows)
      if (isTemplateKey(row.templateKey)) out[row.templateKey] = toOverrides(row);
    return out;
  } catch (error) {
    console.error(
      `email template overrides load failed vendorId=${vendorId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

/** One template's saved wording for this store, or null (the defaults). Never rejects. */
export async function loadTemplateOverride(
  vendorId: string,
  key: TemplateKey,
): Promise<CopyOverrides | null> {
  return (await loadTemplateOverrides(vendorId))[key] ?? null;
}

/** The saved wording of the store this request belongs to; null on a platform host. Never rejects. */
export async function getCurrentTemplateOverride(key: TemplateKey): Promise<CopyOverrides | null> {
  const vendorId = await getCurrentVendorIdOrNull().catch(() => null);
  return vendorId ? loadTemplateOverride(vendorId, key) : null;
}

async function storeBrand(vendorId: string): Promise<{ brand: EmailBrand; senderEmail: string }> {
  const prisma = getPrisma();
  const [hosts, profile] = await Promise.all([
    listVendorHosts(prisma, vendorId).catch(() => []),
    fetchVendorProfile(prisma, vendorId),
  ]);
  const brand = await loadEmailBrand(vendorId, canonicalBaseUrl(hosts), profile.senderName);
  return { brand, senderEmail: profile.senderEmail };
}

export interface TemplateListItem {
  key: TemplateKey;
  group: TemplateDefinition["group"];
  label: string;
  description: string;
  edited: boolean;
  updatedAt: Date | null;
  updatedByEmail: string | null;
}

export async function getEmailTemplateList(vendorId: string): Promise<TemplateListItem[]> {
  const rows = await listEmailTemplateOverrides(getPrisma(), vendorId);
  const byKey = new Map(rows.map((r) => [r.templateKey, r]));
  return allTemplateDefinitions().map((def) => {
    const row = byKey.get(def.key);
    const edited = row ? def.editable.some((f) => (row[f] ?? "").trim() !== "") : false;
    return {
      key: def.key,
      group: def.group,
      label: def.label,
      description: def.description,
      edited,
      updatedAt: edited && row ? row.updatedAt : null,
      updatedByEmail: edited && row ? row.updatedByEmail : null,
    };
  });
}

export interface TemplateEditor {
  definition: TemplateDefinition;
  saved: Record<CopyField, string>;
  preview: RenderedEmail;
}

export async function getEmailTemplateEditor(
  vendorId: string,
  key: TemplateKey,
): Promise<TemplateEditor> {
  const definition = templateDefinition(key);
  const [override, { brand }] = await Promise.all([
    loadTemplateOverride(vendorId, key),
    storeBrand(vendorId),
  ]);
  const saved = Object.fromEntries(COPY_FIELDS.map((f) => [f, override?.[f] ?? ""])) as Record<
    CopyField,
    string
  >;
  return { definition, saved, preview: renderSample(key, brand, override) };
}

/** The live preview for unsaved field values; invalid text still renders, escaped. */
export async function previewEmailTemplate(
  vendorId: string,
  key: TemplateKey,
  raw: Partial<Record<CopyField, string>>,
): Promise<RenderedEmail> {
  const { brand } = await storeBrand(vendorId);
  return renderSample(key, brand, raw);
}

export type SaveResult =
  { ok: true; reset: boolean } | { ok: false; errors: Partial<Record<CopyField, string>> };

/** R12 — validated save; all fields blank means "back to the defaults" (the row is removed). */
export async function saveEmailTemplate(
  vendorId: string,
  userId: string,
  key: TemplateKey,
  raw: Partial<Record<CopyField, unknown>>,
): Promise<SaveResult> {
  const result = validateOverride(key, raw);
  if (!result.ok) return result;
  const prisma = getPrisma();
  if (COPY_FIELDS.every((f) => result.fields[f] === null)) {
    await deleteEmailTemplateOverride(prisma, vendorId, key);
    return { ok: true, reset: true };
  }
  await saveEmailTemplateOverride(prisma, vendorId, key, result.fields, userId);
  return { ok: true, reset: false };
}

export async function resetEmailTemplate(vendorId: string, key: TemplateKey): Promise<void> {
  await deleteEmailTemplateOverride(getPrisma(), vendorId, key);
}

/**
 * R11 — the sample email, with the wording on screen, to the signed-in admin's own address only.
 * `recipientIsSignedInAdmin` lets it through staging's allowlist for exactly that address.
 */
export async function sendTestEmailTemplate(
  vendorId: string,
  adminEmail: string,
  key: TemplateKey,
  raw: Partial<Record<CopyField, string>>,
): Promise<EmailSendResult> {
  const { brand, senderEmail } = await storeBrand(vendorId);
  const email = renderSample(key, brand, raw);
  return getEmailService().send({
    to: adminEmail,
    sender: { name: brand.storeName, email: senderEmail },
    subject: `[Test] ${email.subject}`,
    html: email.html,
    text: email.text,
    recipientIsSignedInAdmin: true,
  });
}
