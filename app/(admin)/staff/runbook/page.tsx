import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { RunbookClient } from "@/components/staff/RunbookClient";
import { DOC_ARTICLES as INTERNAL_DOCS } from "./docs";

export const metadata: Metadata = { title: "Internal Operational Runbook" };

export default async function RunbookPage() {
  // Available to both STAFF and ADMIN
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PanelRefusal title="Staff only" message="This area is restricted to store staff." />;
  }

  // Filter out platform-admin, shopper, developer, etc. docs
  const filteredDocs = (INTERNAL_DOCS as any[]).filter(doc => 
    doc.audience && (doc.audience.includes("staff") || doc.audience.includes("store-admin"))
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <RunbookClient docs={filteredDocs} />
    </main>
  );
}
