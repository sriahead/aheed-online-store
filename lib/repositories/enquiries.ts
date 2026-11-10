import type { EnquirySource, EnquiryStatus } from "@prisma/client/wasm";
import type { getPrisma } from "@/lib/db";

/**
 * Storefront contact-form enquiries & inbound emails for the `/staff/enquiries` inbox (#1482).
 *
 * Pure over `prisma` and `vendorId` (`tests/repository-purity.test.ts`,
 * `tests/repository-client-injection.test.ts`, `tests/repository-vendor-scoping.test.ts`).
 * Uses only singular `create`/`update` with no nested writes, and `findMany`/`findFirst`, all safe
 * on the Neon HTTP adapter (`tests/repository-transaction-safety.test.ts`). Every query is scoped
 * by `vendorId`; a reply is only written after its enquiry is found under that vendor.
 */

type Db = ReturnType<typeof getPrisma>;

export const ENQUIRY_STATUSES: readonly EnquiryStatus[] = ["OPEN", "REPLIED", "RESOLVED"];

export interface CreateVendorEnquiryInput {
  source: EnquirySource;
  type: string;
  senderName?: string | null;
  senderEmail: string;
  senderPhone?: string | null;
  toAddress?: string | null;
  orderNumber?: string | null;
  subject: string;
  message: string;
}

export interface VendorEnquiryReplyRow {
  id: string;
  body: string;
  sentBy: string;
  sentAt: Date;
}

export interface VendorEnquiryRow {
  id: string;
  vendorId: string;
  source: EnquirySource;
  type: string;
  senderName: string | null;
  senderEmail: string;
  senderPhone: string | null;
  toAddress: string | null;
  orderNumber: string | null;
  subject: string;
  message: string;
  status: EnquiryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorEnquiryWithReplies extends VendorEnquiryRow {
  replies: VendorEnquiryReplyRow[];
}

const REPLY_SELECT = { id: true, body: true, sentBy: true, sentAt: true } as const;

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
): Promise<VendorEnquiryWithReplies[]> {
  return prisma.vendorEnquiry.findMany({
    where: { vendorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: { replies: { select: REPLY_SELECT, orderBy: { sentAt: "asc" } } },
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

/**
 * Appends one reply and marks the enquiry REPLIED. Two singular writes rather than one nested
 * write (which would open an implicit transaction the HTTP adapter cannot run). The reply goes
 * first: by the time this runs the email has been sent, so the record of it matters more than the
 * status, and a failure between the two leaves an OPEN enquiry with its reply listed.
 */
export async function addVendorEnquiryReply(
  prisma: Db,
  vendorId: string,
  id: string,
  reply: { body: string; sentBy: string; sentAt: Date },
): Promise<VendorEnquiryReplyRow | null> {
  const enquiry = await findVendorEnquiry(prisma, vendorId, id);
  if (!enquiry) return null;
  const created = await prisma.vendorEnquiryReply.create({
    data: { enquiryId: enquiry.id, body: reply.body, sentBy: reply.sentBy, sentAt: reply.sentAt },
    select: REPLY_SELECT,
  });
  await prisma.vendorEnquiry.update({
    where: { id: enquiry.id, vendorId },
    data: { status: "REPLIED" },
  });
  return created;
}

export async function updateVendorEnquiryStatus(
  prisma: Db,
  vendorId: string,
  id: string,
  status: EnquiryStatus,
): Promise<VendorEnquiryRow> {
  return prisma.vendorEnquiry.update({
    where: { id, vendorId },
    data: { status },
  });
}
