import type { ReactNode } from "react";
import { addOnMarginBps, type AddOn } from "@/lib/pricing/add-ons";
import type { Assumption } from "@/lib/pricing/assumptions";
import {
  COMPARATORS,
  type BusinessModel,
  type Recommendation,
} from "@/lib/pricing/business-models";
import type { PricingAnalysisV2 } from "@/lib/pricing/committed";
import { SEGMENT_LABEL, type Competitor, type CompetitorSegment } from "@/lib/pricing/competitors";
import { CONNECT_MODELLED, type ConnectOption } from "@/lib/pricing/connect";
import { DRIVER_GROUP_LABEL, type CostDriver, type DriverGroup } from "@/lib/pricing/cost-drivers";
import type { CsvSection } from "@/lib/pricing/csv";
import { formatBps, formatMoney, gbp, type Money } from "@/lib/pricing/money";
import type { Risk } from "@/lib/pricing/risks";
import type { PricingModelParams } from "@/lib/pricing/volume-model";

/**
 * #1309, #1313 - the sections of /staff/platform/costs after Costs. Server components, display only:
 * every value comes from the committed registries or `analyseV2`, never from a refresh suggestion or
 * a What if entry.
 */

const CARD = "rounded-2xl border border-black/10 bg-white p-5 shadow-sm";
const H3 = "mb-2 text-sm font-bold uppercase tracking-wide text-slate-600";

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

/** Pence as pounds, or "Unavailable" when a figure has no exchange rate. */
export function pence(value: number | null): string {
  return value === null ? "Unavailable (no exchange rate)" : formatMoney(gbp(value));
}

function shopsText(value: number | null): string {
  return value === null ? "More than 1,000 shops" : `${value} shop${value === 1 ? "" : "s"}`;
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

/** A pricing proposal in one plain-English line. */
export function describePricing(pricing: PricingModelParams): string {
  const p = (n: number) => formatMoney(gbp(n));
  switch (pricing.kind) {
    case "order-bands":
      return `${pricing.bands
        .map((b) => `${b.label}: ${p(b.monthlyFeePence)}/month`)
        .join("; ")}; then ${pricing.abovePerOrderPence}p per order above the top band`;
    case "allowance-per-order":
      return `${p(pricing.monthlyFeePence)}/month including ${pricing.includedOrders.toLocaleString("en-GB")} orders, then ${pricing.perOrderPence}p per order`;
    case "capped-per-order":
      return `${p(pricing.monthlyFeePence)}/month plus ${pricing.perOrderPence}p per order, per-order part capped at ${p(pricing.capPence)}/month`;
    case "customer-fee":
      return `${p(pricing.monthlyFeePence)}/month for the shop, plus a ${pricing.customerFeePerOrderPence}p service fee per order paid by the customer`;
  }
}

export function CompetitorsSection({
  competitors,
  header,
}: {
  competitors: readonly Competitor[];
  header: ReactNode;
}) {
  const segments = Object.keys(SEGMENT_LABEL) as CompetitorSegment[];
  return (
    <section data-section="competitors" className="mb-10">
      {header}
      {segments.map((segment) => {
        const inSegment = competitors.filter((c) => c.segment === segment);
        if (inSegment.length === 0) return null;
        return (
          <div key={segment} className="mb-6">
            <h3 className={H3}>{SEGMENT_LABEL[segment]}</h3>
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
      <p className="text-xs text-slate-500">
        What each of these would cost a shop, beside our models, is in Business models.
      </p>
    </section>
  );
}

function priceText(driver: CostDriver): string {
  const parts: string[] = [];
  if (driver.fixed) {
    parts.push(`${formatMoney(driver.fixed.amount)}/${driver.fixed.period}`);
  }
  if (driver.oneOff) parts.push(`${formatMoney(driver.oneOff)} one-off`);
  for (const part of driver.usage ?? []) {
    parts.push(
      `${formatMoney({ minor: part.price.minor, currency: part.price.currency })} per ${part.price.perUnits.toLocaleString("en-GB")} ${part.unit}`,
    );
  }
  return parts.join(" + ") || "Free";
}

function allowanceText(driver: CostDriver): string {
  const free = (driver.usage ?? []).filter((p) => p.freeUnits > 0);
  return free.length === 0
    ? "None"
    : free.map((p) => `${p.freeUnits.toLocaleString("en-GB")} ${p.unit}/month`).join("; ");
}

export function ProductionSection({
  analysis,
  drivers,
  connect,
  header,
}: {
  analysis: PricingAnalysisV2;
  drivers: readonly CostDriver[];
  connect: readonly ConnectOption[];
  header: ReactNode;
}) {
  const basket = analysis.referenceScenario.basketPence;
  const rows = analysis.grid.filter(
    (g) => g.basketPence === basket && g.modelId === analysis.models[0]?.modelId,
  );
  const shopsList = [...new Set(rows.map((r) => r.shops))];
  const ordersList = [...new Set(rows.map((r) => r.ordersPerShop))];
  const at = (shops: number, orders: number) =>
    rows.find((r) => r.shops === shops && r.ordersPerShop === orders)?.evaluation;
  const groups = Object.keys(DRIVER_GROUP_LABEL) as DriverGroup[];
  const nameOf = (id: string) => drivers.find((d) => d.id === id)?.name ?? id;

  return (
    <section data-section="production" className="mb-10">
      {header}
      <p className="mb-4 text-xs text-slate-500">
        Monthly, in pounds excluding VAT, at a {formatMoney(gbp(basket))} basket. Our cost here
        excludes partner time, which is shown separately below. Unit prices are the providers&apos;;
        the usage behind them is our estimate.
      </p>

      <div className={`${CARD} mb-4 overflow-x-auto`}>
        <h3 className={H3}>Our monthly cost, excluding partner time</h3>
        <table data-costs="production-grid" className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2">Shops</th>
              {ordersList.map((o) => (
                <th key={o} className="py-1 pr-2">
                  {o.toLocaleString("en-GB")} orders/shop
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {shopsList.map((shops) => (
              <tr key={shops}>
                <td className="py-1 pr-2 font-bold">{shops}</td>
                {ordersList.map((orders) => {
                  const e = at(shops, orders);
                  const c = e?.cost;
                  const nonPeople =
                    !c || c.currentFixedPence === null || c.driversPence === null
                      ? null
                      : c.currentFixedPence + c.driversPence + c.connectPence;
                  return (
                    <td
                      key={orders}
                      data-production-cell={`${shops}-${orders}`}
                      className="py-1 pr-2"
                    >
                      {pence(nonPeople)}
                      {nonPeople !== null && (
                        <span className="block text-slate-500">
                          {(nonPeople / (shops * orders)).toFixed(1)}p/order
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${CARD} mb-4 text-sm text-slate-700`}>
        <h3 className={H3}>Partner time</h3>
        <p className="mb-2 text-xs text-slate-500">
          {analysis.inputs.partnerMinutesPerShopMonth} minutes per shop per month, plus{" "}
          {analysis.inputs.onboardingMinutesPerShop} onboarding minutes spread over{" "}
          {analysis.inputs.onboardingAmortisationMonths} months, at the year-1 rate of{" "}
          {analysis.partnerRates[0] === null
            ? "an unknown rate"
            : `${formatMoney(gbp(analysis.partnerRates[0]))} an hour`}
          . The same at every order volume.
        </p>
        <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          {shopsList.map((shops) => (
            <li key={shops} data-partner-time={shops}>
              {shops} shop{shops === 1 ? "" : "s"}:{" "}
              {pence(at(shops, ordersList[0])?.cost.partnerTimePence ?? null)}
            </li>
          ))}
        </ul>
      </div>

      <div className={`${CARD} mb-4 text-sm text-slate-700`}>
        <h3 className={H3}>Which free allowance runs out first</h3>
        <ul className="space-y-1">
          {analysis.firstLimits.map(({ ordersPerShop, limit }) => (
            <li key={ordersPerShop} data-first-limit={ordersPerShop}>
              At {ordersPerShop.toLocaleString("en-GB")} orders per shop:{" "}
              {limit === null
                ? "No free allowance runs out below 1,001 shops"
                : `${nameOf(limit.driverId)} (${limit.unit}) at ${shopsText(limit.shops)}`}
            </li>
          ))}
        </ul>
        <p data-costs="startup" className="mt-3">
          Start-up one-off costs: {pence(analysis.startupPence)} (company formation and legal
          templates), not in any monthly figure.
        </p>
      </div>

      <div className={`${CARD} mb-4 text-sm text-slate-700`}>
        <h3 className={H3}>Stripe Connect options</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {connect.map((option) => (
            <div
              key={option.id}
              data-connect-option={option.id}
              className="rounded-xl bg-slate-50 p-3"
            >
              <p className="font-bold text-slate-900">{option.stripeName}</p>
              <p className="mt-1 text-xs">
                {option.platformFee === null
                  ? "No platform fees"
                  : `£${(option.platformFee.activeAccountPence / 100).toFixed(2)} per monthly active account, ${formatBps(option.platformFee.payoutBps)} + ${option.platformFee.payoutFixedPence}p per payout`}
              </p>
              <p className="mt-1 text-xs">{option.summary}</p>
              {option.id === CONNECT_MODELLED && (
                <p data-costs="connect-modelled" className="mt-1 text-xs font-bold">
                  Modelled on this page
                </p>
              )}
              <Source url={option.sourceUrl} on={option.retrievedOn} />
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <h3 className={H3}>Cost lines</h3>
        {groups.map((group) => (
          <div key={group} className="mb-3">
            <p className="text-xs font-bold text-slate-700">{DRIVER_GROUP_LABEL[group]}</p>
            <ul className="divide-y divide-slate-100 text-xs text-slate-700">
              {drivers
                .filter((d) => d.group === group)
                .map((d) => (
                  <li key={d.id} data-cost-driver={d.id} className="py-2">
                    <p className="font-bold text-slate-900">
                      {d.name} <span className="font-normal text-slate-500">({d.provider})</span>
                    </p>
                    <p>
                      {priceText(d)} · Free allowance: {allowanceText(d)}
                    </p>
                    <p className="text-slate-500">
                      {d.sourceUrl ? (
                        <Source url={d.sourceUrl} on={d.asOf} />
                      ) : (
                        <>Estimate, {d.asOf}</>
                      )}
                    </p>
                    <p className="text-slate-500">{d.note}</p>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonTable({
  analysis,
  models,
  basketPence,
}: {
  analysis: PricingAnalysisV2;
  models: readonly BusinessModel[];
  basketPence: number;
}) {
  const orders = [...new Set(analysis.comparisons.map((c) => c.ordersPerShop))];
  const shops = analysis.referenceScenario.shops;
  const ours = (modelId: string, o: number) =>
    analysis.grid.find(
      (g) =>
        g.modelId === modelId &&
        g.shops === shops &&
        g.ordersPerShop === o &&
        g.basketPence === basketPence,
    )?.evaluation.shopPays.totalPence ?? null;
  const theirs = (id: string, o: number) =>
    analysis.comparisons.find(
      (c) => c.comparatorId === id && c.ordersPerShop === o && c.basketPence === basketPence,
    );
  return (
    <div className="overflow-x-auto">
      <table data-comparison-basket={basketPence} className="w-full table-fixed text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="w-2/5 py-1 pr-1">Per shop per month</th>
            {orders.map((o) => (
              <th key={o} className="py-1 pr-1">
                {o.toLocaleString("en-GB")} orders
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {models.map((m) => (
            <tr key={m.id} data-comparison-row={m.id} className="font-bold text-slate-900">
              <td className="py-1 pr-1">{m.name}</td>
              {orders.map((o) => (
                <td
                  key={o}
                  data-comparison-cell={`${m.id}-${o}-${basketPence}`}
                  className="py-1 pr-1"
                >
                  {pence(ours(m.id, o))}
                </td>
              ))}
            </tr>
          ))}
          {COMPARATORS.map((c) => (
            <tr key={c.id} data-comparison-row={c.id}>
              <td className="py-1 pr-1">{c.label}</td>
              {orders.map((o) => {
                const row = theirs(c.id, o);
                return (
                  <td
                    key={o}
                    data-comparison-cell={`${c.id}-${o}-${basketPence}`}
                    className="py-1 pr-1"
                  >
                    {pence(row?.monthlyPence ?? null)}
                    {row?.setupPence ? (
                      <span className="block text-slate-500">
                        + {formatMoney(gbp(row.setupPence))} one-off
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModelsSection({
  models,
  recommendation,
  analysis,
  assumptions,
  header,
}: {
  models: readonly BusinessModel[];
  recommendation: Recommendation;
  analysis: PricingAnalysisV2;
  assumptions: readonly Assumption[];
  header: ReactNode;
}) {
  const ref = analysis.referenceScenario;
  const baskets = [...new Set(analysis.comparisons.map((c) => c.basketPence))];
  const others = baskets.filter((b) => b !== ref.basketPence);
  const cardBps = assumptions.find((a) => a.id === "card-fee-bps")?.value ?? null;
  const cardFixed = assumptions.find((a) => a.id === "card-fee-fixed-pence")?.value ?? null;
  const cardText = `${cardBps === null ? "?" : formatBps(cardBps)} + ${cardFixed ?? "?"}p per order, UK cards`;

  return (
    <section data-section="models" className="mb-10">
      {header}
      <p className="mb-4 text-xs text-slate-500">
        Our figures are at the reference scenario: {ref.shops} shops, {ref.ordersPerShop} orders a
        month each, {formatMoney(gbp(ref.basketPence))} basket. &ldquo;Shop pays&rdquo; for our
        models:{" "}
        <span data-costs="card-fee-note">Includes the shop&apos;s own card fees ({cardText})</span>{" "}
        and expected dispute fees under Stripe Connect. None of our models takes a percentage of
        sales.
      </p>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {models.map((model) => {
          const result = analysis.models.find((m) => m.modelId === model.id);
          const r = result?.reference;
          const recommended = model.id === recommendation.modelId;
          return (
            <article
              key={model.id}
              data-model={model.id}
              className={`${CARD} ${recommended ? "ring-2 ring-emerald-500" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">{model.name}</h3>
                <span className="flex gap-1">
                  {recommended && (
                    <span
                      data-costs="recommended"
                      className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800"
                    >
                      Recommended
                    </span>
                  )}
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    Proposal
                  </span>
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{model.description}</p>
              <p data-model-prices className="mt-2 text-sm font-bold text-slate-900">
                {describePricing(model.pricing)}
              </p>
              {r && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                  <dt>Shop pays / month</dt>
                  <dd data-model-figure="shop-pays">{pence(r.shopPays.totalPence)}</dd>
                  <dt>Our revenue / month</dt>
                  <dd data-model-figure="revenue">{pence(r.revenuePence)}</dd>
                  <dt>Our cost / month</dt>
                  <dd data-model-figure="cost">{pence(r.cost.totalPence)}</dd>
                  <dt>Our margin / month</dt>
                  <dd data-model-figure="margin">{pence(r.marginPence)}</dd>
                  <dt>Margin per shop</dt>
                  <dd data-model-figure="margin-per-shop">{pence(r.marginPerShopPence)}</dd>
                  <dt>Shops to fund the pay target</dt>
                  <dd data-model-figure="pay-target">
                    {analysis.payTargetPence === null
                      ? "Enter a pay target in What if"
                      : shopsText(result!.breakEvenForPayTarget)}
                  </dd>
                  <dt>Break-even incl. partner time</dt>
                  <dd data-model-figure="break-even">
                    {shopsText(result!.breakEvenIncludingTime)}
                  </dd>
                  <dt>VAT threshold reached at</dt>
                  <dd data-model-figure="vat">{shopsText(result!.vatThresholdShops)}</dd>
                </dl>
              )}
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
              <p className="mt-1 text-xs text-slate-500">{model.vatNote}</p>
            </article>
          );
        })}
      </div>

      <div data-comparison className={CARD}>
        <h3 className={H3}>What a shop pays: our models and the alternatives</h3>
        <p className="mb-2 text-xs text-slate-500">
          At a {formatMoney(gbp(ref.basketPence))} basket. Comparators exclude disputes; one-off
          setup fees are shown, never folded in.
        </p>
        <ComparisonTable analysis={analysis} models={models} basketPence={ref.basketPence} />
        {others.map((b) => (
          <details key={b} data-comparison-details={b} className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">
              At a {formatMoney(gbp(b))} basket
            </summary>
            <div className="mt-2">
              <ComparisonTable analysis={analysis} models={models} basketPence={b} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function AddOnsSection({
  addOns,
  launchIds,
  models,
  header,
}: {
  addOns: readonly AddOn[];
  launchIds: readonly string[];
  models: readonly BusinessModel[];
  header: ReactNode;
}) {
  const included = (a: AddOn) => {
    if (a.packaging === "separate") return "Sold separately";
    const target = a.packaging.includedIn;
    return `Included in ${models.find((m) => m.id === target)?.name ?? target}`;
  };
  const billing = (a: AddOn) =>
    a.price.billing === "one-off" ? "one-off" : a.price.billing === "month" ? "a month" : "each";
  return (
    <section data-section="add-ons" className="mb-10">
      {header}
      <div className="grid gap-4 md:grid-cols-2">
        {addOns.map((a) => (
          <article key={a.id} data-add-on={a.id} className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">{a.name}</h3>
              <span className="flex flex-wrap gap-1">
                {launchIds.includes(a.id) && (
                  <span
                    data-add-on-launch
                    className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800"
                  >
                    In the launch set
                  </span>
                )}
                {!a.available && (
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                    Not available yet
                  </span>
                )}
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {formatMoney(gbp(a.price.pence))} {billing(a)}{" "}
              <span className="font-normal text-slate-500">({a.price.unit})</span>
            </p>
            <p className="mt-1 text-xs text-slate-700">
              Our cost: {formatMoney(gbp(a.runCost.pence))} (
              {a.runCost.basis === "estimate" ? "estimate" : "provider price"}) · Margin{" "}
              {formatBps(addOnMarginBps(a))}
            </p>
            <p data-add-on-class={a.marginClass} className="mt-1 text-xs font-bold text-slate-700">
              {a.marginClass === "cheap-high-margin"
                ? "Cheap to run, high margin"
                : "Usage-heavy: priced to cover use"}{" "}
              · {included(a)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{a.runCost.derivation}</p>
            <p className="mt-1 text-xs text-slate-500">{a.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const WHO_BEARS: Record<Risk["whoBears"], string> = {
  platform: "Us",
  shop: "The shop",
  customer: "The customer",
  shared: "Shared",
};

export function RisksSection({ risks, header }: { risks: readonly Risk[]; header: ReactNode }) {
  return (
    <section data-section="risks" className="mb-10">
      {header}
      <div className="grid gap-4 md:grid-cols-2">
        {risks.map((r) => (
          <article key={r.id} data-risk={r.id} className={CARD}>
            <h3 className="text-base font-bold text-slate-900">{r.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{r.summary}</p>
            <p className="mt-2 text-xs text-slate-700">
              <strong>Who bears it:</strong> {WHO_BEARS[r.whoBears]} · <strong>Cost:</strong>{" "}
              {r.cost === null
                ? "No figure"
                : `${formatMoney(gbp(r.cost.pence))} ${r.cost.period === "per-event" ? "each" : r.cost.period === "one-off" ? "one-off" : `a ${r.cost.period}`} (${r.cost.basis === "estimate" ? "estimate" : "published"})`}
            </p>
            <p className="mt-1 text-xs text-slate-700">
              <strong>What to do:</strong> {r.action}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {r.sourceUrl && <Source url={r.sourceUrl} on={r.asOf} />}
              {r.issues.map((n) => (
                <a
                  key={n}
                  href={`https://github.com/sriahead/aheed-online-store/issues/${n}`}
                  className="ml-2 underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  #{n}
                </a>
              ))}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RecommendationSection({
  recommendation,
  models,
  addOns,
  analysis,
  header,
}: {
  recommendation: Recommendation;
  models: readonly BusinessModel[];
  addOns: readonly AddOn[];
  analysis: PricingAnalysisV2;
  header: ReactNode;
}) {
  const model = models.find((m) => m.id === recommendation.modelId);
  const offer = recommendation.foundingOffer;
  return (
    <section data-section="recommendation" className="mb-10">
      {header}
      {analysis.recommendationDisagrees && (
        <p
          data-costs="recommendation-disagrees"
          className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900"
        >
          The current numbers no longer support this recommendation: at the reference scenario it
          loses money, or another model earns more and costs the shop less. Review it.
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
        <article className={CARD}>
          <h3 className={H3}>Public price list (shop two onwards)</h3>
          <p data-recommendation="model" className="text-base font-bold text-slate-900">
            {model?.name ?? recommendation.modelId}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {model ? describePricing(model.pricing) : "Not found"}
          </p>
          <p className="mt-2 text-xs text-slate-500">{model?.vatNote}</p>
          <h3 className={`${H3} mt-4`}>Launch add-ons</h3>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {recommendation.launchAddOnIds.map((id) => (
              <li key={id} data-launch-add-on={id}>
                {addOns.find((a) => a.id === id)?.name ?? id}
              </li>
            ))}
          </ul>
        </article>

        <article data-founding-offer className={CARD}>
          <h3 className={H3}>Founding-partner offer</h3>
          <p className="text-base font-bold text-slate-900">{offer.shopName}</p>
          <p className="mt-1 text-sm text-slate-700">{describePricing(offer.pricing)}</p>
          <p className="mt-1 text-xs text-slate-600">
            From <span data-founding="starts">{offer.startsOn}</span>; review on{" "}
            <span data-founding="review">{offer.reviewOn}</span>.
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
            {offer.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-700">
            <strong>Review clause:</strong> {offer.reviewClause}
          </p>
        </article>

        <article className={CARD}>
          <h3 className={H3}>Track every month</h3>
          <ul className="space-y-2 text-sm text-slate-700">
            {recommendation.trackMonthly.map((t) => (
              <li key={t.id} data-track={t.id}>
                <p className="font-bold text-slate-900">{t.name}</p>
                <p className="text-xs">{t.definition}</p>
                <p className="text-xs text-slate-500">Re-price when: {t.rePriceWhen}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className={CARD}>
          <h3 className={H3}>What would change this</h3>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {recommendation.changeTriggers.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <h3 className={`${H3} mt-4`}>Why</h3>
          <ul className="list-disc pl-5 text-xs text-slate-700">
            {recommendation.reasoning.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Reviewed {recommendation.reviewedOn}; next review due {recommendation.nextReviewDue}.
          </p>
        </article>
      </div>
    </section>
  );
}
