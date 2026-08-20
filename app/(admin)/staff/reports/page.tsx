import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { getDiscountRepository } from "@/lib/repositories/discounts";
import { getCatalogueHealth, getLoyaltyLiability } from "@/lib/repositories/reports";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { TrendingUp, ShoppingBag, Banknote, Package, Sparkles, TicketPercent } from "lucide-react";

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

  const [{ totalRevenuePence, totalOrders }, catalogue, loyalty, discountCodes] = await Promise.all(
    [
      getOrderRepository().getFinancialsForStaff(),
      getCatalogueHealth(auth.vendorId),
      getLoyaltyLiability(auth.vendorId),
      getDiscountRepository().list(),
    ],
  );

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

      {/* Non-sales reporting (P7.5d+e, #161). Sales analytics is deliberately
          absent — production runs Stripe TEST keys (#113), so there is no real
          trading data to design it against. Everything below describes catalogue
          and configuration state, which is real today. */}

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-semibold text-primary">Catalogue &amp; stock health</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <StatTile label="Products" value={String(catalogue.totalProducts)} />
          <StatTile label="Visible to shoppers" value={String(catalogue.activeProducts)} />
          <StatTile
            label="Out of stock"
            value={String(catalogue.outOfStock)}
            tone={catalogue.outOfStock > 0 ? "danger" : "normal"}
          />
          <StatTile
            label="Low stock"
            value={String(catalogue.lowStock)}
            tone={catalogue.lowStock > 0 ? "warn" : "normal"}
          />
        </div>
        <p className="mt-2 text-xs text-primary/60">
          Low stock counts products at or below their own threshold. Out-of-stock products are
          counted once, not in both figures.
        </p>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-semibold text-primary">Loyalty liability</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Points outstanding"
            value={loyalty.outstandingPoints.toLocaleString("en-GB")}
          />
          <StatTile label="If all redeemed" value={formatMoney(loyalty.liabilityPence)} />
          <StatTile label="Accounts in credit" value={String(loyalty.accountsWithBalance)} />
        </div>
        <p className="mt-2 text-xs text-primary/60">
          Expired points are excluded — a balance lapses when an account goes quiet for longer than
          this store&apos;s expiry setting.
          {loyalty.lapsedAccounts > 0 && (
            <>
              {" "}
              {loyalty.lapsedAccounts}{" "}
              {loyalty.lapsedAccounts === 1 ? "account has" : "accounts have"} a lapsed balance
              worth nothing.
            </>
          )}
        </p>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <TicketPercent className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-semibold text-primary">Discount codes</h2>
        </div>
        {discountCodes.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-surface-muted p-6 text-center text-sm text-primary/70">
            No discount codes configured for this store.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10 text-xs uppercase tracking-wider text-primary/60">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Redeemed</th>
                  <th className="px-4 py-3 font-semibold">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {discountCodes.map((code) => (
                  <tr key={code.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3 font-semibold text-primary">{code.code}</td>
                    <td className="px-4 py-3 text-primary/70">
                      {code.isActive ? "Active" : "Inactive"}
                    </td>
                    <td className="px-4 py-3 text-primary/70">{code.redemptionCount}</td>
                    <td className="px-4 py-3 text-primary/70">
                      {code.remainingRedemptions === null ? "Unlimited" : code.remainingRedemptions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatTile({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "warn" | "danger";
}) {
  const valueClass =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-accent" : "text-primary";
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary/60">{label}</p>
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
