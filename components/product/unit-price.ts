import { formatPrice } from "./format-price";

/**
 * #398 (derivation half, P9.3) — the net-content unit of measure. Mirrors
 * `prisma/schema.prisma`'s `NetContentUnit` enum exactly (same members, same
 * casing); kept as a plain string-literal union here rather than imported from
 * `@prisma/client` so this file stays DB-free and importable from a unit test
 * with no WASM query engine involved (see the module doc below).
 */
export type NetContentUnit = "GRAM" | "KILOGRAM" | "MILLILITRE" | "LITRE" | "EACH";

export const NET_CONTENT_UNITS: readonly NetContentUnit[] = [
  "GRAM",
  "KILOGRAM",
  "MILLILITRE",
  "LITRE",
  "EACH",
];

/** Labels for `<select>` options in `components/staff/ProductForm.tsx`. */
export const NET_CONTENT_UNIT_LABELS: Record<NetContentUnit, string> = {
  GRAM: "Grams (g)",
  KILOGRAM: "Kilograms (kg)",
  MILLILITRE: "Millilitres (ml)",
  LITRE: "Litres (l)",
  EACH: "Each (count)",
};

export function isNetContentUnit(value: string): value is NetContentUnit {
  return (NET_CONTENT_UNITS as readonly string[]).includes(value);
}

export interface NetContent {
  /** A whole number in `unit`'s own unit — see the schema comment on `Product.netContentAmount`. */
  amount: number;
  unit: NetContentUnit;
}

interface ReferenceUnit {
  /** What the derived price is quoted PER, e.g. "£3.33 / kg". */
  label: string;
  /** Converts `amount` (in `unit`'s own unit) into a count of the reference unit. */
  toReferenceAmount: (amount: number) => number;
}

/**
 * What each `NetContentUnit` derives a price PER — mass converges on the kilogram, volume on the
 * litre, EACH is already its own reference unit. Grams/millilitres divide by 1000 to reach it;
 * kilograms/litres are already there.
 */
const REFERENCE_UNITS: Record<NetContentUnit, ReferenceUnit> = {
  GRAM: { label: "kg", toReferenceAmount: (amount) => amount / 1000 },
  KILOGRAM: { label: "kg", toReferenceAmount: (amount) => amount },
  MILLILITRE: { label: "litre", toReferenceAmount: (amount) => amount / 1000 },
  LITRE: { label: "litre", toReferenceAmount: (amount) => amount },
  EACH: { label: "each", toReferenceAmount: (amount) => amount },
};

/**
 * Pure, unit-tested, no DB import (R32) — the shared arithmetic behind both exports below.
 * EXACT pence per base unit, not rounded — rounding is each caller's own decision (the display
 * function below rounds only inside `formatPrice`'s `toFixed(2)`; the sort-key function rounds to
 * a whole pence for storage). Null for a non-positive net content, which can't price anything.
 */
function exactPencePerBaseUnit(basePricePence: number, netContent: NetContent): number | null {
  const referenceAmount = REFERENCE_UNITS[netContent.unit].toReferenceAmount(netContent.amount);
  if (!(referenceAmount > 0)) return null;
  return basePricePence / referenceAmount;
}

/**
 * The DISPLAYED unit price, e.g. "£3.33 / kg" — derived directly from `basePrice` and net content
 * every time it is called, NEVER from the stored `Product.unitPricePencePerBaseUnit` sort key
 * (R32). Composes with `formatPrice()` rather than reimplementing pence-to-pounds. Null when there
 * is no net content to derive from, so the caller falls back to `Product.unitLabel` (R34).
 */
export function deriveUnitPriceLabel(
  basePricePence: number,
  netContent: NetContent | null,
): string | null {
  if (netContent === null) return null;
  const perUnit = exactPencePerBaseUnit(basePricePence, netContent);
  if (perUnit === null) return null;
  return `${formatPrice(perUnit)} / ${REFERENCE_UNITS[netContent.unit].label}`;
}

/**
 * The STORED sort-key value (R30) — a whole-pence integer, written by
 * `lib/repositories/products.ts`'s create and update paths on every write (R31) and never read
 * back for display (R32). Null whenever there is no net content to derive from.
 */
export function deriveUnitPricePenceForSort(
  basePricePence: number,
  netContent: NetContent | null,
): number | null {
  if (netContent === null) return null;
  const perUnit = exactPencePerBaseUnit(basePricePence, netContent);
  if (perUnit === null) return null;
  return Math.round(perUnit);
}
