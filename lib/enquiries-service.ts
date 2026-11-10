import type { EnquiryStatus } from "@prisma/client/wasm";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEmailEnv, readOptional } from "@/lib/config";
import { getEmailService } from "@/lib/email";
import { getCurrentVendorProfile, getCurrentVendorSender } from "@/lib/vendor-service";
import {
  ENQUIRY_STATUSES,
  addVendorEnquiryReply,
  createVendorEnquiry,
  findVendorEnquiry,
  listVendorEnquiries,
  updateVendorEnquiryStatus,
  type VendorEnquiryWithReplies,
} from "@/lib/repositories/enquiries";
import { resolveInboundEmailWith } from "@/lib/inbound-email-service";

/**
 * #1482 — the request-scoped half of `/staff/enquiries` and of the inbound-email record route.
 * Spec: `specs/2026-11-10-pr1481-enquiries-team-access-retro/` (R7–R12, R27).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isEnquiryStatus(value: unknown): value is EnquiryStatus {
  return typeof value === "string" && (ENQUIRY_STATUSES as readonly string[]).includes(value);
}

export async function getVendorEnquiries(): Promise<VendorEnquiryWithReplies[]> {
  const vendorId = await getCurrentVendorId();
  return listVendorEnquiries(getPrisma(), vendorId, 100);
}

/**
 * The "replies are sent as" label (R8): the vendor's sender when it has one, else the vendor name
 * with the platform's configured `EMAIL_FROM` — never a hard-coded domain.
 */
export async function getEnquirySenderLabel(): Promise<string> {
  const [profile, sender] = await Promise.all([
    getCurrentVendorProfile(),
    getCurrentVendorSender(),
  ]);
  const name = sender?.name || profile?.name || "Store";
  const address = sender?.email ?? readOptional(getEmailEnv)?.EMAIL_FROM;
  return address ? `${name} <${address}>` : name;
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

  // R9: a customer replying to this reply must reach a mailbox someone reads — the store address
  // they wrote to first, the sender's own address only when there is none.
  const sendResult = await getEmailService().send({
    to: enquiry.senderEmail,
    sender: sender ?? undefined,
    replyTo: enquiry.toAddress ?? sender?.email ?? undefined,
    subject: replySubject,
    html,
  });

  // R10: only a real send is a reply. `skipped` (staging's recipient allow-list, or the log-only
  // adapter) sent nothing, so nothing is recorded and staff are told why.
  if (sendResult.status !== "sent") {
    return {
      ok: false,
      error:
        sendResult.status === "skipped"
          ? `Email not sent: ${sendResult.reason}`
          : `Failed to send email: ${sendResult.reason}`,
    };
  }

  await addVendorEnquiryReply(prisma, vendorId, id, {
    body: trimmed,
    sentBy: auth.user.email,
    sentAt: new Date(),
  });

  return { ok: true };
}

export async function changeVendorEnquiryStatus(
  id: string,
  status: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { ok: false, error: "Unauthorized" };
  if (!isEnquiryStatus(status)) return { ok: false, error: "Invalid status." };

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
