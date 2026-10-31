import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { PageContainer } from "@/components/layout/PageContainer";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { StockFileImporter } from "@/components/staff/StockFileImporter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import stock file",
};

export default async function StaffProductImportPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's catalogue import."
      />
    );
  }

  return (
    <PageContainer width="standard">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-primary">Import stock file</h1>
          <p className="text-sm text-primary-muted">
            Upload spreadsheets to preview and import product lines while enforcing ADR-007
            catalogue safeguards.
          </p>
        </div>
        <Link
          href="/staff/runbook?doc=products-catalogue-guide"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-action bg-action-tint/50 hover:bg-action-tint px-3 py-1.5 rounded-lg border border-action/20 transition self-start"
        >
          View Import Guide →
        </Link>
      </div>

      <StockFileImporter />
    </PageContainer>
  );
}
