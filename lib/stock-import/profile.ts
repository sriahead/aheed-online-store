import { z } from "zod";

/**
 * #1570 R2 — everything store-specific about a stock spreadsheet, so no store's brands, spellings or
 * categories live in code. `scripts/stock-import/profiles/_template.json` documents every key.
 *
 * A column is named by its header text (case-insensitive) or by its letter ("A", "B", …) when the
 * sheet has no header row.
 */

const column = z.string().min(1);

const FLAG_KEYS = ["isHalal", "isVegetarian", "isOrganic", "isGlutenFree", "isFresh"] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];
export { FLAG_KEYS };

export const stockImportProfileSchema = z
  .object({
    /** Free text for the next person: where the files come from, what was decided. */
    notes: z.string().optional(),
    vendorSlug: z.string().min(1),
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
