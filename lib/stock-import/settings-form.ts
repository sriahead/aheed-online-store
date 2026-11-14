import { PRESET_NAMES } from "./presets";
import {
  COLUMN_KEYS,
  columnProblem,
  formatBrandAliases,
  formatFileRules,
  formatGroups,
  formatPairs,
  formatWords,
  parseBrandAliases,
  parseFileRules,
  parseGroups,
  parsePairs,
  parseWords,
  type ColumnKey,
  type ImportSettingsData,
  type Parsed,
} from "./settings";

/**
 * #1578 — the settings screen's form ⇄ `ImportSettingsData`. Categories are shown and typed by
 * NAME (a store admin never sees a slug); either a name or a slug is accepted. Pure, so the server
 * action stays a thin wrapper.
 */

export interface CategoryChoice {
  slug: string;
  name: string;
}

export interface SettingsFormState {
  error: string | null;
  message: string | null;
}

export const SETTINGS_FORM_IDLE: SettingsFormState = { error: null, message: null };

/** The text each textarea shows. */
export interface SettingsFormText {
  brandAliases: string;
  spelling: string;
  synonyms: string;
  ignoreWords: string;
  noiseWords: string;
  preserveWords: string;
  sectionCategories: string;
  categoryMap: string;
  files: string;
}

function categoryName(slug: string, categories: readonly CategoryChoice[]): string {
  return categories.find((c) => c.slug === slug)?.name ?? slug;
}

function resolveCategory(text: string, categories: readonly CategoryChoice[]): string | null {
  const t = text.trim().toLowerCase();
  return categories.find((c) => c.slug === t || c.name.trim().toLowerCase() === t)?.slug ?? null;
}

export function settingsFormText(
  s: ImportSettingsData,
  categories: readonly CategoryChoice[],
): SettingsFormText {
  const named = (pairs: Record<string, string>) =>
    formatPairs(
      Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, categoryName(v, categories)])),
    );
  return {
    brandAliases: formatBrandAliases(s.brandAliases),
    spelling: formatPairs(s.spelling),
    synonyms: formatGroups(s.synonyms),
    ignoreWords: formatWords(s.ignoreWords),
    noiseWords: formatWords(s.noiseWords),
    preserveWords: formatWords(s.preserveWords),
    sectionCategories: named(s.sectionCategories),
    categoryMap: named(s.categoryMap),
    files: formatFileRules(
      s.files.map((f) => ({
        ...f,
        ...(f.category ? { category: categoryName(f.category, categories) } : {}),
      })),
    ),
  };
}

type FormReader = { get(name: string): FormDataEntryValue | null };

const text = (form: FormReader, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

export function parseSettingsForm(
  form: FormReader,
  categories: readonly CategoryChoice[],
): Parsed<ImportSettingsData> {
  const headerRow = text(form, "headerRow") === "AUTO" ? "AUTO" : "NONE";
  const columns: Partial<Record<ColumnKey, string>> = {};
  for (const key of COLUMN_KEYS) {
    const raw = text(form, `col_${key}`).trim();
    if (!raw) continue;
    const value = headerRow === "NONE" ? raw.toUpperCase() : raw;
    const problem = columnProblem(headerRow, value);
    if (problem) return { ok: false, error: `${key}: ${problem}` };
    columns[key] = value;
  }
  if (!columns.name) return { ok: false, error: "Choose the column that holds the product name." };

  const defaultCategorySlug = resolveCategory(text(form, "defaultCategory"), categories);
  if (!defaultCategorySlug) return { ok: false, error: "Choose a default category." };

  const categoryPairs = (name: string, what: string): Parsed<Record<string, string>> => {
    const pairs = parsePairs(text(form, name), what);
    if (!pairs.ok) return pairs;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(pairs.value)) {
      const slug = resolveCategory(v, categories);
      if (!slug) return { ok: false, error: `${what}: there is no category called "${v}"` };
      out[k] = slug;
    }
    return { ok: true, value: out };
  };

  const brandAliases = parseBrandAliases(text(form, "brandAliases"));
  if (!brandAliases.ok) return brandAliases;
  const spelling = parsePairs(text(form, "spelling"), "Spelling fixes");
  if (!spelling.ok) return spelling;
  const synonyms = parseGroups(text(form, "synonyms"), "Words that mean the same");
  if (!synonyms.ok) return synonyms;
  const sectionCategories = categoryPairs("sectionCategories", "Section headings");
  if (!sectionCategories.ok) return sectionCategories;
  const categoryMap = categoryPairs("categoryMap", "Category column");
  if (!categoryMap.ok) return categoryMap;
  const files = parseFileRules(text(form, "files"));
  if (!files.ok) return files;
  const resolvedFiles: ImportSettingsData["files"] = [];
  for (const f of files.value) {
    if (!f.category) {
      resolvedFiles.push(f);
      continue;
    }
    const slug = resolveCategory(f.category, categories);
    if (!slug)
      return { ok: false, error: `File rules: there is no category called "${f.category}"` };
    resolvedFiles.push({ ...f, category: slug });
  }

  const template = text(form, "nameTemplate").trim() || "{brand} {name} – {size}";
  if (!template.includes("{name}"))
    return { ok: false, error: "The name pattern must contain {name}." };

  return {
    ok: true,
    value: {
      headerRow,
      columns: columns as ImportSettingsData["columns"],
      defaultCategorySlug,
      presets: PRESET_NAMES.filter((p) => form.get(`preset_${p}`) !== null),
      nameTemplate: template,
      keepTillWords: form.get("keepTillWords") !== null,
      renameMatched: form.get("renameMatched") !== null,
      moveMatchedToCategory: form.get("moveMatchedToCategory") !== null,
      notes: text(form, "notes").slice(0, 2000),
      brandAliases: brandAliases.value,
      spelling: spelling.value,
      synonyms: synonyms.value,
      ignoreWords: parseWords(text(form, "ignoreWords")).map((w) => w.toLowerCase()),
      noiseWords: parseWords(text(form, "noiseWords")).map((w) => w.toLowerCase()),
      preserveWords: parseWords(text(form, "preserveWords")),
      sectionCategories: sectionCategories.value,
      categoryMap: categoryMap.value,
      files: resolvedFiles,
    },
  };
}

/**
 * First-time setup (R2): settings from the columns picked against the uploaded file, with the
 * presets chosen and everything else at its default.
 */
export function initialSettings(input: {
  headerRow: "AUTO" | "NONE";
  columns: Partial<Record<ColumnKey, string>>;
  defaultCategorySlug: string;
  presets: string[];
}): Parsed<ImportSettingsData> {
  if (!input.columns.name)
    return { ok: false, error: "Choose the column that holds the product name." };
  for (const [key, value] of Object.entries(input.columns)) {
    const problem = value ? columnProblem(input.headerRow, value) : null;
    if (problem) return { ok: false, error: `${key}: ${problem}` };
  }
  return {
    ok: true,
    value: {
      headerRow: input.headerRow,
      columns: input.columns as ImportSettingsData["columns"],
      defaultCategorySlug: input.defaultCategorySlug,
      presets: PRESET_NAMES.filter((p) => input.presets.includes(p)),
      nameTemplate: "{brand} {name} – {size}",
      keepTillWords: true,
      renameMatched: true,
      moveMatchedToCategory: true,
      notes: "",
      brandAliases: [],
      spelling: {},
      synonyms: [],
      ignoreWords: [],
      noiseWords: [],
      preserveWords: [],
      sectionCategories: {},
      categoryMap: {},
      files: [],
    },
  };
}
