import { z } from "zod";
import type { CostItem } from "@/lib/running-costs";
import type { PricingAnalysis } from "@/lib/pricing/analysis";
import { analyse, COMMITTED, type Registries } from "@/lib/pricing/committed";
import type { Money } from "@/lib/pricing/money";

/**
 * #1309 - the pure half of "Refresh Costs" / "Refresh Recommendations": which pages may be fetched,
 * how a model reply is validated, how it is compared against the committed registries, and what the
 * analysis would look like if the suggestions were accepted. No network and no AI here; the service
 * (`lib/pricing-refresh-service.ts`) does the I/O and calls these.
 *
 * SAFETY. Sources are an allow-list taken from the committed registries, never from a request, so the
 * button cannot be turned into an open fetcher. A fetched page is untrusted input to the model, and
 * the model's reply is only ever a labelled, unsaved suggestion that a person reviews before any PR.
 */

export type RefreshScope = "costs" | "all";

/** Ceiling on pages fetched (and AI calls made) per press of a button. */
export const MAX_REFRESH_SOURCES = 25;

export function refreshSources(scope: RefreshScope, registries: Registries = COMMITTED): string[] {
  const urls: string[] = registries.costItems
    .filter((item) => item.basis !== "open-licence")
    .flatMap((item) => (item.limits ? [item.limits.sourceUrl] : []));
  if (scope === "all") {
    for (const competitor of registries.competitors) {
      for (const plan of competitor.plans) urls.push(plan.sourceUrl);
    }
  }
  return [...new Set(urls)].slice(0, MAX_REFRESH_SOURCES);
}

const extractionSchema = z.object({
  plans: z.array(
    z.object({
      name: z.string().min(1),
      monthlyFee: z
        .object({ amount: z.number().nonnegative(), currency: z.enum(["GBP", "USD"]) })
        .nullable(),
      commissionPercent: z.number().nonnegative().nullable(),
      cardFeePercent: z.number().nonnegative().nullable(),
      cardFeeFixed: z.number().nonnegative().nullable(),
    }),
  ),
});

export interface ExtractedPlan {
  name: string;
  monthlyFee: Money | null;
  commissionBps: number | null;
  cardFeeBps: number | null;
  /** Minor units, in the plan's fee currency (GBP when the plan has no fee). */
  cardFeeFixedMinor: number | null;
}

const toMinor = (x: number): number => Math.round(x * 100);

/** Validate a model reply (a JSON string or already-parsed value). `null` for anything invalid. */
export function parseExtraction(reply: unknown): ExtractedPlan[] | null {
  let value = reply;
  if (typeof reply === "string") {
    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      value = JSON.parse(reply.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const parsed = extractionSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.plans.map((plan) => ({
    name: plan.name,
    monthlyFee: plan.monthlyFee
      ? { minor: toMinor(plan.monthlyFee.amount), currency: plan.monthlyFee.currency }
      : null,
    commissionBps: plan.commissionPercent === null ? null : toMinor(plan.commissionPercent),
    cardFeeBps: plan.cardFeePercent === null ? null : toMinor(plan.cardFeePercent),
    cardFeeFixedMinor: plan.cardFeeFixed === null ? null : toMinor(plan.cardFeeFixed),
  }));
}

export type DiffTarget =
  | { kind: "competitor-plan"; competitorId: string; planName: string }
  | { kind: "cost-item"; itemId: string; planName: string }
  | { kind: "new"; planName: string };

export type DiffField = "monthlyFee" | "commissionBps" | "cardFee.bps" | "cardFee.fixed" | "plan";
export type DiffValue = Money | number | null;

export interface DiffRow {
  sourceUrl: string;
  target: DiffTarget;
  field: DiffField;
  committed: DiffValue;
  suggested: DiffValue;
  change: "same" | "changed" | "missing" | "new";
}

export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function equal(a: DiffValue, b: DiffValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof b === "number") return a === b;
  return a.minor === b.minor && a.currency === b.currency;
}

function costItemFee(item: CostItem): Money | null {
  return item.amountCents !== null && item.period === "month"
    ? { minor: item.amountCents, currency: item.currency }
    : null;
}

/**
 * Compare one source's extracted plans with every committed target that cites `sourceUrl`. One row
 * per compared field; `missing` when no extracted plan has the target's name; one `new` row per
 * extracted plan that matches no target.
 */
export function diffSource(
  sourceUrl: string,
  extracted: readonly ExtractedPlan[],
  registries: Registries = COMMITTED,
): DiffRow[] {
  const byName = new Map(extracted.map((plan) => [normaliseName(plan.name), plan]));
  const matched = new Set<string>();
  const rows: DiffRow[] = [];

  const compare = (
    target: DiffTarget,
    fields: [DiffField, DiffValue, (p: ExtractedPlan) => DiffValue][],
  ) => {
    const key = normaliseName(target.planName);
    const found = byName.get(key) ?? null;
    if (found) matched.add(key);
    for (const [field, committed, pick] of fields) {
      const suggested = found ? pick(found) : null;
      rows.push({
        sourceUrl,
        target,
        field,
        committed,
        suggested,
        change: !found ? "missing" : equal(committed, suggested) ? "same" : "changed",
      });
    }
  };

  for (const item of registries.costItems) {
    if (item.limits?.sourceUrl !== sourceUrl || item.basis === "open-licence") continue;
    compare({ kind: "cost-item", itemId: item.id, planName: item.plan }, [
      ["monthlyFee", costItemFee(item), (p) => p.monthlyFee],
    ]);
  }

  for (const competitor of registries.competitors) {
    for (const plan of competitor.plans) {
      if (plan.sourceUrl !== sourceUrl) continue;
      const currency = plan.cardFee?.fixed.currency ?? plan.monthlyFee?.currency ?? "GBP";
      compare({ kind: "competitor-plan", competitorId: competitor.id, planName: plan.name }, [
        ["monthlyFee", plan.monthlyFee, (p) => p.monthlyFee],
        ["commissionBps", plan.commissionBps, (p) => p.commissionBps],
        ["cardFee.bps", plan.cardFee?.bps ?? null, (p) => p.cardFeeBps],
        [
          "cardFee.fixed",
          plan.cardFee?.fixed ?? null,
          (p) => (p.cardFeeFixedMinor === null ? null : { minor: p.cardFeeFixedMinor, currency }),
        ],
      ]);
    }
  }

  for (const [key, plan] of byName) {
    if (matched.has(key)) continue;
    rows.push({
      sourceUrl,
      target: { kind: "new", planName: plan.name },
      field: "plan",
      committed: null,
      suggested: plan.monthlyFee,
      change: "new",
    });
  }
  return rows;
}

export type SourceStatus =
  "read" | "unreachable" | "unparseable" | "budget-refused" | "ai-unavailable";

export interface SourceResult {
  sourceUrl: string;
  status: SourceStatus;
  rows: DiffRow[];
}

export const STATUS_TEXT: Record<SourceStatus, string> = {
  read: "Read",
  unreachable: "Page could not be fetched",
  unparseable: "Could not read the figures",
  "budget-refused": "AI budget reached",
  "ai-unavailable": "AI unavailable",
};

/**
 * The registries with the suggestions the analysis actually reads substituted: a cost item's changed
 * monthly fee (USD, `period: "month"` items only), and the changed card fee of the competitor plan the
 * card-fee assumptions are `derivedFrom`. Other changed rows alter no figure the analysis reads.
 */
export function applySuggestions(
  rows: readonly DiffRow[],
  registries: Registries = COMMITTED,
): Registries {
  const changed = rows.filter((row) => row.change === "changed");

  const costItems = registries.costItems.map((item) => {
    const row = changed.find(
      (r) =>
        r.target.kind === "cost-item" && r.target.itemId === item.id && r.field === "monthlyFee",
    );
    const fee = row?.suggested;
    if (
      !fee ||
      typeof fee === "number" ||
      fee.currency !== item.currency ||
      item.period !== "month"
    ) {
      return item;
    }
    return { ...item, amountCents: fee.minor };
  });

  const assumptions = registries.assumptions.map((assumption) => {
    const from = assumption.derivedFrom;
    if (!from) return assumption;
    const field: DiffField | null =
      assumption.id === "card-fee-bps"
        ? "cardFee.bps"
        : assumption.id === "card-fee-fixed-pence"
          ? "cardFee.fixed"
          : null;
    const row = changed.find(
      (r) =>
        r.target.kind === "competitor-plan" &&
        r.target.competitorId === from.competitorId &&
        normaliseName(r.target.planName) === normaliseName(from.planName) &&
        r.field === field,
    );
    if (!row || row.suggested === null) return assumption;
    const value = typeof row.suggested === "number" ? row.suggested : row.suggested.minor;
    return { ...assumption, value };
  });

  return { ...registries, costItems, assumptions };
}

export interface PlanDelta {
  planId: string;
  committed: { breakEvenVendors: number | null; breakEvenGmvPence: number | null };
  ifAccepted: { breakEvenVendors: number | null; breakEvenGmvPence: number | null };
}

export interface AnalysisDeltas {
  plans: PlanDelta[];
  rankingChanged: boolean;
  recommendationDisagreesChanged: boolean;
}

export function compareAnalyses(committed: PricingAnalysis, next: PricingAnalysis): AnalysisDeltas {
  const plans: PlanDelta[] = [];
  for (const before of committed.plans) {
    const after = next.plans.find((p) => p.planId === before.planId);
    if (!after) continue;
    if (
      before.breakEvenVendors !== after.breakEvenVendors ||
      before.breakEvenGmvPence !== after.breakEvenGmvPence
    ) {
      plans.push({
        planId: before.planId,
        committed: {
          breakEvenVendors: before.breakEvenVendors,
          breakEvenGmvPence: before.breakEvenGmvPence,
        },
        ifAccepted: {
          breakEvenVendors: after.breakEvenVendors,
          breakEvenGmvPence: after.breakEvenGmvPence,
        },
      });
    }
  }
  return {
    plans,
    rankingChanged: JSON.stringify(committed.ranking) !== JSON.stringify(next.ranking),
    recommendationDisagreesChanged:
      committed.recommendationDisagrees !== next.recommendationDisagrees,
  };
}

function targetLabel(target: DiffTarget): string {
  switch (target.kind) {
    case "competitor-plan":
      return `${target.competitorId} ${target.planName}`;
    case "cost-item":
      return `${target.itemId} (${target.planName})`;
    case "new":
      return `new plan "${target.planName}"`;
  }
}

/** Fixed rules, in a fixed order. Never AI-written. */
export function recommendedActions(
  committed: PricingAnalysis,
  ifAccepted: PricingAnalysis,
  sources: readonly SourceResult[],
): string[] {
  const actions: string[] = [];
  for (const entry of committed.stale)
    actions.push(`Re-verify ${entry.registry} entry ${entry.id}`);
  for (const source of sources) {
    if (source.status !== "read") {
      actions.push(`Check ${source.sourceUrl} manually (${STATUS_TEXT[source.status]})`);
    }
  }
  for (const source of sources) {
    for (const row of source.rows) {
      if (row.change === "changed" || row.change === "new") {
        actions.push(
          `Review ${targetLabel(row.target)} ${row.field} and update the registry by PR`,
        );
      }
    }
  }
  if (ifAccepted.recommendationDisagrees || committed.recommendationOverdue) {
    actions.push("Revisit the business-model recommendation");
  }
  return actions.length === 0 ? ["No action needed"] : actions;
}

export interface RefreshResult {
  scope: RefreshScope;
  ranAt: string;
  sources: SourceResult[];
  /** Only for scope `all`. */
  recommendations: {
    ifAccepted: PricingAnalysis;
    deltas: AnalysisDeltas;
    actions: string[];
  } | null;
}

/** Assemble the result once every source has a status. */
export function summariseRefresh(
  scope: RefreshScope,
  sources: SourceResult[],
  now: Date,
  registries: Registries = COMMITTED,
): RefreshResult {
  if (scope === "costs") {
    return { scope, ranAt: now.toISOString(), sources, recommendations: null };
  }
  const committed = analyse(registries, now);
  const ifAccepted = analyse(
    applySuggestions(
      sources.flatMap((s) => s.rows),
      registries,
    ),
    now,
  );
  return {
    scope,
    ranAt: now.toISOString(),
    sources,
    recommendations: {
      ifAccepted,
      deltas: compareAnalyses(committed, ifAccepted),
      actions: recommendedActions(committed, ifAccepted, sources),
    },
  };
}
