import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getAiUsageOverview } from "@/lib/ai-usage-service";
import {
  WORKERS_AI_DAILY_ALLOWANCE_NEURONS,
  estimatedPaidChargeCents,
  formatUsdCents,
} from "@/lib/ai-budget-message";
import type { AiFeature } from "@/lib/repositories/ai-usage";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { AiBudgetForm } from "@/components/staff/AiBudgetForm";
import { PageContainer } from "@/components/layout/PageContainer";

// Reads the session and today's ledger — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AI allowance" };

const FEATURE_LABELS: Record<AiFeature, string> = {
  LIST_NORMALISATION: "Shop your list",
  SEARCH_SYNONYMS: "Search dictionary suggestions",
  NET_CONTENT: "Net content suggestions",
  PRODUCT_IMAGE: "Product images",
  CAMPAIGN_IMAGE: "Department campaign images",
};

function neurons(value: number): string {
  return Math.ceil(value).toLocaleString("en-GB");
}

/**
 * Today's Workers AI allowance for this store (#1029), and the plan it runs under (#1028).
 *
 * Store admins read it; only a platform admin may change the budget, because it caps the platform's
 * shared spend rather than the store's own (`saveAiBudget` enforces that, not this page). Every
 * figure is for the vendor resolved from the request host. The ledger behind it is
 * `AiUsageEvent` (lib/repositories/ai-usage.ts); `scripts/ai-usage.ts` reads the same rows.
 */
export default async function StaffAiUsagePage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to view this store's AI allowance."
      />
    );
  }

  const isPlatformAdmin = auth.via === "platform-admin";
  const overview = await getAiUsageOverview(auth.vendorId);
  const remaining = Math.max(0, overview.budgetNeurons - overview.usedNeuronsToday);

  return (
    <PageContainer width="standard">
      <h1 className="mb-1 text-2xl font-semibold text-primary">AI allowance</h1>
      <p className="mb-6 text-sm text-primary-muted">
        What this store&apos;s AI features have used today, measured in neurons (Cloudflare&apos;s
        unit). Every figure resets at 00:00 UTC. When the budget is used, AI features pause until
        then and everything else keeps working.
      </p>

      <section className="mb-6 space-y-2 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Today</h2>
        <p className="text-sm text-primary" data-ai-usage="store-today">
          <strong>{neurons(overview.usedNeuronsToday)}</strong> of{" "}
          <strong>{neurons(overview.budgetNeurons)}</strong> neurons used ({neurons(remaining)}{" "}
          left).
        </p>
        {isPlatformAdmin ? (
          <AiBudgetForm budgetNeurons={overview.budgetNeurons} />
        ) : (
          <p className="text-xs text-primary-muted" data-ai-usage="budget-readonly">
            Daily budget: {neurons(overview.budgetNeurons)} neurons. A platform admin sets this,
            because it limits spend the platform pays for.
          </p>
        )}
      </section>

      <section className="mb-6 space-y-2 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Plan</h2>
        <p className="text-sm text-primary" data-ai-usage="plan">
          Workers plan: <strong>{overview.plan === "paid" ? "Paid" : "Free"}</strong>
        </p>
        {overview.plan === "free" ? (
          <p className="text-sm text-primary" data-ai-usage="platform-today">
            Shared allowance across every store: {neurons(overview.platformNeuronsToday)} of{" "}
            {WORKERS_AI_DAILY_ALLOWANCE_NEURONS.toLocaleString("en-GB")} neurons used today. When it
            is used up, AI pauses for every store until 00:00 UTC, even one with budget left.
          </p>
        ) : (
          isPlatformAdmin && (
            <p className="text-sm text-primary" data-ai-usage="paid-charge">
              Estimated charge today above the shared{" "}
              {WORKERS_AI_DAILY_ALLOWANCE_NEURONS.toLocaleString("en-GB")}-neuron allowance:{" "}
              <strong>
                {formatUsdCents(estimatedPaidChargeCents(overview.platformNeuronsToday))}
              </strong>{" "}
              ({neurons(overview.platformNeuronsToday)} neurons across every store, at $0.011 per
              1,000 above the allowance).
            </p>
          )
        )}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">By feature</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-primary-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Feature
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Today
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Last 7 days
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.features.map((row) => (
                <tr key={row.feature} className="border-t border-black/5">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-primary">
                    {FEATURE_LABELS[row.feature]}
                  </th>
                  <td className="py-1.5 pr-3 text-right text-primary">
                    {neurons(row.todayNeurons)}
                  </td>
                  <td className="py-1.5 text-right text-primary">{neurons(row.sevenDayNeurons)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-primary-muted">
          Last 7 days means today and the six days before it, in UTC.
        </p>
      </section>
    </PageContainer>
  );
}
