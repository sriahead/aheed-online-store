import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { getStockImportSettings } from "@/lib/stock-import-service";
import { settingsFormText } from "@/lib/stock-import/settings-form";
import { PageContainer } from "@/components/layout/PageContainer";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { StockImportSettingsForm } from "@/components/staff/stock-import/StockImportSettingsForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import settings",
};

const EMPTY = {
  brandAliases: "",
  spelling: "",
  synonyms: "",
  ignoreWords: "",
  noiseWords: "",
  preserveWords: "",
  sectionCategories: "",
  categoryMap: "",
  files: "",
};

/** #1578 R1 — how this store's stock files are read and its product names cleaned. */
export default async function StaffProductImportSettingsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to change this store's import settings."
      />
    );
  }
  const [stored, categories] = await Promise.all([
    getStockImportSettings(auth.vendorId),
    listCategoriesForAdmin(auth.vendorId),
  ]);
  const choices = categories.map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <PageContainer width="standard">
      <div className="mb-6">
        <Link href="/staff/products/import" className="text-xs font-medium text-action">
          ← Import stock file
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-primary">Import settings</h1>
        <p className="text-sm text-primary-muted">
          How your stock files are laid out and how product names are cleaned. Saving means open
          imports need “Refresh plan” before they can be applied.
        </p>
      </div>
      <StockImportSettingsForm
        settings={stored?.data ?? null}
        text={stored ? settingsFormText(stored.data, choices) : EMPTY}
        categories={choices}
      />
    </PageContainer>
  );
}
