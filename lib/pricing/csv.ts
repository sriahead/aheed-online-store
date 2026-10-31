import type { CostItem } from "@/lib/running-costs";
import { addOnMarginBps } from "@/lib/pricing/add-ons";
import type { PricingAnalysisV2, Registries } from "@/lib/pricing/committed";
import type { Money } from "@/lib/pricing/money";
import type { SourceResult } from "@/lib/pricing/refresh";
import { roundHalfUp } from "@/lib/pricing/money";

/**
 * #1309, #1313 - CSV for the costs dashboard. Pure. RFC 4180 quoting, and any text cell starting with
 * `=`, `+`, `-` or `@` gets a leading `'` so a spreadsheet does not run it as a formula. Money columns
 * are minor units plus a currency column, never a formatted string, so a spreadsheet never re-parses
 * an amount.
 */

export type CsvSection =
  "costs" | "competitors" | "production" | "models" | "comparison" | "add-ons" | "risks";
export const CSV_SECTIONS: readonly CsvSection[] = [
  "costs",
  "competitors",
  "production",
  "models",
  "comparison",
  "add-ons",
  "risks",
];

type Cell = string | number | boolean | null;

/**
 * The formula guard applies to text cells only: a number such as a negative profit (`-700`) is data a
 * spreadsheet must still read as a number, and a number cannot carry a formula.
 */
export function csvCell(value: Cell): string {
  if (value === null) return "";
  let text = String(value);
  const guarded = typeof value === "string" && /^[=+\-@]/.test(text);
  if (guarded) text = `'${text}`;
  return guarded || /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const minor = (m: Money | null): Cell => (m === null ? null : m.minor);
const currency = (m: Money | null): Cell => (m === null ? null : m.currency);

function costRows(items: readonly CostItem[]): Cell[][] {
  return items.map((i) => [
    i.id,
    i.name,
    i.provider,
    i.group,
    i.plan,
    i.costStatus,
    i.basis,
    i.amountCents,
    i.period,
    i.currency,
    i.limits?.sourceUrl ?? null,
    i.asOf,
  ]);
}

export function buildCsv(
  section: CsvSection,
  registries: Registries,
  analysis: PricingAnalysisV2,
  asOf: string,
): string {
  switch (section) {
    case "costs":
      return toCsv(
        [
          "id",
          "name",
          "provider",
          "group",
          "plan",
          "cost_status",
          "basis",
          "amount_minor",
          "period",
          "currency",
          "source_url",
          "as_of",
        ],
        costRows(registries.costItems),
      );
    case "competitors":
      return toCsv(
        [
          "competitor_id",
          "competitor",
          "segment",
          "research_status",
          "plan",
          "monthly_fee_minor",
          "monthly_fee_currency",
          "setup_fee_minor",
          "setup_fee_currency",
          "commission_bps",
          "card_fee_bps",
          "card_fee_fixed_minor",
          "card_fee_currency",
          "source_url",
          "retrieved_on",
        ],
        registries.competitors.flatMap((c) =>
          c.plans.length === 0
            ? [
                [
                  c.id,
                  c.name,
                  c.segment,
                  c.researchStatus,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  c.website,
                  c.researchedOn,
                ],
              ]
            : c.plans.map((p) => [
                c.id,
                c.name,
                c.segment,
                c.researchStatus,
                p.name,
                minor(p.monthlyFee),
                currency(p.monthlyFee),
                minor(p.setupFee),
                currency(p.setupFee),
                p.commissionBps,
                p.cardFee?.bps ?? null,
                minor(p.cardFee?.fixed ?? null),
                currency(p.cardFee?.fixed ?? null),
                p.sourceUrl,
                p.retrievedOn,
              ]),
        ),
      );
    case "production": {
      const seen = new Set<string>();
      const rows: Cell[][] = [];
      for (const row of analysis.grid) {
        const key = `${row.shops}-${row.ordersPerShop}-${row.basketPence}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cost = row.evaluation.cost;
        const nonPeople =
          cost.currentFixedPence === null || cost.driversPence === null
            ? null
            : cost.currentFixedPence + cost.driversPence + cost.connectPence;
        const orders = row.shops * row.ordersPerShop;
        rows.push([
          row.shops,
          row.ordersPerShop,
          row.basketPence,
          cost.currentFixedPence,
          cost.driversPence,
          cost.connectPence,
          cost.partnerTimePence,
          cost.totalPence,
          nonPeople === null || orders === 0 ? null : roundHalfUp(nonPeople / orders),
          "GBP",
          asOf,
        ]);
      }
      return toCsv(
        [
          "shops",
          "orders_per_shop",
          "basket_pence",
          "current_fixed_pence",
          "drivers_pence",
          "connect_pence",
          "partner_time_pence",
          "total_cost_pence",
          "cost_per_order_excl_partner_time_pence",
          "currency",
          "as_of",
        ],
        rows,
      );
    }
    case "models":
      return toCsv(
        [
          "model",
          "shops",
          "orders_per_shop",
          "basket_pence",
          "shop_pays_pence",
          "revenue_pence",
          "cost_pence",
          "partner_time_pence",
          "margin_pence",
          "currency",
          "as_of",
        ],
        analysis.grid.map((row) => [
          row.modelId,
          row.shops,
          row.ordersPerShop,
          row.basketPence,
          row.evaluation.shopPays.totalPence,
          row.evaluation.revenuePence,
          row.evaluation.cost.totalPence,
          row.evaluation.cost.partnerTimePence,
          row.evaluation.marginPence,
          "GBP",
          registries.recommendation.reviewedOn,
        ]),
      );
    case "comparison":
      return toCsv(
        [
          "comparator",
          "orders_per_shop",
          "basket_pence",
          "shop_pays_monthly_pence",
          "setup_pence",
          "currency",
          "as_of",
        ],
        analysis.comparisons.map((row) => [
          row.comparatorId,
          row.ordersPerShop,
          row.basketPence,
          row.monthlyPence,
          row.setupPence,
          "GBP",
          asOf,
        ]),
      );
    case "add-ons":
      return toCsv(
        [
          "id",
          "name",
          "price_pence",
          "billing",
          "run_cost_pence",
          "run_cost_basis",
          "margin_bps",
          "margin_class",
          "available",
          "currency",
          "as_of",
        ],
        registries.addOns.map((a) => [
          a.id,
          a.name,
          a.price.pence,
          a.price.billing,
          a.runCost.pence,
          a.runCost.basis,
          addOnMarginBps(a),
          a.marginClass,
          a.available,
          "GBP",
          registries.recommendation.reviewedOn,
        ]),
      );
    case "risks":
      return toCsv(
        [
          "id",
          "title",
          "who_bears",
          "cost_pence",
          "cost_period",
          "cost_basis",
          "currency",
          "source_url",
          "as_of",
        ],
        registries.risks.map((r) => [
          r.id,
          r.title,
          r.whoBears,
          r.cost?.pence ?? null,
          r.cost?.period ?? null,
          r.cost?.basis ?? null,
          r.cost ? "GBP" : null,
          r.sourceUrl,
          r.asOf,
        ]),
      );
  }
}

/** The refresh panel's download, built in the browser from an unsaved result. */
export function refreshCsv(sources: readonly SourceResult[], ranAt: string): string {
  const value = (v: Money | number | null): Cell =>
    v === null ? null : typeof v === "number" ? v : v.minor;
  const cur = (v: Money | number | null): Cell =>
    v !== null && typeof v !== "number" ? v.currency : null;
  return toCsv(
    [
      "source_url",
      "status",
      "target",
      "field",
      "committed",
      "committed_currency",
      "suggested",
      "suggested_currency",
      "change",
      "retrieved_on",
    ],
    sources.flatMap((s) =>
      s.rows.length === 0
        ? [[s.sourceUrl, s.status, null, null, null, null, null, null, null, ranAt]]
        : s.rows.map((r) => [
            s.sourceUrl,
            s.status,
            r.target.kind === "competitor-plan"
              ? `${r.target.competitorId}: ${r.target.planName}`
              : r.target.kind === "cost-item"
                ? `${r.target.itemId}: ${r.target.planName}`
                : `new: ${r.target.planName}`,
            r.field,
            value(r.committed),
            cur(r.committed),
            value(r.suggested),
            cur(r.suggested),
            r.change,
            ranAt,
          ]),
    ),
  );
}
