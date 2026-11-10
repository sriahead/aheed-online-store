import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEnquirySenderLabel, getVendorEnquiries } from "@/lib/enquiries-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { EnquiryList } from "./EnquiryList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Enquiries & Inbox" };

export default async function EnquiriesPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Staff only"
        message="This area is restricted to store staff and admins."
      />
    );
  }

  const [enquiries, senderLabel] = await Promise.all([
    getVendorEnquiries(),
    getEnquirySenderLabel(),
  ]);

  const serialized = enquiries.map((e) => ({
    id: e.id,
    source: e.source,
    type: e.type,
    senderName: e.senderName,
    senderEmail: e.senderEmail,
    senderPhone: e.senderPhone,
    toAddress: e.toAddress,
    orderNumber: e.orderNumber,
    subject: e.subject,
    message: e.message,
    status: e.status,
    replies: e.replies.map((r) => ({
      id: r.id,
      body: r.body,
      sentBy: r.sentBy,
      sentAt: r.sentAt.toISOString(),
    })),
    createdAt: e.createdAt.toISOString(),
  }));

  const openCount = serialized.filter((e) => e.status === "OPEN").length;

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Enquiries & Inbox</h1>
          <p className="mt-1 text-sm text-primary-muted">
            View and reply to customer messages from your storefront Contact Us form and store email
            addresses. Outgoing replies are sent as <strong>{senderLabel}</strong>.
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm shadow-sm">
          <span className="font-bold text-primary">{openCount}</span>{" "}
          <span className="text-primary-muted">open</span> ·{" "}
          <span className="font-bold text-primary">{serialized.length}</span>{" "}
          <span className="text-primary-muted">total</span>
        </div>
      </div>

      <EnquiryList items={serialized} senderLabel={senderLabel} />
    </PageContainer>
  );
}
