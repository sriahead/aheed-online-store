import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { getStockImportSettings, listStockImportRuns } from "@/lib/stock-import-service";
import { PageContainer } from "@/components/layout/PageContainer";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { StockImportUpload } from "@/components/staff/stock-import/StockImportUpload";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import stock file",
};

/** #1578 — upload a stock or price file, set up columns the first time, and see past imports. */
export default async function StaffProductImportPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to import this store's stock files."
      />
    );
  }
  const [settings, runs, categories] = await Promise.all([
    getStockImportSettings(auth.vendorId),
    listStockImportRuns(auth.vendorId),
    listCategoriesForAdmin(auth.vendorId),
  ]);

  return (
    <PageContainer width="standard">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-primary">Import stock file</h1>
          <p className="text-sm text-primary-muted">
            Upload your price or stock list. Every row is checked against your products; you review
            the lines, then apply. New products are created hidden.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          {settings && (
            <Link
              href="/staff/products/import/settings"
              className="rounded-lg border border-action/20 bg-action-tint/50 px-3 py-1.5 text-xs font-medium text-action hover:bg-action-tint"
            >
              Import settings
            </Link>
          )}
          <Link
            href="/staff/runbook?doc=products-catalogue-guide"
            className="rounded-lg border border-action/20 bg-action-tint/50 px-3 py-1.5 text-xs font-medium text-action hover:bg-action-tint"
          >
            Import guide →
          </Link>
        </div>
      </div>

      <StockImportUpload
        hasSettings={settings !== null}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-primary">Recent imports</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-primary-muted">No imports yet.</p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-3xl border border-black/10 bg-white">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/staff/products/import/${run.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-muted"
                >
                  <span>
                    <span className="font-semibold text-primary">{run.fileName}</span>
                    <span className="block text-xs text-primary-muted">
                      {run.createdAt.toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {run.createdBy ? ` · ${run.createdBy.name}` : ""} · {run.lineCount} lines
                      {run.status === "UNDONE" ? " · undone" : ""}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    {run.needsDecision > 0 && (
                      <span className="mr-2 text-danger">{run.needsDecision} need a decision</span>
                    )}
                    {run.readyToApply > 0 && <span className="mr-2">{run.readyToApply} ready</span>}
                    {run.applied > 0 && <span>{run.applied} applied</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
