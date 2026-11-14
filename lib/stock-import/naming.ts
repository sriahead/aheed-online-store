import { wordContext, matchWords, type CatalogueProduct, type WordContext } from "./match";
import {
  applySpelling,
  composeName,
  deriveAttributes,
  leadingBrand,
  namingFor,
  normaliseSizeText,
  orderWords,
  titleCase,
  type NormalisedRow,
} from "./normalise";
import type { StockImportProfile } from "./profile";

/**
 * #1573 — an import never makes a matched product's name LESS specific.
 *
 * A price list is often terser than the till: "Black Seeds" for the till's "BLACK ONION SEEDS",
 * "Keema" for "KEEMA CURRY MIX", "Dalchini" for "CINNAMON STICKS". When the till name has every word
 * of the list's name (synonyms folded, so "dalchini" is "cinnamon") plus more, the clean name is built
 * from the till's wording instead. Words are only ever kept from the till, never invented.
 *
 * Unlike matching, "mix" and "curry" COUNT here: they are filler for finding a product but part of
 * what a shopper reads. Only the profile's `noiseWords` (till clutter such as "pkt") and numbers are
 * dropped.
 */

const BASE_NOISE = ["the", "pack", "brand"];

function namingContext(profile: StockImportProfile): WordContext {
  const ctx = wordContext(profile);
  return {
    ...ctx,
    ignore: new Set([...BASE_NOISE, ...profile.noiseWords].map((w) => w.toLowerCase())),
  };
}

/** The till's own wording, minus its brand, sizes, numbers, punctuation and noise words. */
export function tillCore(
  tillName: string,
  product: Pick<CatalogueProduct, "brandName">,
  profile: StockImportProfile,
  knownBrands: readonly string[],
): string {
  const brands = product.brandName ? [...knownBrands, product.brandName] : knownBrands;
  let text = applySpelling(tillName.replace(/[()[\]{}.,]/g, " "), profile.spelling);
  const lead = leadingBrand(text, profile, brands);
  if (lead) text = lead.rest;
  const noise = new Set([...BASE_NOISE, ...profile.noiseWords].map((w) => w.toLowerCase()));
  return normaliseSizeText(text)
    .replace(/\s*[/–-]\s*/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && !noise.has(w.toLowerCase()))
    .join(" ");
}

export interface TillWordsResult {
  row: NormalisedRow;
  /** The till words kept, for the review sheet; empty when the list's name was used. */
  kept: string[];
}

/**
 * The row with the till's wording when it is strictly more descriptive; otherwise the row unchanged.
 * `tillName` is the name the till gave the product: its current name, or the name an earlier run
 * replaced (`--previous-run`).
 */
export function withTillWords(
  row: NormalisedRow,
  product: CatalogueProduct,
  tillName: string,
  profile: StockImportProfile,
  knownBrands: readonly string[],
): TillWordsResult {
  if (!profile.keepTillWords) return { row, kept: [] };
  const ctx = namingContext(profile);
  const core = tillCore(tillName, product, profile, knownBrands);
  const listWords = matchWords(row.coreName, ctx);
  const tillWords = matchWords(core, ctx);
  if (listWords.length === 0 || !listWords.every((w) => tillWords.includes(w)))
    return { row, kept: [] };
  const extra = tillWords.filter((w) => !listWords.includes(w));
  if (extra.length === 0) return { row, kept: [] };

  // One word per meaning: "Turmeric Powder Haldi" keeps "Turmeric", drops the repeat "Haldi".
  const seen = new Set<string>();
  const deduped = core
    .split(" ")
    .filter((word) => {
      const folded = matchWords(word, ctx);
      if (folded.length > 0 && folded.every((f) => seen.has(f))) return false;
      folded.forEach((f) => seen.add(f));
      return true;
    })
    .join(" ");
  const naming = namingFor(profile, row.category.slug);
  const coreName = orderWords(titleCase(deduped, profile), naming.wordOrder);
  return {
    row: {
      ...row,
      coreName,
      displayName: composeName(naming.nameTemplate, {
        brand: row.brand,
        name: coreName,
        size: row.sizeLabel,
      }),
      attributes: deriveAttributes(profile, coreName, row.attributes, row.category.slug),
    },
    kept: extra,
  };
}
