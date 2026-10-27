import type { CostItem } from "@/lib/running-costs";
import type { PricingAnalysis } from "@/lib/pricing/analysis";
import { BUSINESS_MODELS, RECOMMENDATION } from "@/lib/pricing/business-models";
import type { Registries } from "@/lib/pricing/committed";
import type { Money } from "@/lib/pricing/money";
import { PROPOSED_PLANS } from "@/lib/pricing/proposed-plans";
import type { SourceResult } from "@/lib/pricing/refresh";

/**
 * #1309 - CSV for the costs dashboard. Pure. RFC 4180 quoting, and any cell starting with `=`, `+`,
 * `-` or `@` gets a leading `'` so a spreadsheet does not run it as a formula. Money columns are minor
 * units plus a currency column, never a formatted string, so a spreadsheet never re-parses an amount.
 */

export type CsvSection = "costs" | "competitors" | "plans" | "scenarios" | "models";
export const CSV_SECTIONS: readonly CsvSection[] = [
  "costs",
  "competitors",
  "plans",
  "scenarios",
  "models",
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
  analysis: PricingAnalysis,
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
    case "plans":
      return toCsv(
        [
          "plan_id",
          "name",
          "model",
          "status",
          "monthly_fee_minor",
          "currency",
          "commission_bps",
          "as_of",
        ],
        PROPOSED_PLANS.map((p) => [
          p.id,
          p.name,
          p.model,
          p.status,
          p.monthlyFeePence,
          "GBP",
          p.commissionBps,
          RECOMMENDATION.reviewedOn,
        ]),
      );
    case "scenarios":
      return toCsv(
        [
          "plan_id",
          "vendors",
          "revenue_minor",
          "cost_minor",
          "profit_minor",
          "margin_bps",
          "currency",
          "at_zero_gmv",
          "as_of",
        ],
        analysis.scenarios.map((s) => [
          s.planId,
          s.vendors,
          s.revenuePence,
          s.costPence,
          s.profitPence,
          s.marginBps,
          "GBP",
          s.atZeroGmv,
          asOf,
        ]),
      );
    case "models":
      return toCsv(
        [
          "model_id",
          "name",
          "recommended",
          "representative_plan_id",
          "break_even_vendors",
          "break_even_gmv_minor",
          "currency",
          "as_of",
        ],
        BUSINESS_MODELS.map((m) => {
          const plan = analysis.plans.find((p) => p.planId === m.representativePlanId) ?? null;
          return [
            m.id,
            m.name,
            m.id === RECOMMENDATION.modelId,
            m.representativePlanId,
            plan?.breakEvenVendors ?? null,
            plan?.breakEvenGmvPence ?? null,
            "GBP",
            RECOMMENDATION.reviewedOn,
          ];
        }),
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
