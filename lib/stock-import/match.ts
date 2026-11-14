import type { NetContentUnit } from "@/components/product/unit-price";
import { extractDetailedNetContent } from "@/lib/catalogue-import/net-content";
import {
  applySpelling,
  leadingBrand,
  normaliseSizeText,
  type NetContent,
  type NormalisedRow,
} from "./normalise";
import type { StockImportProfile } from "./profile";

/**
 * #1570 R6 — find the existing product a spreadsheet row means, or say it has none. Never merges on
 * a guess: only a unique, same-size, same-brand, strong match is HIGH; anything weaker is REVIEW for
 * a person, and a product of a conflicting form (seeds vs leaves) or another size is never a match.
 */

export interface CatalogueProduct {
  id: string;
  slug: string;
  name: string;
  plu: string | null;
  barcode: string | null;
  brandId: string | null;
  brandName: string | null;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
  netContentAmount: number | null;
  netContentUnit: NetContentUnit | null;
  description: string;
  isActive: boolean;
  vatRate: number;
  origin: string | null;
  isHalal: boolean;
  isVegetarian: boolean;
  isOrganic: boolean;
  isGlutenFree: boolean;
  isFresh: boolean;
  manuallyEditedFields: string[];
}

export type Confidence = "HIGH" | "MEDIUM" | "NONE";

export interface MatchCandidate {
  product: CatalogueProduct;
  score: number;
  sizeKnown: boolean;
}

export interface MatchResult {
  confidence: Confidence;
  best: MatchCandidate | null;
  runnerUp: MatchCandidate | null;
  reason: string;
  /** Same product at another size, for the report ("also sold as 400g"). */
  otherSizes: CatalogueProduct[];
}

const SIZE_TOKEN = /^\d+(?:\.\d+)?(?:g|kg|ml|l|s|pcs|pk|x)?$/;

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}i`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export interface WordContext {
  spelling: Record<string, string>;
  synonym: Map<string, string>;
  ignore: Set<string>;
}

export function wordContext(
  profile: StockImportProfile,
  extraIgnore: readonly string[] = [],
): WordContext {
  const synonym = new Map<string, string>();
  for (const group of profile.synonyms) {
    const head = singular(group[0].toLowerCase());
    for (const w of group) synonym.set(singular(w.toLowerCase()), head);
  }
  return {
    spelling: profile.spelling,
    synonym,
    ignore: new Set(
      [
        "the",
        "and",
        "of",
        "with",
        "mix",
        "pack",
        "brand",
        ...profile.ignoreWords,
        ...extraIgnore,
      ].map((w) => singular(w.toLowerCase())),
    ),
  };
}

/** Comparable words: spelling-fixed, singular, synonyms folded, sizes and filler dropped. */
export function matchWords(text: string, ctx: WordContext): string[] {
  const fixed = applySpelling(normaliseSizeText(text), ctx.spelling).toLowerCase();
  const out: string[] = [];
  for (const raw of fixed.split(/[^a-z0-9.]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, "");
    if (!w || SIZE_TOKEN.test(w)) continue;
    const s = singular(w);
    if (ctx.ignore.has(s)) continue;
    const folded = ctx.synonym.get(s) ?? s;
    if (!out.includes(folded)) out.push(folded);
  }
  return out;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Same word, or a one-letter slip in a word of five letters or more with the same first letter
 * ("tenderiser"/"tenderizer"). The first letter rule keeps "Bihari" and "Nihari" apart.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a[0] === b[0] && editDistanceAtMostOne(a, b);
}

function overlap(row: string[], cand: string[]): number {
  return row.filter((w) => cand.some((c) => sameWord(w, c))).length;
}

export function toBaseAmount(net: NetContent): { amount: number; base: "g" | "ml" | "each" } {
  switch (net.unit) {
    case "KILOGRAM":
      return { amount: net.amount * 1000, base: "g" };
    case "GRAM":
      return { amount: net.amount, base: "g" };
    case "LITRE":
      return { amount: net.amount * 1000, base: "ml" };
    case "MILLILITRE":
      return { amount: net.amount, base: "ml" };
    default:
      return { amount: net.amount, base: "each" };
  }
}

export function productNetContent(p: CatalogueProduct): NetContent | null {
  if (p.netContentAmount !== null && p.netContentUnit !== null)
    return { amount: p.netContentAmount, unit: p.netContentUnit };
  const found = extractDetailedNetContent(normaliseSizeText(p.name));
  return found && found.confidence === "HIGH" ? { amount: found.amount, unit: found.unit } : null;
}

function sameSize(a: NetContent, b: NetContent): boolean {
  const x = toBaseAmount(a);
  const y = toBaseAmount(b);
  return x.base === y.base && x.amount === y.amount;
}

/** The product's brand in profile terms: its brand record, else a leading brand word in its name. */
export function productBrand(
  p: CatalogueProduct,
  profile: StockImportProfile,
  knownBrands: readonly string[],
): string | null {
  // A till export left brands such as "SHAN BUTTER CHICKEN"; its leading word is the real brand.
  const fromBrand = p.brandName ? leadingBrand(p.brandName, profile, knownBrands) : null;
  if (fromBrand) return fromBrand.brand;
  const fromName = leadingBrand(p.name, profile, knownBrands);
  if (fromName) return fromName.brand;
  return p.brandName;
}

function conflicts(row: string[], cand: string[], groups: string[][]): boolean {
  return groups.some((group) => {
    const g = group.map((w) => singular(w.toLowerCase()));
    const a = row.filter((w) => g.includes(w));
    const b = cand.filter((w) => g.includes(w));
    return a.length > 0 && b.length > 0 && !a.some((w) => b.includes(w));
  });
}

export interface MatchIndex {
  products: CatalogueProduct[];
  byPlu: Map<string, CatalogueProduct>;
  byBarcode: Map<string, CatalogueProduct>;
  brandOf: Map<string, string | null>;
  wordsOf: Map<string, string[]>;
}

export function buildIndex(
  products: CatalogueProduct[],
  profile: StockImportProfile,
  knownBrands: readonly string[],
  ctx: WordContext,
): MatchIndex {
  const brandOf = new Map<string, string | null>();
  const wordsOf = new Map<string, string[]>();
  for (const p of products) {
    const brand = productBrand(p, profile, knownBrands);
    brandOf.set(p.id, brand);
    const brandWords = brand ? matchWords(brand, ctx) : [];
    const aliasWords = profile.brands
      .filter((b) => b.name === brand)
      .flatMap((b) => b.aliases.flatMap((a) => matchWords(a, ctx)));
    wordsOf.set(
      p.id,
      matchWords(p.name, ctx).filter((w) => !brandWords.includes(w) && !aliasWords.includes(w)),
    );
  }
  return {
    products,
    byPlu: new Map(products.filter((p) => p.plu).map((p) => [p.plu as string, p])),
    byBarcode: new Map(products.filter((p) => p.barcode).map((p) => [p.barcode as string, p])),
    brandOf,
    wordsOf,
  };
}

export function matchRow(
  row: NormalisedRow,
  index: MatchIndex,
  profile: StockImportProfile,
  ctx: WordContext,
): MatchResult {
  const none = (reason: string, otherSizes: CatalogueProduct[] = []): MatchResult => ({
    confidence: "NONE",
    best: null,
    runnerUp: null,
    reason,
    otherSizes,
  });
  if (row.plu && index.byPlu.has(row.plu)) {
    const product = index.byPlu.get(row.plu) as CatalogueProduct;
    return {
      confidence: "HIGH",
      best: { product, score: 1, sizeKnown: true },
      runnerUp: null,
      reason: "same PLU",
      otherSizes: [],
    };
  }
  if (row.barcode && index.byBarcode.has(row.barcode)) {
    const product = index.byBarcode.get(row.barcode) as CatalogueProduct;
    return {
      confidence: "HIGH",
      best: { product, score: 1, sizeKnown: true },
      runnerUp: null,
      reason: "same barcode",
      otherSizes: [],
    };
  }

  const words = matchWords(row.coreName, ctx);
  if (words.length === 0) return none("no words to match on");
  const scored: MatchCandidate[] = [];
  const otherSizes: CatalogueProduct[] = [];
  for (const product of index.products) {
    if (row.brand && index.brandOf.get(product.id) !== row.brand) continue;
    const cand = index.wordsOf.get(product.id) ?? [];
    if (cand.length === 0 || conflicts(words, cand, profile.conflictingForms)) continue;
    const shared = overlap(words, cand);
    if (shared === 0) continue;
    const coverage = shared / words.length;
    const jaccard = shared / (words.length + cand.length - shared);
    const score = 0.5 * coverage + 0.5 * jaccard;
    if (score < 0.5) continue;
    const net = productNetContent(product);
    if (row.netContent && net && !sameSize(row.netContent, net)) {
      if (score >= 0.75) otherSizes.push(product);
      continue;
    }
    scored.push({ product, score, sizeKnown: Boolean(row.netContent && net) });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.sizeKnown) - Number(a.sizeKnown));
  const [best, runnerUp = null] = scored;
  if (!best)
    return none(
      otherSizes.length > 0 ? "exists only at another size" : "no similar product",
      otherSizes,
    );

  const gap = best.score - (runnerUp?.score ?? 0);
  const reasons: string[] = [];
  if (!row.brand) reasons.push("no brand on the row");
  if (!best.sizeKnown) reasons.push("size not known on both sides");
  if (best.score < 0.75) reasons.push(`weak name match (${best.score.toFixed(2)})`);
  if (runnerUp && gap < 0.15) reasons.push(`close to "${runnerUp.product.name}"`);
  const confidence: Confidence = reasons.length === 0 ? "HIGH" : "MEDIUM";
  return {
    confidence,
    best,
    runnerUp,
    reason:
      confidence === "HIGH"
        ? `brand, size and name match (${best.score.toFixed(2)})`
        : reasons.join("; "),
    otherSizes,
  };
}
