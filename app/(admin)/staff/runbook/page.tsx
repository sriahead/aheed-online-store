import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";

export const metadata: Metadata = { title: "Internal Operational Runbook" };

type DocArticle = {
  id: string;
  title: string;
  audience: "staff" | "dev" | "customer";
  category: string;
  summary: string;
  lastUpdated: string;
};

// Static mockup data ported from docs/ui-ref/src/data/docs.ts
const INTERNAL_DOCS: DocArticle[] = [
  {
    id: "doc-staff-1",
    title: "Staff Track: Toggling Product Availability & Honest Live Stock",
    audience: "staff",
    category: "Shop-Floor Operations",
    summary: "Shop-floor procedures for marking out-of-stock items honestly without fake scarcity.",
    lastUpdated: "2026-08-02",
  },
  {
    id: "doc-staff-2",
    title: "Staff Track: Advancing Delivery Order Status",
    audience: "staff",
    category: "Order Fulfillment",
    summary: "How to transition orders from Confirmed → Out for delivery → Delivered.",
    lastUpdated: "2026-08-02",
  },
  {
    id: "doc-admin-1",
    title: "Admin Track: Product Pricing & Integer Pence Convention",
    audience: "staff",
    category: "Admin & Finance",
    summary: "Mandatory standard: prices are stored as integer pence to prevent floating point currency bugs.",
    lastUpdated: "2026-08-02",
  },
  {
    id: "doc-dev-1",
    title: "ADR-001: All-Serverless Architecture (Cloudflare Workers + Neon + R2)",
    audience: "dev",
    category: "Architecture ADRs",
    summary: "Rationale for OpenNext Cloudflare Workers, Neon Postgres, and S3-compatible R2.",
    lastUpdated: "2026-08-03",
  },
  {
    id: "doc-dev-2",
    title: "ADR-002: Better Auth Authentication & Impersonation Audit Controls",
    audience: "dev",
    category: "Security & Compliance",
    summary: "Better Auth integration details, session JWTs, and strict zero-trust impersonation audit logs.",
    lastUpdated: "2026-08-03",
  },
];

export default async function RunbookPage() {
  // Available to both STAFF and ADMIN
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <span className="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Internal Zero-Trust Staff Guide
          </span>
          <h1 className="text-xl font-bold mt-2">Store Admin & Shop-Floor Operational Runbook</h1>
          <p className="text-xs text-slate-400 mt-1">
            Split into Staff track (shop-floor procedures) and Admin track (pricing pence, inventory, escalation).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {INTERNAL_DOCS.map((doc) => (
            <div key={doc.id} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Audience: {doc.audience}
              </span>
              <h2 className="text-sm font-bold text-white">{doc.title}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{doc.summary}</p>
              <div className="pt-2 text-[11px] text-slate-500">
                Last verified: {doc.lastUpdated}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
