import type { getPrisma } from "@/lib/db";
import type { CopyField } from "@/lib/email/templates/copy";

/**
 * #1564 R10 — a store's saved email wording. Every function takes its client and `vendorId`
 * explicitly and reads no request context (CLAUDE.md, repository layer). `upsert` and `deleteMany`
 * are safe over the HTTP client; there is no nested write.
 */

type Db = ReturnType<typeof getPrisma>;

export interface EmailTemplateOverrideRow {
  templateKey: string;
  subject: string | null;
  preheader: string | null;
  heading: string | null;
  intro: string | null;
  ctaLabel: string | null;
  reassurance: string | null;
  signOff: string | null;
  updatedAt: Date;
  updatedByEmail: string | null;
}

const SELECT = {
  templateKey: true,
  subject: true,
  preheader: true,
  heading: true,
  intro: true,
  ctaLabel: true,
  reassurance: true,
  signOff: true,
  updatedAt: true,
  updatedBy: { select: { email: true } },
} as const;

type Selected = Omit<EmailTemplateOverrideRow, "updatedByEmail"> & {
  updatedBy: { email: string } | null;
};

function toRow(row: Selected): EmailTemplateOverrideRow {
  const { updatedBy, ...rest } = row;
  return { ...rest, updatedByEmail: updatedBy?.email ?? null };
}

export async function listEmailTemplateOverrides(
  prisma: Db,
  vendorId: string,
): Promise<EmailTemplateOverrideRow[]> {
  const rows = await prisma.emailTemplateOverride.findMany({
    where: { vendorId },
    select: SELECT,
  });
  return rows.map(toRow);
}

export async function saveEmailTemplateOverride(
  prisma: Db,
  vendorId: string,
  templateKey: string,
  fields: Record<CopyField, string | null>,
  userId: string,
): Promise<void> {
  const data = { ...fields, updatedByUserId: userId };
  await prisma.emailTemplateOverride.upsert({
    where: { vendorId_templateKey: { vendorId, templateKey } },
    create: { vendorId, templateKey, ...data },
    update: data,
  });
}

export async function deleteEmailTemplateOverride(
  prisma: Db,
  vendorId: string,
  templateKey: string,
): Promise<void> {
  await prisma.emailTemplateOverride.deleteMany({ where: { vendorId, templateKey } });
}
