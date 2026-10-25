import { normaliseDepartment } from "@/lib/catalogue-import-policy";
import { importProfileSchema, type ImportProfile } from "./profile";
import { HEADER_SEARCH_ROWS } from "./rows";

/**
 * Canonical ADR-007 default restriction policy for storefront catalogue uploads.
 */
export const DEFAULT_ADR007_POLICY: ImportProfile["policy"] = {
  byDepartment: {
    TOBACCO: "AGE_RESTRICTED",
    CIGARETTES: "AGE_RESTRICTED",
    CIGARS: "AGE_RESTRICTED",
    ALCOHOL: "AGE_RESTRICTED",
    BEERS: "AGE_RESTRICTED",
    BEER: "AGE_RESTRICTED",
    WINES: "AGE_RESTRICTED",
    WINE: "AGE_RESTRICTED",
    SPIRITS: "AGE_RESTRICTED",
    "INSTANT LOTTERY": "PROHIBITED",
    LOTTERY: "PROHIBITED",
    "PHONE CARDS": "NOT_DELIVERABLE",
    "PHONE CARD": "NOT_DELIVERABLE",
    NEWS: "NOT_DELIVERABLE",
    NEWSPAPERS: "NOT_DELIVERABLE",
    MAGAZINES: "NOT_DELIVERABLE",
    "E-PAY": "NOT_DELIVERABLE",
    EPAY: "NOT_DELIVERABLE",
    STAMPS: "NOT_DELIVERABLE",
  },
  uncertainDepartments: ["DEFAULT", "MISC", "GENERAL", "OTHER", "UNKNOWN"],
  unrestrictedDepartments: [
    "GROCERY",
    "FOOD",
    "PRODUCE",
    "FRUIT & VEG",
    "FRUIT",
    "VEGETABLES",
    "BAKERY",
    "DAIRY",
    "MEAT",
    "POULTRY",
    "FISH",
    "SEAFOOD",
    "CHILLED",
    "FROZEN",
    "DRINKS",
    "BEVERAGES",
    "SOFT DRINKS",
    "SNACKS",
    "CONFECTIONERY",
    "HOUSEHOLD",
    "CLEANING",
    "TOILETRIES",
    "BABY",
    "PETS",
    "PET FOOD",
  ],
};

export const DEFAULT_UNIT_CONFIG: ImportProfile["unit"] = {
  pattern: "\\d+(?:\\.\\d+)?\\s?(?:kg|g|ml|cl|l|pk|pack|ltr)\\b",
  defaultLabel: "each",
};

/**
 * Standard column aliases recognized in stock spreadsheets.
 */
const COLUMN_ALIASES = {
  plu: ["plu", "code", "barcode", "item code", "product code", "sku", "id"],
  name: ["item", "name", "description", "product", "product name", "title"],
  price: ["price", "retail", "retail price", "unit price", "selling price", "amount"],
  department: ["department", "dept", "category", "group", "section"],
  subDepartment: [
    "sub department",
    "sub-department",
    "subdepartment",
    "sub dept",
    "sub-dept",
    "subcategory",
    "sub category",
  ],
  vat: ["vat", "tax", "vat rate", "vat %"],
} as const;

/**
 * Inspects leading rows of a spreadsheet grid to detect and resolve column mappings,
 * returning a valid ImportProfile configured with the ADR-007 default policy.
 */
export function resolveImportProfile(grid: readonly (readonly string[])[]): ImportProfile {
  const searchable = Math.min(grid.length, HEADER_SEARCH_ROWS);

  let bestHeaderRow: readonly string[] | null = null;
  let bestScore = -1;

  for (let i = 0; i < searchable; i += 1) {
    const row = grid[i] ?? [];
    const normalisedCells = row.map((c) => normaliseDepartment(String(c ?? "")));

    let score = 0;
    for (const aliases of Object.values(COLUMN_ALIASES)) {
      if (aliases.some((alias) => normalisedCells.includes(normaliseDepartment(alias)))) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestHeaderRow = row;
    }
  }

  // Find exact cell match for required columns
  const findRequiredHeader = (aliases: readonly string[], fallback: string): string => {
    if (!bestHeaderRow) return fallback;
    for (const cell of bestHeaderRow) {
      const normal = normaliseDepartment(String(cell ?? ""));
      if (aliases.some((alias) => normal === normaliseDepartment(alias))) {
        return String(cell).trim();
      }
    }
    return fallback;
  };

  // Find exact cell match for optional columns, returning undefined if not present in header
  const findOptionalHeader = (aliases: readonly string[]): string | undefined => {
    if (!bestHeaderRow) return undefined;
    for (const cell of bestHeaderRow) {
      const normal = normaliseDepartment(String(cell ?? ""));
      if (aliases.some((alias) => normal === normaliseDepartment(alias))) {
        return String(cell).trim();
      }
    }
    return undefined;
  };

  const subDepartment = findOptionalHeader(COLUMN_ALIASES.subDepartment);
  const vat = findOptionalHeader(COLUMN_ALIASES.vat);

  const columns: {
    plu: string;
    name: string;
    price: string;
    department: string;
    subDepartment?: string;
    vat?: string;
  } = {
    plu: findRequiredHeader(COLUMN_ALIASES.plu, "Code"),
    name: findRequiredHeader(COLUMN_ALIASES.name, "Item"),
    price: findRequiredHeader(COLUMN_ALIASES.price, "Price"),
    department: findRequiredHeader(COLUMN_ALIASES.department, "Department"),
    ...(subDepartment ? { subDepartment } : {}),
    ...(vat ? { vat } : {}),
  };

  return importProfileSchema.parse({
    columns,
    unit: DEFAULT_UNIT_CONFIG,
    policy: DEFAULT_ADR007_POLICY,
  });
}
