import { computeChanges, type FieldChange, type KeptField, type MergeOptions } from "./merge";
import {
  buildIndex,
  matchRow,
  matchWords,
  toBaseAmount,
  wordContext,
  type CatalogueProduct,
  type Confidence,
} from "./match";
import type { NormalisedRow } from "./normalise";
import type { StockImportProfile } from "./profile";

/**
 * #1570 R5–R7 — every normalised row becomes one plan line with a suggested decision a person can
 * change on the review sheet. Pure: the script supplies the catalogue and the lookups.
 */

export type Decision = "UPDATE" | "CREATE" | "REVIEW" | "SKIP" | "DUPLICATE";

export const DECISIONS: readonly Decision[] = ["UPDATE", "CREATE", "REVIEW", "SKIP", "DUPLICATE"];

export interface PlanLine {
  row: NormalisedRow;
  decision: Decision;
  confidence: Confidence;
  reason: string;
  target: CatalogueProduct | null;
  runnerUp: CatalogueProduct | null;
  otherSizes: CatalogueProduct[];
  changes: FieldChange[];
  kept: KeptField[];
}

export interface PlanLookups {
  /** Canonical brand name, lower case → id. */
  brandIds: Map<string, string>;
  /** Category slug → id and name. */
  categories: Map<string, { id: string; name: string }>;
}

export function categoryName(row: NormalisedRow, lookups: PlanLookups): string {
  const known = lookups.categories.get(row.category.slug);
  if (known) return known.name;
  return "newName" in row.category ? row.category.newName : row.category.slug;
}

export function targetsFor(row: NormalisedRow, lookups: PlanLookups) {
  return {
    brandId: row.brand ? (lookups.brandIds.get(row.brand.toLowerCase()) ?? null) : null,
    categoryId: lookups.categories.get(row.category.slug)?.id ?? null,
    categoryName: categoryName(row, lookups),
  };
}

function duplicateKey(row: NormalisedRow, profile: StockImportProfile): string {
  const words = matchWords(row.coreName, wordContext(profile)).sort().join(" ");
  const size = row.netContent ? JSON.stringify(toBaseAmount(row.netContent)) : "?";
  return `${(row.brand ?? "").toLowerCase()}|${words}|${size}`;
}

export function buildPlan(
  rows: NormalisedRow[],
  catalogue: CatalogueProduct[],
  profile: StockImportProfile,
  knownBrands: readonly string[],
  lookups: PlanLookups,
  options: MergeOptions,
): PlanLine[] {
  const ctx = wordContext(profile);
  const index = buildIndex(catalogue, profile, knownBrands, ctx);
  const seen = new Map<string, NormalisedRow>();
  const lines: PlanLine[] = rows.map((row) => {
    const base: PlanLine = {
      row,
      decision: "CREATE",
      confidence: "NONE",
      reason: "",
      target: null,
      runnerUp: null,
      otherSizes: [],
      changes: [],
      kept: [],
    };
    const dupKey = duplicateKey(row, profile);
    const first = seen.get(dupKey);
    if (first) {
      const conflict = first.pricePence !== row.pricePence;
      return {
        ...base,
        decision: "DUPLICATE",
        reason: `same product as ${first.key}${conflict ? " with a DIFFERENT price — check which is right" : ""}`,
      };
    }
    seen.set(dupKey, row);
    const errors = row.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      return { ...base, decision: "SKIP", reason: errors.map((e) => e.message).join("; ") };
    }
    const match = matchRow(row, index, profile, ctx);
    const line: PlanLine = {
      ...base,
      confidence: match.confidence,
      reason: match.reason,
      target: match.best?.product ?? null,
      runnerUp: match.runnerUp?.product ?? null,
      otherSizes: match.otherSizes,
      decision:
        match.confidence === "HIGH"
          ? "UPDATE"
          : match.confidence === "MEDIUM"
            ? "REVIEW"
            : "CREATE",
    };
    return line;
  });

  // One product, one row: a second claim on the same product needs a person.
  const claimed = new Map<string, PlanLine>();
  for (const line of lines) {
    if (line.decision !== "UPDATE" || !line.target) continue;
    const other = claimed.get(line.target.id);
    if (!other) {
      claimed.set(line.target.id, line);
      continue;
    }
    line.decision = "REVIEW";
    line.reason = `same product as ${other.row.key} — ${line.reason}`;
  }

  for (const line of lines) {
    if (line.target && (line.decision === "UPDATE" || line.decision === "REVIEW")) {
      const { changes, kept } = computeChanges(
        line.row,
        line.target,
        targetsFor(line.row, lookups),
        profile,
        options,
      );
      line.changes = changes;
      line.kept = kept;
    }
  }
  return lines;
}

export interface PlanCounts {
  rows: number;
  update: number;
  unchanged: number;
  create: number;
  review: number;
  skip: number;
  duplicate: number;
  warnings: number;
}

export function countPlan(lines: readonly PlanLine[]): PlanCounts {
  const c: PlanCounts = {
    rows: lines.length,
    update: 0,
    unchanged: 0,
    create: 0,
    review: 0,
    skip: 0,
    duplicate: 0,
    warnings: 0,
  };
  for (const line of lines) {
    if (line.decision === "UPDATE") {
      if (line.changes.length > 0) c.update++;
      else c.unchanged++;
    } else c[line.decision.toLowerCase() as "create" | "review" | "skip" | "duplicate"]++;
    c.warnings += line.row.issues.filter((i) => i.severity === "warning").length;
  }
  return c;
}
