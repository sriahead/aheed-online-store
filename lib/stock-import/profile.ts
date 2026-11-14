import { z } from "zod";

/**
 * #1570 R2 — everything store-specific about a stock spreadsheet, so no store's brands, spellings or
 * categories live in code. `scripts/stock-import/profiles/_template.json` documents every key.
 *
 * A column is named by its header text (case-insensitive) or by its letter ("A", "B", …) when the
 * sheet has no header row.
 */

const column = z.string().min(1);

/**
 * #1573 — category slugs a rule applies to, as case-insensitive SUBSTRINGS of the row's category
 * slug ("rice" matches "rice-basmati" and "basmati-rice"), so a preset written once fits any store's
 * own slugs. Absent or empty means every category.
 */
const categoryScope = z.array(z.string().min(1)).optional();

/**
 * #1573 — word order inside the clean name (after the brand, before the size). `leading` phrases
 * (longest first) move to the front: "Chilli Powder Extra Hot" → "Extra Hot Chilli Powder".
 * `trailing` words move to the end, in the order listed: "Whole Cloves" → "Cloves Whole". Nothing is
 * added or removed, only moved.
 */
const wordOrder = z
  .object({
    leading: z.array(z.string().min(1)).default([]),
    trailing: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WordOrder = z.infer<typeof wordOrder>;

const FLAG_KEYS = ["isHalal", "isVegetarian", "isOrganic", "isGlutenFree", "isFresh"] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];
export { FLAG_KEYS };

export const stockImportProfileSchema = z
  .object({
    /** Free text for the next person: where the files come from, what was decided. */
    notes: z.string().optional(),
    vendorSlug: z.string().min(1),
    /**
     * #1573 — shared rule sets from `scripts/stock-import/presets/<name>.json` (spices, rice, fish,
     * general), merged under this profile by `applyPresets`: the profile's own values win.
     */
    presets: z.array(z.string().min(1)).default([]),
    /** "auto": the first row containing the name column's header text; "none": no header row. */
    headerRow: z.union([z.literal("auto"), z.literal("none")]).default("auto"),
    columns: z
      .object({
        name: column,
        size: column.optional(),
        price: column.optional(),
        plu: column.optional(),
        barcode: column.optional(),
        brand: column.optional(),
        category: column.optional(),
        description: column.optional(),
        wasPrice: column.optional(),
        multiBuy: column.optional(),
        bundle: column.optional(),
        bundleQuantity: column.optional(),
        promotion: column.optional(),
        vat: column.optional(),
        origin: column.optional(),
        flags: z.record(z.enum(FLAG_KEYS), column).optional(),
        /** Attribute name → column. The attribute and its options are created if missing. */
        attributes: z.record(z.string().min(1), column).optional(),
      })
      .strict(),
    /** Category slug for a row nothing else places. */
    defaultCategory: z.string().min(1),
    /** Section-heading text (lower case, trimmed) → category slug. */
    sectionCategories: z.record(z.string(), z.string()).default({}),
    /** Category text from a category column (lower case) → slug; unmapped text becomes a new inactive category. */
    categoryMap: z.record(z.string(), z.string()).default({}),
    /** Per-file defaults: `match` is a case-insensitive regular expression tested on the file name. */
    files: z
      .array(
        z
          .object({
            match: z.string().min(1),
            brand: z.string().min(1).optional(),
            category: z.string().min(1).optional(),
          })
          .strict(),
      )
      .default([]),
    /** Canonical brand names (as shoppers should see them) and the spellings that mean them. */
    brands: z
      .array(
        z.object({ name: z.string().min(1), aliases: z.array(z.string()).default([]) }).strict(),
      )
      .default([]),
    /** Whole-word spelling fixes applied to names, lower case → replacement. */
    spelling: z.record(z.string(), z.string()).default({}),
    /** Words that mean the same thing when matching (not when naming), e.g. jeera = cumin. */
    synonyms: z.array(z.array(z.string().min(1)).min(2)).default([]),
    /** Filler words ignored when matching ("curry" in "Keema Curry Mix" vs "Keema"). */
    ignoreWords: z.array(z.string()).default([]),
    /** Words describing a product's form; a row "x/y" splits only when both sides are form words. */
    formWords: z.array(z.string()).default([]),
    /** Groups of form words that can never be the same product (seeds vs leaves). */
    conflictingForms: z.array(z.array(z.string()).min(2)).default([]),
    /** Words kept in lower case inside a title-cased name. */
    lowercaseWords: z.array(z.string()).default(["and", "of", "with", "in", "a"]),
    /** Words kept exactly as written (brands in capitals, "BBQ"). */
    preserveWords: z.array(z.string()).default([]),
    /** `{brand}`, `{name}` and `{size}`; parts that are empty are dropped with their separator. */
    nameTemplate: z.string().default("{brand} {name} – {size}"),
    /** #1573 — the default word order; a category rule can replace it. */
    wordOrder: wordOrder.default({ leading: [], trailing: [] }),
    /**
     * #1573 — per-category naming: the first rule whose `categories` match the row's category slug
     * supplies its `nameTemplate` and/or `wordOrder` in place of the defaults.
     */
    categoryRules: z
      .array(
        z
          .object({
            categories: z.array(z.string().min(1)).min(1),
            nameTemplate: z.string().optional(),
            wordOrder: wordOrder.optional(),
          })
          .strict(),
      )
      .default([]),
    /**
     * #1573 — keep a matched till product's extra descriptive words. When the till name has every
     * word of the clean name plus more ("Black Onion Seeds" vs "Black Seeds"), the till's wording is
     * used, so an import never makes a name less specific. `noiseWords` are till clutter that never
     * counts as a descriptive word ("pkt", "new").
     */
    keepTillWords: z.boolean().default(true),
    noiseWords: z.array(z.string()).default([]),
    /** Owner decision (#1570): a matched product takes the clean name. */
    renameMatched: z.boolean().default(true),
    /** Move a matched product into the row's category. */
    moveMatchedToCategory: z.boolean().default(true),
    /** Attributes derived from the name: option → words that select it (first option that matches wins). */
    derivedAttributes: z
      .array(
        z
          .object({
            name: z.string().min(1),
            options: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
            /** #1573 — only rows in these categories (slug substrings); absent means every row. */
            categories: categoryScope,
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type StockImportProfile = z.infer<typeof stockImportProfileSchema>;

export function parseProfile(json: unknown): StockImportProfile {
  return stockImportProfileSchema.parse(json);
}

/**
 * #1573 — a preset is a partial profile holding only shared rules (no store columns or brands).
 */
export const stockImportPresetSchema = stockImportProfileSchema
  .pick({
    notes: true,
    spelling: true,
    synonyms: true,
    ignoreWords: true,
    formWords: true,
    conflictingForms: true,
    preserveWords: true,
    noiseWords: true,
    categoryRules: true,
    derivedAttributes: true,
  })
  .partial()
  .strict();
export type StockImportPreset = z.infer<typeof stockImportPresetSchema>;

const unique = <T>(items: T[]) => [...new Set(items)];

/** True when a category-scoped rule applies to `categorySlug` (see `categoryScope`). */
export function inCategory(scope: readonly string[] | undefined, categorySlug: string): boolean {
  if (!scope || scope.length === 0) return true;
  const slug = categorySlug.toLowerCase();
  return scope.some((part) => slug.includes(part.toLowerCase()));
}

/**
 * #1573 — merge presets UNDER a profile. Lists are joined (profile first), records are merged with
 * the profile's keys winning, category rules and derived attributes keep the profile's first (the
 * first matching rule wins, and an attribute the profile defines replaces the preset's).
 */
export function applyPresets(
  profile: StockImportProfile,
  presets: readonly StockImportPreset[],
): StockImportProfile {
  const out = { ...profile };
  // The profile's own attribute rules replace a preset's of the same name; presets may still add
  // several same-named rules for different categories.
  const own = new Set(profile.derivedAttributes.map((a) => a.name.toLowerCase()));
  for (const preset of presets) {
    out.spelling = { ...(preset.spelling ?? {}), ...out.spelling };
    out.synonyms = [...out.synonyms, ...(preset.synonyms ?? [])];
    out.ignoreWords = unique([...out.ignoreWords, ...(preset.ignoreWords ?? [])]);
    out.formWords = unique([...out.formWords, ...(preset.formWords ?? [])]);
    out.conflictingForms = [...out.conflictingForms, ...(preset.conflictingForms ?? [])];
    out.preserveWords = unique([...out.preserveWords, ...(preset.preserveWords ?? [])]);
    out.noiseWords = unique([...out.noiseWords, ...(preset.noiseWords ?? [])]);
    out.categoryRules = [...out.categoryRules, ...(preset.categoryRules ?? [])];
    out.derivedAttributes = [
      ...out.derivedAttributes,
      ...(preset.derivedAttributes ?? []).filter((a) => !own.has(a.name.toLowerCase())),
    ];
  }
  return out;
}
