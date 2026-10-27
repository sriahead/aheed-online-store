import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getPlatformAiNeuronsToday } from "@/lib/ai-usage-service";
import {
  estimatedPaidChargeCents,
  formatUsdCents,
  WORKERS_AI_DAILY_ALLOWANCE_NEURONS,
} from "@/lib/ai-budget-message";
import {
  RUNNING_COST_ITEMS,
  buildCostReport,
  formatCostStatus,
  type AttentionEntry,
  type CostItem,
  type CostStatus,
} from "@/lib/running-costs";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Running Costs" };

type AiUsage = Awaited<ReturnType<typeof getPlatformAiNeuronsToday>> | null;

const STATUS_STYLE: Record<CostStatus, string> = {
  actual: "bg-emerald-100 text-emerald-800",
  planned: "bg-sky-100 text-sky-800",
  estimate: "bg-amber-100 text-amber-800",
  unverified: "bg-slate-200 text-slate-700",
};

function costText(item: CostItem): string {
  if (item.amountCents === null || item.period === null) return "Not priced";
  return `${formatUsdCents(item.amountCents)}/${item.period}`;
}

function neurons(value: number): string {
  return Math.ceil(value).toLocaleString("en-GB");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function attentionText(entry: AttentionEntry, item: CostItem): string {
  if (entry.kind === "auto-renew-off") {
    return `${item.name}: auto-renew is off, so it lapses unless renewed by hand${
      item.renewsOn ? ` (expires ${item.renewsOn})` : ""
    }.`;
  }
  if (entry.kind === "renewal-soon") {
    return `${item.name} renews on ${item.renewsOn}.`;
  }
  return `${item.name}: price changes to ${formatUsdCents(item.priceChange?.toCents ?? 0)} on ${
    item.priceChange?.effectiveOn
  }.`;
}

function UsageLine({ item, usage }: { item: CostItem; usage: AiUsage }) {
  if (item.usage !== "workers-ai") {
    return <span data-costs-usage={item.id}>Usage not monitored</span>;
  }
  if (usage === null) {
    return <span data-costs-usage={item.id}>Usage unavailable</span>;
  }
  const planLabel = usage.plan === "paid" ? "Paid plan" : "Free plan";
  return (
    <span data-costs-usage={item.id}>
      {neurons(usage.neurons)} of {WORKERS_AI_DAILY_ALLOWANCE_NEURONS.toLocaleString("en-GB")}{" "}
      neurons used today ({planLabel})
      {usage.plan === "paid" &&
        `. Estimated charge today: ${formatUsdCents(estimatedPaidChargeCents(usage.neurons))}`}
    </span>
  );
}

function ItemCard({ item, usage }: { item: CostItem; usage: AiUsage }) {
  return (
    <article
      data-costs-item={item.id}
      className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
          <p className="text-xs text-slate-500">
            {item.provider} &middot; {item.plan}
            {item.role ? `, ${item.role}` : ""}
          </p>
        </div>
        <span
          data-costs-status
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[item.costStatus]}`}
        >
          {formatCostStatus(item.costStatus)}
        </span>
      </div>

      <p className="mt-3 text-lg font-bold text-slate-900">{costText(item)}</p>
      <p className="text-xs text-slate-500">As of {item.asOf}</p>

      <ul className="mt-3 space-y-1 text-sm text-slate-700">
        {item.renewsOn && <li>Renews on {item.renewsOn}</li>}
        {item.renewsOn === null && item.id.startsWith("domain-") && <li>Not yet registered</li>}
        {item.autoRenew === false && <li className="font-bold text-rose-700">Auto-renew off</li>}
        {item.priceChange && (
          <li>
            Price changes to {formatUsdCents(item.priceChange.toCents)}/year from{" "}
            {item.priceChange.effectiveOn}. {item.priceChange.note}
          </li>
        )}
        <li>
          <UsageLine item={item} usage={usage} />
        </li>
      </ul>

      <div data-costs-limits className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        {item.limits === null ? (
          "Limits not recorded"
        ) : (
          <>
            <p>
              <strong>Free allowance:</strong> {item.limits.allowance}
            </p>
            {item.limits.overage && (
              <p className="mt-1">
                <strong>Beyond it:</strong> {item.limits.overage}
              </p>
            )}
            <p className="mt-1 text-slate-500">
              Source: {hostOf(item.limits.sourceUrl)}, retrieved {item.limits.retrievedOn}.{" "}
              {item.limits.confirmedByOwner
                ? "Confirmed by the owner"
                : "Not confirmed by the owner"}
            </p>
          </>
        )}
      </div>

      {item.note && <p className="mt-3 text-xs text-slate-600">{item.note}</p>}
    </article>
  );
}

function Total({
  label,
  hint,
  name,
  value,
}: {
  label: string;
  hint: string;
  name: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p data-costs-total={name} className="mt-1 text-2xl font-bold text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default async function PlatformCostsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Platform admin only"
        message="This area is restricted to platform administrators."
      />
    );
  }
  if (auth.via !== "platform-admin") {
    return (
      <PanelRefusal
        title="Platform admin only"
        message="This area is restricted to platform administrators."
      />
    );
  }

  const items = RUNNING_COST_ITEMS;
  const report = buildCostReport(items, new Date());
  const byId = new Map(items.map((item) => [item.id, item]));

  // A failed read is "unavailable", never zero: a zero would read as "nothing used".
  let usage: AiUsage = null;
  try {
    usage = await getPlatformAiNeuronsToday();
  } catch {
    usage = null;
  }

  return (
    <PageContainer width="wide">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
            Platform Admin
          </span>
          <h1 className="text-2xl font-bold text-slate-900">Running Costs</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          What the platform costs now, what is planned, and what changes at renewal. Figures come
          from a registry maintained in the codebase; only Workers AI usage is read live.
        </p>
        <p data-costs="currency-note" className="mt-1 text-xs text-slate-500">
          Prices are in US dollars as quoted by the provider. Your card is charged in pounds, so the
          amounts you pay will differ slightly.
        </p>
      </div>

      {report.current.annualCents === 0 && (
        <p
          data-costs="zero-notice"
          className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
        >
          Nothing is currently billed.
        </p>
      )}

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="space-y-4">
          <Total
            label="Now, per month"
            hint="Actual fixed costs only"
            name="current-monthly"
            value={formatUsdCents(report.current.monthlyCents)}
          />
          <Total
            label="Now, per year"
            hint="Actual fixed costs only"
            name="current-annual"
            value={formatUsdCents(report.current.annualCents)}
          />
        </div>
        <div className="space-y-4">
          <Total
            label="With planned, per month"
            hint="Adds items marked Planned"
            name="planned-monthly"
            value={formatUsdCents(report.withPlanned.monthlyCents)}
          />
          <Total
            label="With planned, per year"
            hint="Adds items marked Planned"
            name="planned-annual"
            value={formatUsdCents(report.withPlanned.annualCents)}
          />
        </div>
        <div className="space-y-4">
          <Total
            label="At renewal prices, per month"
            hint="Planned included, price changes applied"
            name="renewal-monthly"
            value={formatUsdCents(report.atRenewal.monthlyCents)}
          />
          <Total
            label="At renewal prices, per year"
            hint="Planned included, price changes applied"
            name="renewal-annual"
            value={formatUsdCents(report.atRenewal.annualCents)}
          />
        </div>
      </section>
      <p className="mb-8 text-xs text-slate-500">
        Usage-based and not-yet-priced items are in no total:{" "}
        {report.unpriced.map((id) => byId.get(id)?.name ?? id).join(", ") || "none"}.
      </p>

      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-rose-800">
            Needs attention
          </h2>
          <ul data-costs-attention className="mt-3 space-y-2 text-sm text-slate-800">
            {report.attention.map((entry) => {
              const item = byId.get(entry.id);
              return (
                <li key={`${entry.id}-${entry.kind}`} data-costs-attention-kind={entry.kind}>
                  {item ? attentionText(entry, item) : entry.id}
                </li>
              );
            })}
          </ul>
          {report.attention.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">
              Nothing needs attention in the next 60 days.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Upcoming renewals
          </h2>
          <ul data-costs-renewals className="mt-3 space-y-2 text-sm text-slate-800">
            {report.renewals.map((renewal) => (
              <li key={renewal.id}>
                {byId.get(renewal.id)?.name ?? renewal.id}: {renewal.renewsOn},{" "}
                {renewal.amountCents === null ? "Not priced" : formatUsdCents(renewal.amountCents)}
              </li>
            ))}
          </ul>
          {report.renewals.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">No dated renewals recorded.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} usage={usage} />
        ))}
      </section>
    </PageContainer>
  );
}
