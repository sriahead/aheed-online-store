import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEmailService } from "@/lib/email";
import { getCurrentVendorProfile, getCurrentVendorSender } from "@/lib/vendor-service";
import {
  createVendorEnquiry,
  findVendorEnquiry,
  listVendorEnquiries,
  recordVendorEnquiryReply,
  updateVendorEnquiryStatus,
  type VendorEnquiryRow,
} from "@/lib/repositories/enquiries";
import { resolveInboundEmailWith } from "@/lib/inbound-email-service";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function getVendorEnquiries(): Promise<VendorEnquiryRow[]> {
  const vendorId = await getCurrentVendorId();
  return listVendorEnquiries(getPrisma(), vendorId, 100);
}

export async function replyToVendorEnquiry(
  id: string,
  replyBody: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { ok: false, error: "Unauthorized" };

  const trimmed = replyBody.trim();
  if (!trimmed) return { ok: false, error: "Reply message cannot be empty." };

  const prisma = getPrisma();
  const vendorId = auth.vendorId;
  const enquiry = await findVendorEnquiry(prisma, vendorId, id);
  if (!enquiry) return { ok: false, error: "Enquiry not found." };

  const [profile, sender] = await Promise.all([
    getCurrentVendorProfile(),
    getCurrentVendorSender(),
  ]);
  const storeName = profile?.name ?? sender?.name ?? "Store Support";
  const replySubject = enquiry.subject.toLowerCase().startsWith("re:")
    ? enquiry.subject
    : `Re: ${enquiry.subject}`;

  const html = `
    <div style="font-family:sans-serif;line-height:1.5;color:#111827;">
      <p style="white-space:pre-wrap;">${escapeHtml(trimmed)}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
      <p style="font-size:12px;color:#6b7280;">
        Sent by ${escapeHtml(storeName)}${enquiry.orderNumber ? ` regarding Order ${escapeHtml(enquiry.orderNumber)}` : ""}
      </p>
      <blockquote style="margin:12px 0 0;padding-left:12px;border-left:3px solid #d1d5db;color:#4b5563;font-size:13px;white-space:pre-wrap;">${escapeHtml(enquiry.message)}</blockquote>
    </div>
  `.trim();

  const sendResult = await getEmailService().send({
    to: enquiry.senderEmail,
    sender: sender ?? undefined,
    replyTo: sender?.email ?? enquiry.toAddress ?? undefined,
    subject: replySubject,
    html,
  });

  if (sendResult.status === "failed") {
    return { ok: false, error: `Failed to send email: ${sendResult.reason}` };
  }

  await recordVendorEnquiryReply(prisma, vendorId, id, {
    replyBody: trimmed,
    repliedBy: auth.user.email,
    repliedAt: new Date(),
  });

  return { ok: true };
}

export async function changeVendorEnquiryStatus(
  id: string,
  status: "OPEN" | "REPLIED" | "RESOLVED",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { ok: false, error: "Unauthorized" };

  const prisma = getPrisma();
  const existing = await findVendorEnquiry(prisma, auth.vendorId, id);
  if (!existing) return { ok: false, error: "Enquiry not found." };

  await updateVendorEnquiryStatus(prisma, auth.vendorId, id, status);
  return { ok: true };
}

export async function recordInboundEmailEnquiry(input: {
  to: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  message: string;
}): Promise<{ recorded: boolean }> {
  const prisma = getPrisma();
  const resolution = await resolveInboundEmailWith(prisma, {
    to: input.to,
    subject: input.subject,
  });
  if (!resolution) return { recorded: false };

  await createVendorEnquiry(prisma, resolution.vendorId, {
    source: "INBOUND_EMAIL",
    type: resolution.purpose,
    senderName: input.fromName,
    senderEmail: input.fromEmail,
    toAddress: input.to.trim().toLowerCase(),
    orderNumber: resolution.orderNumber,
    subject: input.subject.trim() || "(No subject)",
    message: input.message.trim() || "(Empty email body)",
  });
  return { recorded: true };
}
