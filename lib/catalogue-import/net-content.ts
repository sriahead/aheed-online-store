import type { NetContentUnit } from "@/components/product/unit-price";

export interface ExtractedNetContent {
  amount: number;
  unit: NetContentUnit;
  confidence: "HIGH" | "LOW";
  rawMatch: string;
  formattedLabel: string;
  packCount?: number;
  itemAmount?: number;
  itemUnit?: NetContentUnit;
}

/**
 * Extracts detailed net content (amount, unit, pack details, confidence) from text.
 * Strictly adheres to high-confidence heuristics — never guesses or invents details.
 *
 * Honors UK Price Marking Order & Prisma integer constraint:
 * fractional values in coarser units (e.g. 1.5kg) convert to integer in finer units (1500g).
 */
export function extractDetailedNetContent(text: string): ExtractedNetContent | null {
  const found = extractNetContentCandidate(text);
  if (!found || found.confidence !== "HIGH") return found;
  // #697 — text that names a weight without fixing it is never HIGH: a wrong pack size shows a wrong
  // price per kg, which is a Price Marking Order exposure. Seen on real lines: "Tilapia 500–800g"
  // read as 800g, "Tilapia 800g+" as 800g, and "Prawns – 400g (Pack of 2)" as 400g.
  return isAmbiguousNetContentText(text, found) ? { ...found, confidence: "LOW" } : found;
}

// The lower bound may not follow a digit, "/" or ".": "31/40 – 400g" is a size grade, not 40–400g.
const AMOUNT_UNIT = String.raw`(?<![\d/.])(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ltr)?`;
/** "500–800g", "1.1-1.2kg", "1100 – 1200g": a lower and an upper bound, the lower smaller. */
const RANGE = new RegExp(
  String.raw`${AMOUNT_UNIT}\s*[–—-]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ltr)(?!\p{L})`,
  "iu",
);
/** "800g+" (a minimum) or "200G+50%" (a bonus fill). */
const PLUS = /\d(?:\.\d+)?\s*(?:kg|g|ml|l|ltr)\s*\+/i;
/** "(Pack of 2)", "pack of 3": a count beside a single weight leaves the total unclear. */
const PACK_OF = /\bpack\s+of\s+\d+/i;

const TO_BASE: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, ltr: 1000 };

function isAmbiguousNetContentText(text: string, found: ExtractedNetContent): boolean {
  if (PLUS.test(text)) return true;
  const range = RANGE.exec(text);
  if (range) {
    const upperUnit = range[4].toLowerCase();
    const lowerUnit = (range[2] ?? upperUnit).toLowerCase();
    // "Prawns 13/15 – 1kg" is a size grade then a weight, not a range: 15 is not below 1kg.
    if (Number(range[1]) * TO_BASE[lowerUnit] < Number(range[3]) * TO_BASE[upperUnit]) return true;
  }
  // A real multipack ("4 x 400g") already multiplied; "400g (Pack of 2)" did not.
  return PACK_OF.test(text) && found.packCount === undefined && found.unit !== "EACH";
}

function extractNetContentCandidate(text: string): ExtractedNetContent | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;

  // 1. Multipack with unit: e.g. "6 x 330ml", "4 x 400g", "2 x 1.5L", "12x500ml", "3 x 1kg", "2 x 1.5 litre"
  const multiPackMatch =
    /(?:^|\b|\s)(\d+)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)\s*(kg|kilo|kilograms?|g|gm|gms|grams?|l|ltr|litres?|ml|millilitres?|cl)(?!\p{L})/iu.exec(
      trimmed,
    );
  if (multiPackMatch) {
    const packCount = parseInt(multiPackMatch[1], 10);
    const itemVal = parseFloat(multiPackMatch[2]);
    const unitStr = multiPackMatch[3].toLowerCase();

    if (packCount > 0 && packCount <= 1000 && itemVal > 0) {
      if (unitStr.startsWith("k")) {
        // kg
        const totalKg = packCount * itemVal;
        if (Number.isInteger(totalKg) && totalKg <= 50) {
          return {
            amount: totalKg,
            unit: "KILOGRAM",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${itemVal}kg (${totalKg}kg)`,
            packCount,
            itemAmount: itemVal,
            itemUnit: "KILOGRAM",
          };
        }
        const totalGrams = Math.round(totalKg * 1000);
        if (totalGrams <= 50000) {
          return {
            amount: totalGrams,
            unit: "GRAM",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${itemVal}kg (${totalGrams}g)`,
            packCount,
            itemAmount: Math.round(itemVal * 1000),
            itemUnit: "GRAM",
          };
        }
      } else if (unitStr.startsWith("g")) {
        // grams
        const totalGrams = Math.round(packCount * itemVal);
        if (totalGrams <= 50000) {
          return {
            amount: totalGrams,
            unit: "GRAM",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${Math.round(itemVal)}g (${totalGrams}g)`,
            packCount,
            itemAmount: Math.round(itemVal),
            itemUnit: "GRAM",
          };
        }
      } else if (unitStr.startsWith("l")) {
        // litres
        const totalLitres = packCount * itemVal;
        if (Number.isInteger(totalLitres) && totalLitres <= 50) {
          return {
            amount: totalLitres,
            unit: "LITRE",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${itemVal}L (${totalLitres}L)`,
            packCount,
            itemAmount: itemVal,
            itemUnit: "LITRE",
          };
        }
        const totalMl = Math.round(totalLitres * 1000);
        if (totalMl <= 50000) {
          return {
            amount: totalMl,
            unit: "MILLILITRE",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${itemVal}L (${totalMl}ml)`,
            packCount,
            itemAmount: Math.round(itemVal * 1000),
            itemUnit: "MILLILITRE",
          };
        }
      } else if (unitStr.startsWith("ml")) {
        // ml
        const totalMl = Math.round(packCount * itemVal);
        if (totalMl <= 50000) {
          return {
            amount: totalMl,
            unit: "MILLILITRE",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${Math.round(itemVal)}ml (${totalMl}ml)`,
            packCount,
            itemAmount: Math.round(itemVal),
            itemUnit: "MILLILITRE",
          };
        }
      } else if (unitStr === "cl") {
        // cl
        const totalMl = Math.round(packCount * itemVal * 10);
        if (totalMl <= 50000) {
          return {
            amount: totalMl,
            unit: "MILLILITRE",
            confidence: "HIGH",
            rawMatch: multiPackMatch[0].trim(),
            formattedLabel: `${packCount} x ${Math.round(itemVal)}cl (${totalMl}ml)`,
            packCount,
            itemAmount: Math.round(itemVal * 10),
            itemUnit: "MILLILITRE",
          };
        }
      }
    }
  }

  // 2. Grams: e.g. "500g", "250 g", "500grams", "500 gm", "500 gms"
  const gramMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:g|gram|grams|gm|gms)(?!\p{L})/iu.exec(trimmed);
  if (gramMatch) {
    const val = parseFloat(gramMatch[1]);
    if (val > 0 && val <= 50000) {
      const amount = Math.round(val);
      return {
        amount,
        unit: "GRAM",
        confidence: "HIGH",
        rawMatch: gramMatch[0].trim(),
        formattedLabel: `${amount}g`,
      };
    }
  }

  // 3. Kilograms: e.g. "1kg", "2.5 kg", "1 kilo", "1.5 kilograms"
  const kgMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilogram|kilograms)(?!\p{L})/iu.exec(
    trimmed,
  );
  if (kgMatch) {
    const val = parseFloat(kgMatch[1]);
    if (val > 0 && val <= 50) {
      if (Number.isInteger(val)) {
        return {
          amount: val,
          unit: "KILOGRAM",
          confidence: "HIGH",
          rawMatch: kgMatch[0].trim(),
          formattedLabel: `${val}kg`,
        };
      }
      const amount = Math.round(val * 1000);
      return {
        amount,
        unit: "GRAM",
        confidence: "HIGH",
        rawMatch: kgMatch[0].trim(),
        formattedLabel: `${val}kg (${amount}g)`,
      };
    }
  }

  // 4. Millilitres: e.g. "250ml", "330 ml", "500 millilitres"
  const mlMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:ml|millilitre|millilitres)(?!\p{L})/iu.exec(
    trimmed,
  );
  if (mlMatch) {
    const val = parseFloat(mlMatch[1]);
    if (val > 0 && val <= 50000) {
      const amount = Math.round(val);
      return {
        amount,
        unit: "MILLILITRE",
        confidence: "HIGH",
        rawMatch: mlMatch[0].trim(),
        formattedLabel: `${amount}ml`,
      };
    }
  }

  // 5. Litres: e.g. "1L", "1.5l", "2 litre", "2 litres", "2ltr"
  const litreMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:l|ltr|litre|litres)(?!\p{L})/iu.exec(trimmed);
  if (litreMatch) {
    const val = parseFloat(litreMatch[1]);
    if (val > 0 && val <= 50) {
      if (Number.isInteger(val)) {
        return {
          amount: val,
          unit: "LITRE",
          confidence: "HIGH",
          rawMatch: litreMatch[0].trim(),
          formattedLabel: `${val}L`,
        };
      }
      const amount = Math.round(val * 1000);
      return {
        amount,
        unit: "MILLILITRE",
        confidence: "HIGH",
        rawMatch: litreMatch[0].trim(),
        formattedLabel: `${val}L (${amount}ml)`,
      };
    }
  }

  // 6. Centilitres: e.g. "70cl", "75 cl" -> convert to ml
  const clMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:cl)(?!\p{L})/iu.exec(trimmed);
  if (clMatch) {
    const val = parseFloat(clMatch[1]);
    if (val > 0 && val <= 5000) {
      const amount = Math.round(val * 10);
      return {
        amount,
        unit: "MILLILITRE",
        confidence: "HIGH",
        rawMatch: clMatch[0].trim(),
        formattedLabel: `${Math.round(val)}cl (${amount}ml)`,
      };
    }
  }

  // 7. Pints: e.g. "1 pint", "2 pints", "4pt" (UK grocery milk/cider standard: 1 pint = 568ml)
  const pintMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:pints?|pt)(?!\p{L})/iu.exec(trimmed);
  if (pintMatch) {
    const val = parseFloat(pintMatch[1]);
    if (val > 0 && val <= 20) {
      const amount = Math.round(val * 568);
      return {
        amount,
        unit: "MILLILITRE",
        confidence: "HIGH",
        rawMatch: pintMatch[0].trim(),
        formattedLabel: `${val} pint (${amount}ml)`,
      };
    }
  }

  // 8. Each / Pack count: e.g. "6 pack", "10pk", "pack of 4", "12 pcs", "80 tea bags", "12 rolls"
  const packMatch =
    /(?:^|\b|\s)(?:pack of\s*(\d+)|(\d+)\s*(?:pk|pack|pcs|count|pieces|bags|tea\s*bags|rolls|slices|tablets|capsules))(?!\p{L})/iu.exec(
      trimmed,
    );
  if (packMatch) {
    const rawVal = packMatch[1] || packMatch[2];
    const val = parseInt(rawVal, 10);
    if (val > 0 && val <= 1000) {
      return {
        amount: val,
        unit: "EACH",
        confidence: "HIGH",
        rawMatch: packMatch[0].trim(),
        formattedLabel: `${val} pack`,
        packCount: val,
      };
    }
  }

  return null;
}

/**
 * Automatically extracts obvious net content (amount and unit) from text
 * when confidence is high.
 */
export function extractObviousNetContent(
  text: string,
): { amount: number; unit: NetContentUnit } | null {
  const detailed = extractDetailedNetContent(text);
  if (!detailed || detailed.confidence !== "HIGH") return null;
  return { amount: detailed.amount, unit: detailed.unit };
}

/**
 * Formats a net content record for user display (e.g. "500g", "1kg", "250ml", "6 pack").
 */
export function formatNetContentDisplay(net: {
  amount: number;
  unit: NetContentUnit;
  packCount?: number;
}): string {
  switch (net.unit) {
    case "GRAM":
      return `${net.amount}g`;
    case "KILOGRAM":
      return `${net.amount}kg`;
    case "MILLILITRE":
      return `${net.amount}ml`;
    case "LITRE":
      return `${net.amount}L`;
    case "EACH":
      return net.packCount ? `${net.packCount} pack` : `${net.amount} each`;
  }
}

/**
 * Normalizes net content to a standard comparable base unit:
 * - Weight -> grams
 * - Volume -> millilitres
 * - Count -> each
 */
function toBaseMeasurement(net: { amount: number; unit: NetContentUnit }): {
  type: "WEIGHT" | "VOLUME" | "COUNT";
  baseAmount: number;
} {
  switch (net.unit) {
    case "GRAM":
      return { type: "WEIGHT", baseAmount: net.amount };
    case "KILOGRAM":
      return { type: "WEIGHT", baseAmount: net.amount * 1000 };
    case "MILLILITRE":
      return { type: "VOLUME", baseAmount: net.amount };
    case "LITRE":
      return { type: "VOLUME", baseAmount: net.amount * 1000 };
    case "EACH":
      return { type: "COUNT", baseAmount: net.amount };
  }
}

/**
 * Compares two extracted net contents to determine if they match or conflict.
 * Returns true if both represent the same physical measurement (e.g. 1kg == 1000g),
 * false if they are inconsistent.
 */
export function compareNetContents(
  a: { amount: number; unit: NetContentUnit },
  b: { amount: number; unit: NetContentUnit },
): boolean {
  const baseA = toBaseMeasurement(a);
  const baseB = toBaseMeasurement(b);

  if (baseA.type !== baseB.type) return false;
  // Allow tiny rounding tolerance (within 1%)
  const diff = Math.abs(baseA.baseAmount - baseB.baseAmount);
  return diff <= Math.max(1, baseA.baseAmount * 0.01);
}
