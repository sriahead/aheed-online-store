import type { NetContent } from "@/components/product/unit-price";

/**
 * #900 (R12) — a free, deterministic cross-check of a net-content suggestion against the
 * product's own free-text unit label. Pure: no DB, no network.
 *
 * Many real labels already state either a price per reference unit (`£6.98 / kg`) or a pack
 * price for a stated size (`£4.49 / 500g`). Either one lets `basePrice` and the suggestion be
 * checked against each other, so a staff reviewer sees at a glance whether the suggestion is
 * consistent with what the shop already wrote. It never decides anything: it is shown, and
 * counted in the pilot summary.
 */

export type UnitLabelCheck = "AGREES" | "DISAGREES" | "NOT_CHECKABLE";

type Dimension = "MASS" | "VOLUME";

/** Tolerance on a per-reference price, in exact pence (R12): rounding in a hand-typed label. */
const TOLERANCE_PENCE = 1;

const PRICE = String.raw`£\s*(\d+(?:\.\d{1,2})?)`;
const PER_REFERENCE = new RegExp(String.raw`^\s*${PRICE}\s*\/\s*(kg|l|litre|100g|100ml)\s*$`, "i");
const PACK = new RegExp(String.raw`^\s*${PRICE}\s*\/\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\s*$`, "i");

/** `"6.98"` -> 698, in integer pence, with no float arithmetic on the money itself. */
function toPence(value: string): number {
  const [pounds, pence = ""] = value.split(".");
  return Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
}

function dimensionOf(unit: NetContent["unit"]): Dimension | null {
  if (unit === "GRAM" || unit === "KILOGRAM") return "MASS";
  if (unit === "MILLILITRE" || unit === "LITRE") return "VOLUME";
  return null; // EACH
}

/** Grams or millilitres. */
function toBaseAmount(netContent: NetContent): number {
  return netContent.unit === "KILOGRAM" || netContent.unit === "LITRE"
    ? netContent.amount * 1000
    : netContent.amount;
}

interface Reference {
  dimension: Dimension;
  /** How many grams/millilitres the stated price is quoted per. */
  perBaseAmount: number;
}

const REFERENCES: Record<string, Reference> = {
  kg: { dimension: "MASS", perBaseAmount: 1000 },
  l: { dimension: "VOLUME", perBaseAmount: 1000 },
  litre: { dimension: "VOLUME", perBaseAmount: 1000 },
  "100g": { dimension: "MASS", perBaseAmount: 100 },
  "100ml": { dimension: "VOLUME", perBaseAmount: 100 },
};

const PACK_UNITS: Record<string, { dimension: Dimension; multiplier: number }> = {
  g: { dimension: "MASS", multiplier: 1 },
  kg: { dimension: "MASS", multiplier: 1000 },
  ml: { dimension: "VOLUME", multiplier: 1 },
  l: { dimension: "VOLUME", multiplier: 1000 },
};

export function checkSuggestionAgainstUnitLabel(
  basePricePence: number,
  unitLabel: string,
  suggestion: NetContent,
): UnitLabelCheck {
  const suggestedDimension = dimensionOf(suggestion.unit);

  const perReference = PER_REFERENCE.exec(unitLabel);
  if (perReference) {
    const reference = REFERENCES[perReference[2].toLowerCase()];
    if (suggestedDimension !== reference.dimension) return "DISAGREES";
    const baseAmount = toBaseAmount(suggestion);
    if (!(baseAmount > 0)) return "DISAGREES";
    // Exact, unrounded derived price per reference unit, compared in pence.
    const derived = (basePricePence * reference.perBaseAmount) / baseAmount;
    const stated = toPence(perReference[1]);
    return Math.abs(derived - stated) <= TOLERANCE_PENCE ? "AGREES" : "DISAGREES";
  }

  const pack = PACK.exec(unitLabel);
  if (pack) {
    // A pack-form label only describes THIS product when its price is this product's price;
    // otherwise it may be stale, so it says nothing either way.
    if (toPence(pack[1]) !== basePricePence) return "NOT_CHECKABLE";
    const packUnit = PACK_UNITS[pack[3].toLowerCase()];
    if (suggestedDimension !== packUnit.dimension) return "DISAGREES";
    const statedBase = Math.round(Number(pack[2]) * packUnit.multiplier);
    return statedBase === toBaseAmount(suggestion) ? "AGREES" : "DISAGREES";
  }

  return "NOT_CHECKABLE";
}
