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

/* -------------------------------------------------------------------------- */
/* Pack size as a FACET (#397's remainder)                                     */
/* -------------------------------------------------------------------------- */

/** How a pack size is written for a shopper: the amount, then a unit suffix. */
const PACK_SIZE_SUFFIXES: Record<NetContentUnit, string> = {
  GRAM: "g",
  KILOGRAM: "kg",
  MILLILITRE: "ml",
  LITRE: "L",
  EACH: " each",
};

/**
 * `500` + `GRAM` -> `"500g"`. The shopper-facing label for a pack size, used by the filter
 * control's options and by the removable filter chip so both read identically.
 *
 * Deliberately NOT `deriveUnitPriceLabel`'s job: that one answers "what does this cost per kg",
 * which is a price. This one answers "how big is the pack", which is the facet being filtered on.
 */
export function formatPackSize(netContent: NetContent): string {
  return `${netContent.amount}${PACK_SIZE_SUFFIXES[netContent.unit]}`;
}

/** The wire form of a pack size in a query string: `500-GRAM`. */
export function packSizeParamValue(netContent: NetContent): string {
  return `${netContent.amount}-${netContent.unit}`;
}

const PACK_SIZE_PARAM = /^([0-9]{1,6})-(GRAM|KILOGRAM|MILLILITRE|LITRE|EACH)$/;

/**
 * Parses `packSize=500-GRAM` back into a `NetContent`, or `undefined` for anything else.
 *
 * ACCEPTS `string[]`, AND THAT IS THE POINT. A repeated query parameter (`?packSize=a&packSize=b`)
 * arrives as an array at runtime whatever the page's `searchParams` type annotation declares —
 * `#689` records five existing keys that throw a real HTTP 500 on exactly that, because each
 * calls a string method on the array. A brand-new key is not going to become the sixth: an array
 * yields no filter here, the same "unrecognised value applies no predicate" rule `origin` and
 * `brand` already follow.
 *
 * A zero amount is rejected too — it cannot describe a pack, and it is the one numeric value that
 * would pass a naive digit check while matching nothing.
 */
export function parsePackSizeParam(value: string | string[] | undefined): NetContent | undefined {
  if (typeof value !== "string") return undefined;
  const match = PACK_SIZE_PARAM.exec(value);
  if (match === null) return undefined;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return undefined;
  return { amount, unit: match[2] as NetContentUnit };
}

/**
 * Orders pack sizes the way a shopper reads them: grouped by reference unit (each / kg / litre),
 * then smallest first WITHIN that group.
 *
 * The grouping is what makes this non-trivial. Sorting on the raw amount would put `1kg` before
 * `500g` — one is a smaller number and a larger pack. Reusing `REFERENCE_UNITS`, the same table
 * `deriveUnitPriceLabel` converts through, is what lets `500g` and `1kg` be compared at all, and
 * means a future unit added to the enum is ordered correctly here for free rather than silently
 * landing at the end.
 */
export function comparePackSizes(a: NetContent, b: NetContent): number {
  const aRef = REFERENCE_UNITS[a.unit];
  const bRef = REFERENCE_UNITS[b.unit];
  if (aRef.label !== bRef.label) return aRef.label.localeCompare(bRef.label);
  return aRef.toReferenceAmount(a.amount) - bRef.toReferenceAmount(b.amount);
}
