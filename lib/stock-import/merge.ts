import { formatPrice } from "@/components/product/format-price";
import type { CatalogueProduct } from "./match";
import type { NormalisedRow } from "./normalise";
import type { FlagKey, StockImportProfile } from "./profile";

/**
 * #1570 R10 — what an UPDATE writes to an existing product, field by field. A blank incoming field
 * never overwrites; a field staff edited by hand is kept unless the run says otherwise; a live
 * product's price is kept unless the run says otherwise. `slug`, `isActive` and `restriction` are
 * not fields this module can produce at all.
 */

export type ChangeField =
  | "name"
  | "basePrice"
  | "originalPrice"
  | "netContent"
  | "unitLabel"
  | "brandId"
  | "categoryId"
  | "plu"
  | "barcode"
  | "description"
  | "origin"
  | "vatRate"
  | FlagKey;

export interface FieldChange {
  field: ChangeField;
  from: string;
  to: string;
}

export interface KeptField {
  field: ChangeField;
  reason: string;
}

export interface MergeTargets {
  /** Resolved id of the row's brand, or null when the brand will be created. */
  brandId: string | null;
  /** Resolved id of the row's category, or null when the category will be created. */
  categoryId: string | null;
  categoryName: string;
}

export interface MergeOptions {
  overwriteEdited: boolean;
  updateLivePrices: boolean;
}

/** The staff form's field names (lib/repositories/products.ts) that a change touches. */
const EDITED_NAMES: Record<ChangeField, string[]> = {
  name: ["name"],
  basePrice: ["basePrice"],
  originalPrice: ["originalPrice"],
  netContent: ["netContentAmount", "netContentUnit"],
  unitLabel: ["unitLabel"],
  brandId: ["brandId"],
  categoryId: ["categoryId"],
  plu: ["plu"],
  barcode: ["barcode"],
  description: ["description"],
  origin: ["origin"],
  vatRate: ["vatRate"],
  isHalal: ["isHalal"],
  isVegetarian: ["isVegetarian"],
  isOrganic: ["isOrganic"],
  isGlutenFree: ["isGlutenFree"],
  isFresh: ["isFresh"],
};

const UNIT_SHORT = {
  GRAM: "g",
  KILOGRAM: "kg",
  MILLILITRE: "ml",
  LITRE: "L",
  EACH: " each",
} as const;

function sizeText(amount: number | null, unit: keyof typeof UNIT_SHORT | null): string {
  return amount === null || unit === null ? "" : `${amount}${UNIT_SHORT[unit]}`;
}

const pence = (p: number | null) => (p === null ? "" : formatPrice(p));

/**
 * `Product.unitLabel` is the price text a card shows when a product has no net content ("£7.99",
 * "£6.49 / kg") — not a size. An import keeps it in step with the price it writes, except a
 * per-unit label someone set on purpose ("£6.49 / kg"), which a pack price must not replace.
 */
export function unitLabelFor(pricePence: number): string {
  return formatPrice(pricePence);
}

export function keepsUnitLabel(label: string): boolean {
  return label.includes("/");
}

export function computeChanges(
  row: NormalisedRow,
  product: CatalogueProduct,
  targets: MergeTargets,
  profile: StockImportProfile,
  options: MergeOptions,
): { changes: FieldChange[]; kept: KeptField[] } {
  const candidates: FieldChange[] = [];
  const add = (field: ChangeField, from: string, to: string) => {
    if (to !== "" && from !== to) candidates.push({ field, from, to });
  };

  if (profile.renameMatched) add("name", product.name, row.displayName);
  add("basePrice", pence(product.basePrice), pence(row.pricePence));
  if (row.wasPricePence !== null)
    add("originalPrice", pence(product.originalPrice), pence(row.wasPricePence));
  if (row.netContent) {
    add(
      "netContent",
      sizeText(product.netContentAmount, product.netContentUnit),
      sizeText(row.netContent.amount, row.netContent.unit),
    );
  }
  if (row.pricePence !== null && !keepsUnitLabel(product.unitLabel))
    add("unitLabel", product.unitLabel, unitLabelFor(row.pricePence));
  if (row.brand && (targets.brandId === null || targets.brandId !== product.brandId)) {
    add("brandId", product.brandName ?? "", row.brand);
  }
  if (
    profile.moveMatchedToCategory &&
    (targets.categoryId === null || targets.categoryId !== product.categoryId)
  ) {
    add("categoryId", product.categoryName, targets.categoryName);
  }
  // Identifiers fill a gap; they never replace one the till already uses.
  if (row.plu && !product.plu) add("plu", "", row.plu);
  if (row.barcode && !product.barcode) add("barcode", "", row.barcode);
  if (row.description) add("description", product.description, row.description);
  if (row.origin) add("origin", product.origin ?? "", row.origin);
  if (row.vatRate !== null) add("vatRate", `${product.vatRate}%`, `${row.vatRate}%`);
  for (const [key, value] of Object.entries(row.flags) as [FlagKey, boolean][]) {
    add(key, product[key] ? "yes" : "no", value ? "yes" : "no");
  }

  const edited = new Set(product.manuallyEditedFields);
  const changes: FieldChange[] = [];
  const kept: KeptField[] = [];
  for (const change of candidates) {
    if (!options.overwriteEdited && EDITED_NAMES[change.field].some((f) => edited.has(f))) {
      kept.push({ field: change.field, reason: "edited by staff" });
    } else if (change.field === "basePrice" && product.isActive && !options.updateLivePrices) {
      kept.push({ field: change.field, reason: "product is live (use --update-live-prices)" });
    } else {
      changes.push(change);
    }
  }
  return { changes, kept };
}
