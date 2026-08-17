import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { TrendingUp, ShoppingBag, Banknote } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Store Reports" };

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default async function ReportsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Admin only"
        message="Financial reports are restricted to store administrators."
      />
    );
  }

  const { totalRevenuePence, totalOrders } = await getOrderRepository().getFinancialsForStaff();

  const avgBasketPence = totalOrders > 0 ? Math.round(totalRevenuePence / totalOrders) : 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6 text-primary" aria-hidden />
        <h1 className="text-2xl font-semibold text-primary">Sales & Pence Financials</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-primary/60">
            <Banknote className="h-4 w-4" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Total Revenue</h2>
          </div>
          <p className="text-4xl font-bold text-primary">{formatMoney(totalRevenuePence)}</p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-primary/60">
            <ShoppingBag className="h-4 w-4" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Total Orders</h2>
          </div>
          <p className="text-4xl font-bold text-primary">{totalOrders}</p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-primary/60">
            <TrendingUp className="h-4 w-4" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Avg Basket Value</h2>
          </div>
          <p className="text-4xl font-bold text-primary">{formatMoney(avgBasketPence)}</p>
        </div>
      </div>
    </main>
  );
}
