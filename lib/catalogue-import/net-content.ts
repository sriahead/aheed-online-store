import type { NetContentUnit } from "@/components/product/unit-price";

/**
 * Automatically extracts obvious net content (amount and unit) from text
 * (such as "500g", "1kg", "1.5 kg", "250ml", "2 Litres", "Pack of 6", etc.).
 *
 * Honors UK Price Marking Order & Prisma integer constraint:
 * fractional values in coarser units (e.g. 1.5kg) convert to integer in finer units (1500g).
 */
export function extractObviousNetContent(
  text: string,
): { amount: number; unit: NetContentUnit } | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;

  // 1. Grams: e.g. "500g", "250 g", "500grams", "500 gm", "500 gms"
  const gramMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:g|gram|grams|gm|gms)(?!\p{L})/iu.exec(trimmed);
  if (gramMatch) {
    const val = parseFloat(gramMatch[1]);
    if (val > 0) return { amount: Math.round(val), unit: "GRAM" };
  }

  // 2. Kilograms: e.g. "1kg", "2.5 kg", "1 kilo", "1.5 kilograms"
  const kgMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilogram|kilograms)(?!\p{L})/iu.exec(trimmed);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1]);
    if (val > 0) {
      if (Number.isInteger(val)) {
        return { amount: val, unit: "KILOGRAM" };
      }
      return { amount: Math.round(val * 1000), unit: "GRAM" };
    }
  }

  // 3. Millilitres: e.g. "250ml", "330 ml", "500 millilitres"
  const mlMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:ml|millilitre|millilitres)(?!\p{L})/iu.exec(trimmed);
  if (mlMatch) {
    const val = parseFloat(mlMatch[1]);
    if (val > 0) return { amount: Math.round(val), unit: "MILLILITRE" };
  }

  // 4. Litres: e.g. "1L", "1.5l", "2 litre", "2 litres", "2ltr"
  const litreMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:l|ltr|litre|litres)(?!\p{L})/iu.exec(trimmed);
  if (litreMatch) {
    const val = parseFloat(litreMatch[1]);
    if (val > 0) {
      if (Number.isInteger(val)) {
        return { amount: val, unit: "LITRE" };
      }
      return { amount: Math.round(val * 1000), unit: "MILLILITRE" };
    }
  }

  // 5. Centilitres: e.g. "70cl", "75 cl" -> convert to ml
  const clMatch = /(?:^|\b|\s)(\d+(?:\.\d+)?)\s*(?:cl)(?!\p{L})/iu.exec(trimmed);
  if (clMatch) {
    const val = parseFloat(clMatch[1]);
    if (val > 0) return { amount: Math.round(val * 10), unit: "MILLILITRE" };
  }

  // 6. Each / Pack count: e.g. "6 pack", "10pk", "pack of 4", "12 pcs"
  const packMatch = /(?:^|\b|\s)(?:pack of\s*(\d+)|(\d+)\s*(?:pk|pack|pcs|count|pieces))(?!\p{L})/iu.exec(trimmed);
  if (packMatch) {
    const rawVal = packMatch[1] || packMatch[2];
    const val = parseInt(rawVal, 10);
    if (val > 0) return { amount: val, unit: "EACH" };
  }

  return null;
}
