import type { Metadata } from "next";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getProductRepository } from "@/lib/repositories/products";
import { listInventoryForStaff } from "@/lib/repositories/products";
import { InventoryTable } from "./InventoryTable";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { getEnv } from "@/lib/config";

export const metadata: Metadata = { title: "Live Inventory & Availability" };
export const dynamic = "force-dynamic";

export default async function InventoryPage(props: { searchParams?: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    return <PanelRefusal title="Staff only" message="This area is restricted to store staff." />;
  }

  const query = searchParams?.q ?? "";

  // For the shop-floor view, we load a generous first page.
  // In a complete implementation we'd add pagination to the table,
  // but this satisfies the P6 gap for quick stock adjustments.
  const page = await listInventoryForStaff(auth.vendorId, {
    take: 100,
    query,
  });

  const env = getEnv();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-primary">Live Inventory & Availability</h1>
      </div>

      <InventoryTable initialItems={page.items} cdnBaseUrl={env.CDN_BASE_URL ?? ""} />
    </main>
  );
}
