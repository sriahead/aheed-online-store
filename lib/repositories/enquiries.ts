import type { getPrisma } from "@/lib/db";

/**
 * Storefront contact-form enquiries & inbound emails for the `/staff/enquiries` inbox.
 *
 * Pure over `prisma` and `vendorId` (`tests/repository-purity.test.ts`,
 * `tests/repository-client-injection.test.ts`, `tests/repository-vendor-scoping.test.ts`).
 * Uses only singular `create`/`update` and `findMany`/`findFirst`, all safe on the Neon HTTP
 * adapter (`tests/repository-transaction-safety.test.ts`).
 */

type Db = ReturnType<typeof getPrisma>;

export interface CreateVendorEnquiryInput {
  source: "CONTACT_FORM" | "INBOUND_EMAIL";
  type: string;
  senderName?: string | null;
  senderEmail: string;
  senderPhone?: string | null;
  toAddress?: string | null;
  orderNumber?: string | null;
  subject: string;
  message: string;
}

export interface VendorEnquiryRow {
  id: string;
  vendorId: string;
  source: string;
  type: string;
  senderName: string | null;
  senderEmail: string;
  senderPhone: string | null;
  toAddress: string | null;
  orderNumber: string | null;
  subject: string;
  message: string;
  status: string;
  replyBody: string | null;
  repliedAt: Date | null;
  repliedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createVendorEnquiry(
  prisma: Db,
  vendorId: string,
  input: CreateVendorEnquiryInput,
): Promise<VendorEnquiryRow> {
  return prisma.vendorEnquiry.create({
    data: {
      vendorId,
      source: input.source,
      type: input.type,
      senderName: input.senderName ?? null,
      senderEmail: input.senderEmail,
      senderPhone: input.senderPhone ?? null,
      toAddress: input.toAddress ?? null,
      orderNumber: input.orderNumber ?? null,
      subject: input.subject,
      message: input.message,
      status: "OPEN",
    },
  });
}

export async function listVendorEnquiries(
  prisma: Db,
  vendorId: string,
  take = 100,
): Promise<VendorEnquiryRow[]> {
  return prisma.vendorEnquiry.findMany({
    where: { vendorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}

export async function findVendorEnquiry(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<VendorEnquiryRow | null> {
  return prisma.vendorEnquiry.findFirst({
    where: { id, vendorId },
  });
}

export async function recordVendorEnquiryReply(
  prisma: Db,
  vendorId: string,
  id: string,
  reply: { replyBody: string; repliedBy: string; repliedAt: Date },
): Promise<VendorEnquiryRow> {
  return prisma.vendorEnquiry.update({
    where: { id, vendorId },
    data: {
      status: "REPLIED",
      replyBody: reply.replyBody,
      repliedBy: reply.repliedBy,
      repliedAt: reply.repliedAt,
    },
  });
}

export async function updateVendorEnquiryStatus(
  prisma: Db,
  vendorId: string,
  id: string,
  status: "OPEN" | "REPLIED" | "RESOLVED",
): Promise<VendorEnquiryRow> {
  return prisma.vendorEnquiry.update({
    where: { id, vendorId },
    data: { status },
  });
}
