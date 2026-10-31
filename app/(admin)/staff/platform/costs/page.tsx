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
  COST_GROUPS,
  buildCostReport,
  formatCostStatus,
  type AttentionEntry,
  type CostGroup,
  type CostItem,
  type CostStatus,
} from "@/lib/running-costs";
import { assumptionValue } from "@/lib/pricing/assumptions";
import { analyseV2, COMMITTED, newestDate, type StaleRegistry } from "@/lib/pricing/committed";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { PricingReviewPanel } from "@/components/staff/PricingReviewPanel";
import { PricingWhatIf } from "@/components/staff/PricingWhatIf";
import { PrintButton } from "@/components/staff/PrintButton";
import {
  AddOnsSection,
  CompetitorsSection,
  ModelsSection,
  ProductionSection,
  RecommendationSection,
  RisksSection,
  SectionHeader,
} from "@/components/staff/PricingDashboardSections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Costs, Pricing & Business Model" };

const GROUP_HEADING: Record<CostGroup, string> = {
  "platform-fixed": "Platform running costs (fixed)",
  "platform-usage": "Platform running costs (usage-based)",
  "dev-tools": "Development tools",
};

type AiUsage = Awaited<ReturnType<typeof getPlatformAiNeuronsToday>> | null;

const STATUS_STYLE: Record<CostStatus, string> = {
  actual: "bg-emerald-100 text-emerald-800",
  planned: "bg-sky-100 text-sky-800",
  estimate: "bg-amber-100 text-amber-800",
  unverified: "bg-slate-200 text-slate-700",
};

function costText(item: CostItem): string {
  if (item.basis === "open-licence") return "Free (open licence)";
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
              {item.basis === "open-licence" ? (
                <a
                  href={item.limits.sourceUrl}
                  className="underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Licence: {hostOf(item.limits.sourceUrl)}
                </a>
              ) : (
                <>Source: {hostOf(item.limits.sourceUrl)}</>
              )}
              , retrieved {item.limits.retrievedOn}.{" "}
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

  const now = new Date();
  const items = COMMITTED.costItems;
  const report = buildCostReport(items, now);
  const byId = new Map(items.map((item) => [item.id, item]));
  const analysis = analyseV2(COMMITTED, now);
  const staleIn = (...registries: StaleRegistry[]) =>
    analysis.stale.filter((entry) => registries.includes(entry.registry)).length;
  const overdue = analysis.recommendationOverdue ? 1 : 0;
  const recommendation = COMMITTED.recommendation;
  const a = COMMITTED.assumptions;

  // A failed read is "unavailable", never zero: a zero would read as "nothing used".
  let usage: AiUsage = null;
  try {
    usage = await getPlatformAiNeuronsToday();
  } catch {
    usage = null;
  }

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">
              Costs, Pricing &amp; Business Model
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            What the platform costs, what competitors charge, what we could charge, and which
            business model fits. Figures come from registries maintained in the codebase and updated
            by pull request; only Workers AI usage is read live.
          </p>
        </div>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <p
        data-costs="advisory"
        className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        Everything on this page is advisory. No figure here is realised revenue: the platform has
        not traded yet, so revenue and profit are projections from the stated assumptions. Nothing
        on this page changes live prices, subscriptions or any store&apos;s settings. Prices are in
        pounds excluding VAT unless marked in US dollars. Stripe Connect, with each shop as the
        seller paying its own card fees, is a planning assumption: payments still run through one
        platform account today.
      </p>

      <section data-section="costs" className="mb-10">
        <SectionHeader
          title="Costs"
          intro="What the platform costs now, what is planned, and what changes at renewal."
          lastUpdated={newestDate(items.map((item) => item.asOf))}
          staleCount={report.stale.length}
          csv="costs"
        />
        <p data-costs="currency-note" className="mb-4 text-xs text-slate-500">
          Prices are in US dollars as quoted by the provider. Your card is charged in pounds, so the
          amounts you pay will differ slightly.
        </p>

        {report.current.annualCents === 0 && (
          <p
            data-costs="zero-notice"
            className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
          >
            Nothing is currently billed.
          </p>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-3">
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
        </div>
        <p className="mb-8 text-xs text-slate-500">
          Usage-based and not-yet-priced items are in no total:{" "}
          {report.unpriced.map((id) => byId.get(id)?.name ?? id).join(", ") || "none"}.
        </p>

        <div className="mb-8 grid gap-6 md:grid-cols-2">
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
                  {renewal.amountCents === null
                    ? "Not priced"
                    : formatUsdCents(renewal.amountCents)}
                </li>
              ))}
            </ul>
            {report.renewals.length === 0 && (
              <p className="mt-3 text-sm text-slate-600">No dated renewals recorded.</p>
            )}
          </div>
        </div>

        {COST_GROUPS.map((group) => {
          const inGroup = items.filter((item) => item.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group} data-cost-group={group} className="mb-6">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                  {GROUP_HEADING[group]}
                </h3>
                <p data-cost-group-total={group} className="text-xs text-slate-500">
                  {formatUsdCents(report.byGroup[group].monthlyCents)}/month,{" "}
                  {formatUsdCents(report.byGroup[group].annualCents)}/year (actual)
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {inGroup.map((item) => (
                  <ItemCard key={item.id} item={item} usage={usage} />
                ))}
              </div>
            </div>
          );
        })}

        <div
          data-costs="owner-to-confirm"
          className="rounded-2xl border border-black/10 bg-slate-50 p-5 text-sm text-slate-700"
        >
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
            Owner to confirm
          </h3>
          {report.ownerToConfirm.length === 0 ? (
            <p className="mt-2">Nothing waiting for the owner.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5">
              {report.ownerToConfirm.map((id) => (
                <li key={id} data-owner-to-confirm={id}>
                  {byId.get(id)?.name ?? id}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ProductionSection
        analysis={analysis}
        drivers={COMMITTED.drivers}
        connect={COMMITTED.connect}
        header={
          <SectionHeader
            title="Production costs as we grow"
            intro="What the platform will cost in production at different numbers of shops and orders."
            lastUpdated={newestDate([
              ...COMMITTED.drivers.map((d) => d.asOf),
              ...COMMITTED.connect.map((c) => c.retrievedOn),
            ])}
            staleCount={staleIn("cost-drivers", "connect")}
            csv="production"
          />
        }
      />

      <CompetitorsSection
        competitors={COMMITTED.competitors}
        header={
          <SectionHeader
            title="Competitors"
            intro="What comparable services charge, read from each provider's own pricing page."
            lastUpdated={newestDate(COMMITTED.competitors.map((c) => c.researchedOn))}
            staleCount={staleIn("competitors")}
            csv="competitors"
          />
        }
      />

      <ModelsSection
        models={COMMITTED.models}
        recommendation={recommendation}
        analysis={analysis}
        assumptions={a}
        header={
          <SectionHeader
            title="Business models"
            intro="Four ways to charge that grow with a shop's orders, and what each costs a shop against the alternatives."
            lastUpdated={recommendation.reviewedOn}
            staleCount={staleIn("assumptions") + overdue}
            csv="models"
          />
        }
      />

      <section data-section="what-if" className="mb-10 print:hidden">
        <h2 className="mb-1 text-xl font-bold text-slate-900">What if</h2>
        <p className="mb-4 text-sm text-slate-500">
          Try other rates, hours, baskets and volumes. The committed figures above do not change.
        </p>
        <PricingWhatIf
          inputs={analysis.inputs}
          models={COMMITTED.models.map((m) => ({ id: m.id, name: m.name, pricing: m.pricing }))}
          defaults={{
            ratePence: assumptionValue(a, "partner-hourly-rate-pence"),
            increaseBps: assumptionValue(a, "partner-rate-yearly-increase-bps"),
            minutesPerShop: analysis.inputs.partnerMinutesPerShopMonth,
            onboardingMinutes: analysis.inputs.onboardingMinutesPerShop,
            payTargetPence: analysis.payTargetPence,
            basketPence: analysis.referenceScenario.basketPence,
            ordersPerShop: analysis.referenceScenario.ordersPerShop,
            shops: analysis.referenceScenario.shops,
          }}
        />
      </section>

      <AddOnsSection
        addOns={COMMITTED.addOns}
        launchIds={recommendation.launchAddOnIds}
        models={COMMITTED.models}
        header={
          <SectionHeader
            title="Add-ons"
            intro="Paid extras, what each costs us to run, and whether it is bundled or sold separately."
            lastUpdated={newestDate(COMMITTED.addOns.map((x) => x.asOf))}
            staleCount={staleIn("add-ons")}
            csv="add-ons"
          />
        }
      />

      <RisksSection
        risks={COMMITTED.risks}
        header={
          <SectionHeader
            title="Risks and gaps"
            intro="What will cost money or create risk as we grow and is not priced elsewhere. Not legal or tax advice."
            lastUpdated={newestDate(COMMITTED.risks.map((r) => r.asOf))}
            staleCount={staleIn("risks")}
            csv="risks"
          />
        }
      />

      <RecommendationSection
        recommendation={recommendation}
        models={COMMITTED.models}
        addOns={COMMITTED.addOns}
        analysis={analysis}
        header={
          <SectionHeader
            title="Recommendation"
            intro="One model and add-on set for launch, the founding-partner offer, and when to re-price."
            lastUpdated={recommendation.reviewedOn}
            staleCount={overdue}
            csv="models"
          />
        }
      />

      <section data-section="review" className="mb-10">
        <h2 className="mb-1 text-xl font-bold text-slate-900">Review</h2>
        <p className="mb-4 text-sm text-slate-500">
          Fetch the pricing pages behind these figures and compare them with what is recorded.
          Reviews are recommended monthly for costs and quarterly for subscriptions, competitors and
          pricing; a GitHub issue opens each quarter as a reminder.
        </p>
        <PricingReviewPanel lastAnalysis={recommendation.reviewedOn} />
      </section>
    </PageContainer>
  );
}
