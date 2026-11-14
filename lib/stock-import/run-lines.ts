import { slugify } from "@/lib/catalogue-form";
import { formatPrice } from "@/components/product/format-price";
import type { CatalogueProduct } from "./match";
import type { NormalisedRow } from "./normalise";
import { categoryName, type Decision, type PlanLine, type PlanLookups } from "./plan";
import type { StockImportProfile } from "./profile";

/**
 * #1578 — the pieces of a stock import the staff screen and the CLI share that need no database:
 * brand and category lookups, a plan line as a `StockImportLine` row, and the grid ⇄ cell form.
 */

/** Profile brands first (aliases included), then every brand already in the store. */
export function buildLookups(
  profile: StockImportProfile,
  brands: readonly { id: string; name: string; slug: string }[],
  categories: readonly { id: string; slug: string; name: string }[],
): PlanLookups {
  const ids = new Map<string, string>();
  for (const b of brands) {
    ids.set(b.name.toLowerCase(), b.id);
    ids.set(b.slug, b.id);
  }
  for (const b of profile.brands) {
    const id = [b.name, ...b.aliases]
      .map((n) => ids.get(n.toLowerCase()) ?? ids.get(slugify(n)))
      .find(Boolean);
    if (id) ids.set(b.name.toLowerCase(), id);
  }
  return {
    brandIds: ids,
    categories: new Map(categories.map((c) => [c.slug, { id: c.id, name: c.name }])),
  };
}

export type LineDecision = Decision | "HOLD";

/** What a plan line stores (`StockImportLine` without run, vendor and reviewer columns). */
export interface PlannedLineData {
  key: string;
  position: number;
  rowNumber: number;
  sourceText: string;
  suggestion: Decision;
  confidence: "HIGH" | "MEDIUM" | "NONE";
  reason: string;
  cleanName: string;
  brandName: string | null;
  categoryName: string;
  sizeLabel: string | null;
  pricePence: number | null;
  targetProductId: string | null;
  runnerUpProductId: string | null;
  otherSizes: string;
  changeSummary: string;
  tillWords: string;
  issues: string;
}

const pounds = (p: number | null | undefined) => (p == null ? "" : formatPrice(p));

export function describeProduct(p: Pick<CatalogueProduct, "name" | "plu">): string {
  return `${p.name}${p.plu ? ` (${p.plu})` : ""}`;
}

export function plannedLineData(
  line: PlanLine,
  position: number,
  lookups: PlanLookups,
): PlannedLineData {
  const r = line.row;
  return {
    key: r.key,
    position,
    rowNumber: r.rowNumber,
    sourceText: r.sourceText,
    suggestion: line.decision,
    confidence: line.confidence,
    reason: line.reason,
    cleanName: r.displayName,
    brandName: r.brand,
    categoryName: categoryName(r, lookups),
    sizeLabel: r.sizeLabel,
    pricePence: r.pricePence,
    targetProductId: line.target?.id ?? null,
    runnerUpProductId: line.runnerUp?.id ?? null,
    otherSizes: line.otherSizes.map(describeProduct).join("; "),
    changeSummary: line.changes.map((c) => `${c.field}: ${c.from || "—"} → ${c.to}`).join("\n"),
    tillWords: line.tillWords.join(", "),
    issues: r.issues.map((i) => `${i.severity}: ${i.message}`).join("; "),
  };
}

/** A line the store has to look at before it can be applied. */
export function needsDecision(decision: LineDecision): boolean {
  return decision === "REVIEW" || decision === "HOLD";
}

/** Non-empty cells of a grid, 0-based. Trailing blanks are dropped; nothing else is changed. */
export function gridToCells(
  grid: readonly (readonly unknown[])[],
): { rowIndex: number; columnIndex: number; value: string }[] {
  const out: { rowIndex: number; columnIndex: number; value: string }[] = [];
  grid.forEach((row, rowIndex) =>
    row.forEach((cell, columnIndex) => {
      const value = cell === null || cell === undefined ? "" : String(cell);
      if (value !== "") out.push({ rowIndex, columnIndex, value });
    }),
  );
  return out;
}

/** The grid back from its cells; `rowCount` keeps trailing empty rows (row numbers stay right). */
export function cellsToGrid(
  cells: readonly { rowIndex: number; columnIndex: number; value: string }[],
  rowCount: number,
): string[][] {
  const width = cells.reduce((w, c) => Math.max(w, c.columnIndex + 1), 0);
  const grid = Array.from({ length: rowCount }, () => Array<string>(width).fill(""));
  for (const c of cells) {
    if (c.rowIndex < rowCount) grid[c.rowIndex][c.columnIndex] = c.value;
  }
  return grid;
}

/** The changed fields of an UPDATE, as the line's result text. */
export function rowSummary(row: NormalisedRow): string {
  return [row.displayName, pounds(row.pricePence)].filter(Boolean).join(", ");
}
