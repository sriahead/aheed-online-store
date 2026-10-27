import type { ReactNode } from "react";
import type { PricingAnalysis } from "@/lib/pricing/analysis";
import type { Assumption } from "@/lib/pricing/assumptions";
import type { BusinessModel, Recommendation } from "@/lib/pricing/business-models";
import { SEGMENT_LABEL, type Competitor, type CompetitorSegment } from "@/lib/pricing/competitors";
import { formatBps, formatMoney, gbp, type Money } from "@/lib/pricing/money";
import type { ProposedPlan } from "@/lib/pricing/proposed-plans";
import type { CsvSection } from "@/lib/pricing/csv";

/**
 * #1309 - the competitor, pricing, profitability and business-model sections of
 * /staff/platform/costs. Server components, display only: every value comes from the committed
 * registries or `buildPricingAnalysis`, never from a refresh suggestion.
 */

const CARD = "rounded-2xl border border-black/10 bg-white p-5 shadow-sm";

export function SectionHeader({
  title,
  intro,
  lastUpdated,
  staleCount,
  csv,
}: {
  title: string;
  intro: string;
  lastUpdated: string | null;
  staleCount: number;
  csv: CsvSection;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{intro}</p>
        <p className="mt-1 text-xs text-slate-500">
          <span data-section-updated>Last updated {lastUpdated ?? "never"}</span> &middot;{" "}
          <span data-section-stale={staleCount}>
            {staleCount === 0 ? "Nothing stale" : `${staleCount} stale`}
          </span>
        </p>
      </div>
      <a
        href={`/staff/platform/costs/export?section=${csv}`}
        data-csv-link={csv}
        className="inline-flex shrink-0 items-center rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 print:hidden"
      >
        Download CSV
      </a>
    </div>
  );
}

function fee(money: Money | null): string {
  return money === null ? "None stated" : formatMoney(money);
}

function cardFee(plan: Competitor["plans"][number]): string {
  return plan.cardFee === null
    ? "None stated"
    : `${formatBps(plan.cardFee.bps)} + ${formatMoney(plan.cardFee.fixed)}`;
}

function Source({ url, on }: { url: string; on: string }) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep the raw value
  }
  return (
    <span className="text-xs text-slate-500">
      Source:{" "}
      <a href={url} className="underline" rel="noopener noreferrer" target="_blank">
        {host}
      </a>
      , read {on}
    </span>
  );
}

export function CompetitorsSection({
  competitors,
  plans,
  header,
}: {
  competitors: readonly Competitor[];
  plans: readonly ProposedPlan[];
  header: ReactNode;
}) {
  const segments = Object.keys(SEGMENT_LABEL) as CompetitorSegment[];
  const published = competitors.flatMap((c) => c.plans.map((plan) => ({ competitor: c, plan })));
  return (
    <section data-section="competitors" className="mb-10">
      {header}
      {segments.map((segment) => {
        const inSegment = competitors.filter((c) => c.segment === segment);
        if (inSegment.length === 0) return null;
        return (
          <div key={segment} className="mb-6">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              {SEGMENT_LABEL[segment]}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {inSegment.map((c) => (
                <article key={c.id} data-competitor={c.id} className={CARD}>
                  <h4 className="text-base font-bold text-slate-900">{c.name}</h4>
                  {c.researchStatus === "not-published" && (
                    <p className="mt-2 text-sm text-slate-700">Not published by the provider</p>
                  )}
                  {c.researchStatus === "not-readable" && (
                    <p className="mt-2 text-sm text-slate-700">Pricing page could not be read</p>
                  )}
                  {c.researchStatus === "published" && (
                    <ul className="mt-2 space-y-3 text-sm text-slate-700">
                      {c.plans.map((plan) => (
                        <li key={plan.name}>
                          <p className="font-bold text-slate-900">{plan.name}</p>
                          <p>
                            Monthly fee: {fee(plan.monthlyFee)}
                            {plan.setupFee && ` · Setup: ${formatMoney(plan.setupFee)}`}
                          </p>
                          <p>
                            Commission:{" "}
                            {plan.commissionBps === null
                              ? "None stated"
                              : formatBps(plan.commissionBps)}{" "}
                            · Card fee: {cardFee(plan)}
                          </p>
                          {[...plan.addOns, ...plan.extraCharges].length > 0 && (
                            <p className="text-xs text-slate-500">
                              {[...plan.addOns, ...plan.extraCharges].join("; ")}
                            </p>
                          )}
                          <Source url={plan.sourceUrl} on={plan.retrievedOn} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-slate-500">Researched {c.researchedOn}</p>
                  {c.note && <p className="mt-1 text-xs text-slate-500">{c.note}</p>}
                </article>
              ))}
            </div>
          </div>
        );
      })}

      <div className={`${CARD} overflow-x-auto`}>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
          Our proposals beside published plans
        </h3>
        <table data-costs="comparison" className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-3">Our plan</th>
              <th className="py-1 pr-3">Fee / commission</th>
              <th className="py-1 pr-3">Competitor plan</th>
              <th className="py-1 pr-3">Fee / commission / card fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {plans.flatMap((ours) =>
              published.map(({ competitor, plan }) => (
                <tr key={`${ours.id}-${competitor.id}-${plan.name}`} data-comparison-row>
                  <td className="py-1 pr-3">{ours.name}</td>
                  <td className="py-1 pr-3">
                    {formatMoney(gbp(ours.monthlyFeePence))} / {formatBps(ours.commissionBps)}
                  </td>
                  <td className="py-1 pr-3">
                    {competitor.name} {plan.name}
                  </td>
                  <td className="py-1 pr-3">
                    {fee(plan.monthlyFee)} /{" "}
                    {plan.commissionBps === null ? "None stated" : formatBps(plan.commissionBps)} /{" "}
                    {cardFee(plan)}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PricingSection({
  plans,
  header,
}: {
  plans: readonly ProposedPlan[];
  header: ReactNode;
}) {
  return (
    <section data-section="pricing" className="mb-10">
      {header}
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.id} data-plan={plan.id} className={CARD}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {plan.name}{" "}
                <span className="text-xs font-normal text-slate-500">({plan.model})</span>
              </h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Proposal
              </span>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {formatMoney(gbp(plan.monthlyFeePence))}/month + {formatBps(plan.commissionBps)} per
              sale
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              {plan.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {plan.addOns.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                Add-ons:{" "}
                {plan.addOns
                  .map((a) => `${a.name} (${formatMoney(gbp(a.monthlyFeePence))}/month)`)
                  .join("; ")}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-600">{plan.positioning}</p>
            <p className="mt-1 text-xs text-slate-500">{plan.vatNote}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function pence(value: number | null): string {
  return value === null ? "No exchange rate" : formatMoney(gbp(value));
}

function margin(bps: number | null): string {
  return bps === null ? "n/a" : formatBps(bps);
}

export function breakEvenText(
  planFeePence: number,
  result: PricingAnalysis["plans"][number] | undefined,
  costPence: number | null,
): string {
  if (!result) return "Not modelled";
  if (costPence === null) return "No exchange rate";
  if (result.breakEvenVendors !== null) {
    return `${result.breakEvenVendors} vendor${result.breakEvenVendors === 1 ? "" : "s"} at zero sales`;
  }
  if (result.breakEvenGmvPence !== null) {
    return `${formatMoney(gbp(result.breakEvenGmvPence))} of vendor sales per month`;
  }
  if (planFeePence === 0 && (result.netVariableBps ?? 0) <= 0) {
    return "Commission does not cover card fees";
  }
  return "Not applicable";
}

export function ProfitabilitySection({
  analysis,
  plans,
  fx,
  header,
}: {
  analysis: PricingAnalysis;
  plans: readonly ProposedPlan[];
  fx: Assumption | undefined;
  header: ReactNode;
}) {
  const byId = new Map(analysis.plans.map((p) => [p.planId, p]));
  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  return (
    <section data-section="profitability" className="mb-10">
      {header}
      <div className={`${CARD} mb-4 text-sm text-slate-700`}>
        {analysis.costPence === null || !fx || fx.value === null ? (
          <p data-costs="fx">No exchange rate: GBP figures unavailable</p>
        ) : (
          <p data-costs="fx">
            Platform cost {pence(analysis.costPence)} per month (US${" "}
            {(analysis.costUsdCents / 100).toFixed(2)} with planned items, at {fx.value} US cents
            per £1, {fx.asOf}). {fx.sourceUrl && <Source url={fx.sourceUrl} on={fx.asOf} />}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Card fee assumed{" "}
          {analysis.cardFeeBps === null ? "unknown" : formatBps(analysis.cardFeeBps)} of sales, paid
          by the platform. Excludes the per-order card fee.
        </p>
      </div>

      <div className={`${CARD} mb-4 overflow-x-auto`}>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
          Break-even
        </h3>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3">Plan</th>
              <th className="py-1 pr-3">Net per £1,000 of sales</th>
              <th className="py-1 pr-3">Break-even</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {plans.map((plan) => {
              const r = byId.get(plan.id);
              return (
                <tr key={plan.id} data-break-even={plan.id}>
                  <td className="py-1 pr-3">{plan.name}</td>
                  <td className="py-1 pr-3">
                    {r?.netVariableBps == null
                      ? "Unknown"
                      : formatMoney(gbp(r.netVariableBps * 10))}
                  </td>
                  <td className="py-1 pr-3">
                    {breakEvenText(plan.monthlyFeePence, r, analysis.costPence)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`${CARD} mb-4 overflow-x-auto`}>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
          At zero sales
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          What-if vendor counts, monthly, fees only. These are not forecasts.
        </p>
        <table data-costs="scenarios" className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3">Plan</th>
              <th className="py-1 pr-3">Vendors</th>
              <th className="py-1 pr-3">Revenue</th>
              <th className="py-1 pr-3">Cost</th>
              <th className="py-1 pr-3">Profit</th>
              <th className="py-1 pr-3">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {analysis.scenarios.map((s) => (
              <tr key={`${s.planId}-${s.vendors}`} data-scenario={`${s.planId}-${s.vendors}`}>
                <td className="py-1 pr-3">{name(s.planId)}</td>
                <td className="py-1 pr-3">{s.vendors}</td>
                <td className="py-1 pr-3">{formatMoney(gbp(s.revenuePence))}</td>
                <td className="py-1 pr-3">{pence(s.costPence)}</td>
                <td className="py-1 pr-3">{pence(s.profitPence)}</td>
                <td className="py-1 pr-3">{margin(s.marginBps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${CARD} text-sm text-slate-700`}>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">Ranking</h3>
        <p data-ranking="vendors">
          Fewest vendors to break even: {analysis.ranking.byVendors.map(name).join(" → ") || "none"}
        </p>
        <p data-ranking="gmv" className="mt-1">
          Least sales to break even (no-fee plans):{" "}
          {analysis.ranking.byGmv.map(name).join(" → ") || "none"}
        </p>
      </div>
    </section>
  );
}

export function ModelsSection({
  models,
  recommendation,
  analysis,
  plans,
  header,
}: {
  models: readonly BusinessModel[];
  recommendation: Recommendation;
  analysis: PricingAnalysis;
  plans: readonly ProposedPlan[];
  header: ReactNode;
}) {
  return (
    <section data-section="models" className="mb-10">
      {header}
      {analysis.recommendationDisagrees && (
        <p
          data-costs="recommendation-disagrees"
          className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900"
        >
          The current numbers no longer put the recommended model&apos;s plan first. Review the
          recommendation.
        </p>
      )}
      {analysis.recommendationOverdue && (
        <p
          data-costs="recommendation-overdue"
          className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900"
        >
          The recommendation was due for review on {recommendation.nextReviewDue}.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {models.map((model) => {
          const plan = plans.find((p) => p.id === model.representativePlanId);
          const result = analysis.plans.find((p) => p.planId === model.representativePlanId);
          const recommended = model.id === recommendation.modelId;
          return (
            <article
              key={model.id}
              data-model={model.id}
              className={`${CARD} ${recommended ? "ring-2 ring-emerald-500" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">{model.name}</h3>
                {recommended && (
                  <span
                    data-costs="recommended"
                    className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800"
                  >
                    Recommended
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-700">{model.description}</p>
              <p className="mt-2 text-sm font-bold text-slate-900">
                Expected profitability:{" "}
                {plan
                  ? breakEvenText(plan.monthlyFeePence, result, analysis.costPence)
                  : "Not modelled"}
              </p>
              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div>
                  <dt className="inline font-bold">Advantages: </dt>
                  <dd className="inline">{model.advantages.join("; ")}</dd>
                </div>
                <div>
                  <dt className="inline font-bold">Disadvantages: </dt>
                  <dd className="inline">{model.disadvantages.join("; ")}</dd>
                </div>
                <div>
                  <dt className="inline font-bold">Risks: </dt>
                  <dd className="inline">{model.risks.join("; ")}</dd>
                </div>
              </dl>
              {recommended && (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
                  <ul className="list-disc pl-4">
                    {recommendation.reasoning.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Reviewed {recommendation.reviewedOn}; next review due{" "}
                    {recommendation.nextReviewDue}.
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
