import type { NetContentUnit } from "@/components/product/unit-price";
import { slugify } from "@/lib/catalogue-form";
import {
  extractDetailedNetContent,
  formatNetContentDisplay,
} from "@/lib/catalogue-import/net-content";
import { parsePricePence } from "@/lib/catalogue-import/price";
import { FLAG_KEYS, type FlagKey, type StockImportProfile } from "./profile";

/**
 * #1570 R1, R3–R5 — one spreadsheet grid to normalised product rows. Pure: no database, no
 * spreadsheet package (the script reads the file through `scripts/lib/read-spreadsheet.ts`).
 * Nothing is invented: a value the sheet does not give stays null and is reported, never guessed.
 */

export interface SourceFile {
  fileName: string;
  grid: string[][];
  /** 1-based sheet row of `grid[0]`. */
  firstRowNumber: number;
}

export type Severity = "error" | "warning";

export interface RowIssue {
  code:
    | "NO_PRICE"
    | "BAD_PRICE"
    | "ZERO_PRICE"
    | "PRICE_ANOMALY"
    | "NO_SIZE"
    | "BAD_SIZE"
    | "NO_BRAND"
    | "BAD_WAS_PRICE"
    | "BAD_MULTI_BUY"
    | "BAD_VAT"
    | "BAD_FLAG"
    | "NO_HEADER";
  severity: Severity;
  message: string;
}

export interface NetContent {
  amount: number;
  unit: NetContentUnit;
}

export type CategoryTarget = { slug: string } | { newName: string; slug: string };

export interface NormalisedRow {
  /** Stable id within a run: `<file>#<row>` plus `a`/`b` for a split row. */
  key: string;
  fileName: string;
  rowNumber: number;
  sourceText: string;
  section: string | null;
  brand: string | null;
  /** The product's own words, cleaned, without brand or size. */
  coreName: string;
  /** The shopper name from the profile's template. */
  displayName: string;
  sizeLabel: string | null;
  netContent: NetContent | null;
  pricePence: number | null;
  plu: string | null;
  barcode: string | null;
  category: CategoryTarget;
  description: string | null;
  wasPricePence: number | null;
  multiBuy: { quantity: number; pricePence: number } | null;
  bundle: { name: string; quantity: number } | null;
  promotion: string | null;
  vatRate: number | null;
  origin: string | null;
  flags: Partial<Record<FlagKey, boolean>>;
  attributes: Record<string, string>;
  issues: RowIssue[];
}

const PRICE_ANOMALY_PENCE = 100_000;

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `100grm`, `50 gms`, `30gr` → `100g`; the shared extractor then reads it. */
export function normaliseSizeText(text: string): string {
  return text
    .replace(/(\d)\s*(?:grms?|gms?|grams?|gr)\b/gi, "$1g")
    .replace(/(\d)\s*(?:kgs?|kilos?)\b/gi, "$1kg")
    .replace(/(\d)\s*(?:ltrs?|litres?|liters?)\b/gi, "$1l")
    .trim();
}

export function parseSize(text: string): { net: NetContent; label: string } | null {
  const found = extractDetailedNetContent(normaliseSizeText(text));
  if (!found || found.confidence !== "HIGH") return null;
  const net = { amount: found.amount, unit: found.unit };
  return { net, label: formatNetContentDisplay(net) };
}

/** Whole-word spelling fixes, keeping the rest of the text as written. */
export function applySpelling(text: string, spelling: Record<string, string>): string {
  let out = text;
  for (const [from, to] of Object.entries(spelling)) {
    out = out.replace(
      new RegExp(`(^|[^a-z0-9])${escapeRegExp(from)}(?=$|[^a-z0-9])`, "gi"),
      `$1${to}`,
    );
  }
  return out;
}

export function titleCase(
  text: string,
  profile: Pick<StockImportProfile, "lowercaseWords" | "preserveWords">,
): string {
  const keepLower = new Set(profile.lowercaseWords.map(lower));
  const preserve = new Map(profile.preserveWords.map((w) => [lower(w), w]));
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
  return text
    .replace(/\s*\/\s*/g, "/")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      word
        .split("/")
        .map((part) => {
          const kept = preserve.get(lower(part));
          if (kept) return kept;
          if (i > 0 && keepLower.has(lower(part))) return part.toLowerCase();
          return cap(part);
        })
        .join("/"),
    )
    .join(" ");
}

/** A row "x / y" where both are form words becomes two names; anything else stays one. */
export function splitForms(text: string, formWords: readonly string[]): string[] {
  const forms = new Set(formWords.map(lower));
  const match = /([A-Za-z]+)\s*\/\s*([A-Za-z]+)/.exec(text);
  if (!match || !forms.has(lower(match[1])) || !forms.has(lower(match[2]))) return [text];
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return [match[1], match[2]].map((form) => `${before}${form}${after}`.replace(/\s+/g, " ").trim());
}

interface BrandEntry {
  name: string;
  spellings: string[];
}

function brandEntries(profile: StockImportProfile, knownBrands: readonly string[]): BrandEntry[] {
  const entries: BrandEntry[] = profile.brands.map((b) => ({
    name: b.name,
    spellings: [b.name, ...b.aliases].map(lower),
  }));
  const covered = new Set(entries.flatMap((e) => e.spellings));
  const known: BrandEntry[] = knownBrands
    .filter((name) => !covered.has(lower(name)))
    .map((name) => ({ name, spellings: [lower(name)] }));
  // Longest spelling first, so "Heera Gold" beats "Heera" — but the profile's brands always come
  // before the store's own: a till export left brands such as "SHAN KARAHI", which must not beat "Shan".
  const longestFirst = (a: BrandEntry, b: BrandEntry) =>
    Math.max(...b.spellings.map((s) => s.length)) - Math.max(...a.spellings.map((s) => s.length));
  return [...entries.sort(longestFirst), ...known.sort(longestFirst)];
}

/** The canonical brand for a free-text brand value, or the value itself, title-cased. */
export function canonicalBrand(
  value: string,
  profile: StockImportProfile,
  knownBrands: readonly string[] = [],
): string {
  const v = lower(value);
  for (const entry of brandEntries(profile, knownBrands)) {
    if (entry.spellings.includes(v)) return entry.name;
  }
  return titleCase(value, profile);
}

/** A leading brand word (or alias) in the name: the brand and the rest of the name. */
export function leadingBrand(
  name: string,
  profile: StockImportProfile,
  knownBrands: readonly string[] = [],
): { brand: string; rest: string } | null {
  const text = name.trim();
  for (const entry of brandEntries(profile, knownBrands)) {
    for (const spelling of entry.spellings) {
      const m = new RegExp(`^${escapeRegExp(spelling)}(?=$|[^a-z0-9])[\\s\\-/:.]*`, "i").exec(text);
      if (m) return { brand: entry.name, rest: text.slice(m[0].length).trim() };
    }
  }
  return null;
}

export function composeName(
  template: string,
  parts: { brand: string | null; name: string; size: string | null },
): string {
  return template
    .replace("{brand}", parts.brand ?? "")
    .replace("{name}", parts.name)
    .replace("{size}", parts.size ?? "")
    .replace(/\s+[–-]\s*$/, "")
    .replace(/^\s*[–-]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFlag(raw: string): boolean | undefined | "bad" {
  const v = lower(raw);
  if (v === "") return undefined;
  if (["y", "yes", "true", "1", "✓", "x"].includes(v)) return true;
  if (["n", "no", "false", "0"].includes(v)) return false;
  return "bad";
}

export function parseMultiBuy(raw: string): { quantity: number; pricePence: number } | null {
  const m = /^\s*(\d+)\s*(?:for|x|@)\s*(£?\s*\d+(?:\.\d{1,2})?p?)\s*$/i.exec(raw);
  if (!m) return null;
  const price = parsePricePence(m[2]);
  const quantity = parseInt(m[1], 10);
  if (!price.ok || quantity < 2) return null;
  return { quantity, pricePence: price.pence };
}

interface ColumnIndex {
  get(row: string[], key: string | undefined): string;
}

function letterIndex(col: string): number | null {
  if (!/^[A-Z]{1,2}$/.test(col)) return null;
  return [...col].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

function buildColumnIndex(header: string[] | null): ColumnIndex {
  const byHeader = new Map((header ?? []).map((h, i) => [lower(h), i]));
  return {
    get(row, key) {
      if (!key) return "";
      const i = byHeader.get(lower(key)) ?? letterIndex(key);
      return i === null || i === undefined ? "" : String(row[i] ?? "").trim();
    },
  };
}

function fileDefaults(profile: StockImportProfile, fileName: string) {
  return profile.files.find((f) => new RegExp(f.match, "i").test(fileName)) ?? null;
}

function categoryFor(
  profile: StockImportProfile,
  categoryText: string,
  section: string | null,
  fileCategory: string | undefined,
): CategoryTarget {
  if (categoryText) {
    const mapped = profile.categoryMap[lower(categoryText)];
    if (mapped) return { slug: mapped };
    const name = titleCase(categoryText, profile);
    return { newName: name, slug: slugify(name) };
  }
  if (section && profile.sectionCategories[section])
    return { slug: profile.sectionCategories[section] };
  if (fileCategory) return { slug: fileCategory };
  return { slug: profile.defaultCategory };
}

function deriveAttributes(
  profile: StockImportProfile,
  name: string,
  given: Record<string, string>,
) {
  const words = new Set(
    lower(name)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const out = { ...given };
  for (const rule of profile.derivedAttributes) {
    if (out[rule.name]) continue;
    for (const [option, triggers] of Object.entries(rule.options)) {
      if (
        triggers.some((t) =>
          t.includes(" ") ? lower(name).includes(lower(t)) : words.has(lower(t)),
        )
      ) {
        out[rule.name] = option;
        break;
      }
    }
  }
  return out;
}

export function normaliseFile(
  file: SourceFile,
  profile: StockImportProfile,
  knownBrands: readonly string[] = [],
): { rows: NormalisedRow[]; fileIssues: RowIssue[] } {
  const cols = profile.columns;
  const fileIssues: RowIssue[] = [];
  let header: string[] | null = null;
  let start = 0;
  if (profile.headerRow === "auto") {
    const at = file.grid.findIndex((r) => r.some((c) => lower(c) === lower(cols.name)));
    if (at >= 0) {
      header = file.grid[at];
      start = at + 1;
    } else if (letterIndex(cols.name) === null) {
      fileIssues.push({
        code: "NO_HEADER",
        severity: "error",
        message: `no header row naming "${cols.name}" in ${file.fileName}`,
      });
      return { rows: [], fileIssues };
    }
  }
  const col = buildColumnIndex(header);
  const defaults = fileDefaults(profile, file.fileName);
  const rows: NormalisedRow[] = [];
  let section: string | null = null;

  for (let i = start; i < file.grid.length; i++) {
    const raw = file.grid[i];
    const rowNumber = file.firstRowNumber + i;
    const nameCell = col.get(raw, cols.name).replace(/\s+/g, " ").trim();
    const sizeCell = col.get(raw, cols.size);
    const priceCell = col.get(raw, cols.price);
    if (!nameCell && !sizeCell && !priceCell) continue;
    if (nameCell && !sizeCell && !priceCell && !col.get(raw, cols.plu)) {
      section = lower(nameCell);
      continue;
    }

    const issues: RowIssue[] = [];
    // Brand: the column, then a leading brand word, then the file's default.
    const brandCell = col.get(raw, cols.brand);
    let brand: string | null = null;
    let rest = applySpelling(nameCell, profile.spelling);
    const lead = leadingBrand(rest, profile, knownBrands);
    if (brandCell) {
      brand = canonicalBrand(brandCell, profile, knownBrands);
      if (lead && lead.brand === brand) rest = lead.rest;
    } else if (lead) {
      brand = lead.brand;
      rest = lead.rest;
    } else if (defaults?.brand) {
      brand = canonicalBrand(defaults.brand, profile, knownBrands);
    }
    if (!brand) issues.push({ code: "NO_BRAND", severity: "warning", message: "no brand found" });

    // Size: its column, else a size written in the name (removed from the name).
    let size = sizeCell ? parseSize(sizeCell) : null;
    if (sizeCell && !size)
      issues.push({
        code: "BAD_SIZE",
        severity: "warning",
        message: `size "${sizeCell}" not understood`,
      });
    if (!sizeCell) {
      const normalised = normaliseSizeText(rest);
      const found = extractDetailedNetContent(normalised);
      if (found && found.confidence === "HIGH") {
        size = {
          net: { amount: found.amount, unit: found.unit },
          label: formatNetContentDisplay(found),
        };
        rest = normalised.replace(found.rawMatch, " ").replace(/\s+/g, " ").trim();
      } else {
        issues.push({ code: "NO_SIZE", severity: "warning", message: "no size given" });
      }
    }

    let pricePence: number | null = null;
    if (!priceCell) {
      issues.push({ code: "NO_PRICE", severity: "error", message: "no price" });
    } else {
      const price = parsePricePence(priceCell);
      if (!price.ok) issues.push({ code: "BAD_PRICE", severity: "error", message: price.reason });
      else if (price.pence === 0)
        issues.push({ code: "ZERO_PRICE", severity: "error", message: "price is £0" });
      else {
        pricePence = price.pence;
        if (price.pence > PRICE_ANOMALY_PENCE)
          issues.push({
            code: "PRICE_ANOMALY",
            severity: "warning",
            message: `price ${priceCell} is over £1,000`,
          });
      }
    }

    let wasPricePence: number | null = null;
    const wasCell = col.get(raw, cols.wasPrice);
    if (wasCell) {
      const was = parsePricePence(wasCell);
      if (was.ok && pricePence !== null && was.pence > pricePence) wasPricePence = was.pence;
      else
        issues.push({
          code: "BAD_WAS_PRICE",
          severity: "warning",
          message: `was price "${wasCell}" ignored (not above the price)`,
        });
    }

    let multiBuy: NormalisedRow["multiBuy"] = null;
    const multiCell = col.get(raw, cols.multiBuy);
    if (multiCell) {
      multiBuy = parseMultiBuy(multiCell);
      if (multiBuy && pricePence !== null && multiBuy.pricePence >= multiBuy.quantity * pricePence)
        multiBuy = null;
      if (!multiBuy)
        issues.push({
          code: "BAD_MULTI_BUY",
          severity: "warning",
          message: `multi-buy "${multiCell}" not understood or no saving`,
        });
    }

    const bundleName = col.get(raw, cols.bundle);
    const bundleQty = parseInt(col.get(raw, cols.bundleQuantity) || "1", 10);
    const bundle = bundleName
      ? { name: bundleName, quantity: bundleQty > 0 ? bundleQty : 1 }
      : null;

    let vatRate: number | null = null;
    const vatCell = col.get(raw, cols.vat).replace("%", "").trim();
    if (vatCell) {
      const v = Number(vatCell);
      if ([0, 5, 20].includes(v)) vatRate = v;
      else
        issues.push({
          code: "BAD_VAT",
          severity: "warning",
          message: `VAT "${vatCell}" is not 0, 5 or 20`,
        });
    }

    const flags: NormalisedRow["flags"] = {};
    for (const key of FLAG_KEYS) {
      const cell = cols.flags?.[key];
      if (!cell) continue;
      const value = parseFlag(col.get(raw, cell));
      if (value === "bad")
        issues.push({
          code: "BAD_FLAG",
          severity: "warning",
          message: `${key} "${col.get(raw, cell)}" not yes/no`,
        });
      else if (value !== undefined) flags[key] = value;
    }

    const givenAttributes: Record<string, string> = {};
    for (const [attr, cell] of Object.entries(cols.attributes ?? {})) {
      const value = col.get(raw, cell);
      if (value) givenAttributes[attr] = titleCase(value, profile);
    }

    const category = categoryFor(profile, col.get(raw, cols.category), section, defaults?.category);
    const variants = splitForms(rest, profile.formWords);
    variants.forEach((variant, v) => {
      const coreName = titleCase(variant, profile);
      rows.push({
        key: `${file.fileName}#${rowNumber}${variants.length > 1 ? String.fromCharCode(97 + v) : ""}`,
        fileName: file.fileName,
        rowNumber,
        sourceText: nameCell,
        section,
        brand,
        coreName,
        displayName: composeName(profile.nameTemplate, {
          brand,
          name: coreName,
          size: size?.label ?? null,
        }),
        sizeLabel: size?.label ?? null,
        netContent: size?.net ?? null,
        pricePence,
        plu: col.get(raw, cols.plu) || null,
        barcode: col.get(raw, cols.barcode) || null,
        category,
        description: col.get(raw, cols.description) || null,
        wasPricePence,
        multiBuy,
        bundle,
        promotion: col.get(raw, cols.promotion) || null,
        vatRate,
        origin: col.get(raw, cols.origin) || null,
        flags,
        attributes: deriveAttributes(profile, coreName, givenAttributes),
        issues: [...issues],
      });
    });
  }
  return { rows, fileIssues };
}
