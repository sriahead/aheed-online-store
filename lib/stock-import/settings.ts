import { applyPresets, parseProfile, type StockImportProfile } from "./profile";
import { isPresetName, loadPresets, type PresetName } from "./presets";

/**
 * #1578 — a store's import settings as plain data: what the settings tables hold (by brand and
 * category NAME/SLUG rather than id, so the same shape serves the screen, the CLI push and tests),
 * the conversion to the profile `lib/stock-import/` already runs on, and the text formats the
 * settings screen edits. Pure.
 */

export const COLUMN_KEYS = [
  "name",
  "size",
  "price",
  "plu",
  "barcode",
  "brand",
  "category",
  "description",
  "wasPrice",
  "multiBuy",
  "bundle",
  "bundleQuantity",
  "promotion",
  "vat",
  "origin",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Product name",
  size: "Size or weight",
  price: "Price",
  plu: "PLU / till code",
  barcode: "Barcode",
  brand: "Brand",
  category: "Category",
  description: "Description",
  wasPrice: "Was price",
  multiBuy: 'Multi-buy ("3 for £5")',
  bundle: "Bundle name",
  bundleQuantity: "Bundle quantity",
  promotion: "Promotion",
  vat: "VAT rate",
  origin: "Country of origin",
};

export interface ImportSettingsData {
  headerRow: "AUTO" | "NONE";
  /** Column letter (headerRow NONE) or header text (AUTO). `name` is required. */
  columns: Partial<Record<ColumnKey, string>> & { name: string };
  defaultCategorySlug: string;
  presets: PresetName[];
  nameTemplate: string;
  keepTillWords: boolean;
  renameMatched: boolean;
  moveMatchedToCategory: boolean;
  notes: string;
  /** Brand name as the store shows it → other spellings in its sheets. */
  brandAliases: { brand: string; aliases: string[] }[];
  spelling: Record<string, string>;
  synonyms: string[][];
  ignoreWords: string[];
  noiseWords: string[];
  preserveWords: string[];
  /** Section-heading text (lower case) → category slug. */
  sectionCategories: Record<string, string>;
  /** Category-column text (lower case) → category slug. */
  categoryMap: Record<string, string>;
  files: { match: string; brand?: string; category?: string }[];
}

/** The profile the planner runs on: the settings plus their presets (settings win). */
export function profileFromSettings(s: ImportSettingsData, vendorSlug: string): StockImportProfile {
  const columns: Record<string, string> = {};
  for (const key of COLUMN_KEYS) {
    const value = s.columns[key]?.trim();
    if (value) columns[key] = value;
  }
  const profile = parseProfile({
    notes: s.notes,
    vendorSlug,
    presets: s.presets,
    headerRow: s.headerRow === "AUTO" ? "auto" : "none",
    columns,
    defaultCategory: s.defaultCategorySlug,
    sectionCategories: s.sectionCategories,
    categoryMap: s.categoryMap,
    files: s.files,
    brands: s.brandAliases.map((b) => ({ name: b.brand, aliases: b.aliases })),
    spelling: s.spelling,
    synonyms: s.synonyms.filter((g) => g.length >= 2),
    ignoreWords: s.ignoreWords,
    noiseWords: s.noiseWords,
    preserveWords: s.preserveWords,
    nameTemplate: s.nameTemplate,
    keepTillWords: s.keepTillWords,
    renameMatched: s.renameMatched,
    moveMatchedToCategory: s.moveMatchedToCategory,
  });
  return applyPresets(profile, loadPresets(profile.presets));
}

/**
 * A CLI profile (`scripts/stock-import/profiles/*.json`) as settings, for `settings-push`. Keys the
 * settings tables do not hold (form words, word order, category rules, derived attributes, flag and
 * attribute columns) are reported so nothing is dropped silently: they belong in a preset.
 */
export function settingsFromProfile(p: StockImportProfile): {
  settings: ImportSettingsData;
  notCarried: string[];
} {
  const notCarried: string[] = [];
  if (p.formWords.length) notCarried.push("formWords");
  if (p.conflictingForms.length) notCarried.push("conflictingForms");
  if (p.wordOrder.leading.length || p.wordOrder.trailing.length) notCarried.push("wordOrder");
  if (p.categoryRules.length) notCarried.push("categoryRules");
  if (p.derivedAttributes.length) notCarried.push("derivedAttributes");
  if (p.columns.flags && Object.keys(p.columns.flags).length) notCarried.push("columns.flags");
  if (p.columns.attributes && Object.keys(p.columns.attributes).length)
    notCarried.push("columns.attributes");
  const { flags: _flags, attributes: _attributes, ...plain } = p.columns;
  const unknownPresets = p.presets.filter((n) => !isPresetName(n));
  if (unknownPresets.length) throw new Error(`unknown presets: ${unknownPresets.join(", ")}`);
  return {
    settings: {
      headerRow: p.headerRow === "auto" ? "AUTO" : "NONE",
      columns: plain,
      defaultCategorySlug: p.defaultCategory,
      presets: p.presets as PresetName[],
      nameTemplate: p.nameTemplate,
      keepTillWords: p.keepTillWords,
      renameMatched: p.renameMatched,
      moveMatchedToCategory: p.moveMatchedToCategory,
      notes: p.notes ?? "",
      brandAliases: p.brands.map((b) => ({ brand: b.name, aliases: b.aliases })),
      spelling: p.spelling,
      synonyms: p.synonyms,
      ignoreWords: p.ignoreWords,
      noiseWords: p.noiseWords,
      preserveWords: p.preserveWords,
      sectionCategories: p.sectionCategories,
      categoryMap: p.categoryMap,
      files: p.files,
    },
    notCarried,
  };
}

// ---- Text formats edited on the settings screen ---------------------------------------------

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

const splitList = (text: string) =>
  text
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** "wrong = right" per line. Keys are lower-cased (matching is case-insensitive). */
export function parsePairs(text: string, what: string): Parsed<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const line of lines(text)) {
    const at = line.indexOf("=");
    const from = at < 0 ? "" : line.slice(0, at).trim().toLowerCase();
    const to = at < 0 ? "" : line.slice(at + 1).trim();
    if (!from || !to)
      return { ok: false, error: `${what}: "${line}" needs the form "text = value"` };
    out[from] = to;
  }
  return { ok: true, value: out };
}

export function formatPairs(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

/** One group per line, comma separated ("jeera, cumin"). Each group needs two words. */
export function parseGroups(text: string, what: string): Parsed<string[][]> {
  const out: string[][] = [];
  for (const line of lines(text)) {
    const words = [...new Set(splitList(line).map((w) => w.toLowerCase()))];
    if (words.length < 2) return { ok: false, error: `${what}: "${line}" needs two or more words` };
    out.push(words);
  }
  return { ok: true, value: out };
}

export function formatGroups(groups: string[][]): string {
  return groups.map((g) => g.join(", ")).join("\n");
}

/** Comma- or line-separated words. */
export function parseWords(text: string): string[] {
  return [...new Set(splitList(text))];
}

export function formatWords(words: string[]): string {
  return words.join(", ");
}

/** "Brand: alias, alias" per line. */
export function parseBrandAliases(text: string): Parsed<{ brand: string; aliases: string[] }[]> {
  const out: { brand: string; aliases: string[] }[] = [];
  for (const line of lines(text)) {
    const at = line.indexOf(":");
    const brand = (at < 0 ? line : line.slice(0, at)).trim();
    if (!brand) return { ok: false, error: `Brand spellings: "${line}" needs a brand name` };
    const aliases = at < 0 ? [] : parseWords(line.slice(at + 1)).map((a) => a.toLowerCase());
    out.push({ brand, aliases });
  }
  return { ok: true, value: out };
}

export function formatBrandAliases(list: { brand: string; aliases: string[] }[]): string {
  return list
    .map((b) => (b.aliases.length ? `${b.brand}: ${b.aliases.join(", ")}` : b.brand))
    .join("\n");
}

/** "file-name pattern = Brand | Category" per line; either side of "|" may be empty. */
export function parseFileRules(
  text: string,
): Parsed<{ match: string; brand?: string; category?: string }[]> {
  const out: { match: string; brand?: string; category?: string }[] = [];
  for (const line of lines(text)) {
    const at = line.indexOf("=");
    const match = at < 0 ? "" : line.slice(0, at).trim();
    const [brand, category] = (at < 0 ? "" : line.slice(at + 1)).split("|").map((p) => p.trim());
    if (!match || (!brand && !category))
      return {
        ok: false,
        error: `File rules: "${line}" needs the form "pattern = Brand | Category"`,
      };
    try {
      new RegExp(match, "i");
    } catch {
      return { ok: false, error: `File rules: "${match}" is not a valid pattern` };
    }
    out.push({ match, ...(brand ? { brand } : {}), ...(category ? { category } : {}) });
  }
  return { ok: true, value: out };
}

export function formatFileRules(
  files: { match: string; brand?: string; category?: string }[],
): string {
  return files.map((f) => `${f.match} = ${f.brand ?? ""} | ${f.category ?? ""}`).join("\n");
}

/** A column is a letter (no header row) or header text (header row). */
export function columnProblem(headerRow: "AUTO" | "NONE", value: string): string | null {
  if (headerRow === "NONE" && !/^[A-Z]{1,2}$/.test(value))
    return `"${value}" is not a column letter (A, B, C …)`;
  return null;
}

/** Spreadsheet column letter for a 0-based index (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
