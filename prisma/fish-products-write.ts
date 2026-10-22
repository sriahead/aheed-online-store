import type { CatalogueWriteResult, ProductWriteInput } from "@/lib/repositories/products";
import type { FishProductChange, FishSubcategorySlug } from "./fish-products";

/**
 * #1147 — apply a `planFishProducts` plan, one product at a time, through whatever create function
 * the caller passes. The script passes `createProductForVendor` bound to its client and vendor; the
 * tests pass a fake. Taking the function as an argument is what lets the failure handling below be
 * proved without a database, the same reason `placeOrder` takes its client as a parameter.
 *
 * No Prisma import: this file decides WHAT to ask for and how to react to the answer; the
 * repository decides what a valid product is (unit-price sort key, inventory row, duplicate slug).
 */

/** Stock row figure for a new product's low-stock alert: the schema default, not a decision. */
const LOW_STOCK_THRESHOLD = 3;

export type CreateProduct = (input: ProductWriteInput) => Promise<CatalogueWriteResult>;

export interface WriteOptions {
  /** Whether the new products are visible in the shop. The script's default is false. */
  active: boolean;
  /** Opening stock for every new product. The script's default is 0. */
  stock: number;
}

export interface WriteSummary {
  /** Slugs created, in order. */
  created: string[];
  /** Slugs the repository reported as already taken (a race with another writer). */
  skipped: string[];
  /** The product the run stopped on and why, or null when it ran to the end. */
  failed: { slug: string; error: string } | null;
}

/** The repository input for one change: the change's own fields plus the three decisions made here. */
export function toProductInput(
  change: FishProductChange,
  categoryId: string,
  options: WriteOptions,
): ProductWriteInput {
  // `kind` and `subcategory` are the plan's own bookkeeping, not product fields.
  const { kind, subcategory, ...fields } = change;
  void kind;
  void subcategory;
  return {
    ...fields,
    categoryId,
    isFeatured: false,
    isActive: options.active,
    quantity: options.stock,
    // #1211 — a deliberate stock count is tracking; never the column's UNKNOWN default.
    stockMode: "TRACKED",
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    expectedRestockDay: null,
  };
}

/**
 * Create each change in order. A duplicate-slug answer is counted as skipped and the run goes on: it
 * means someone else created that slug between the plan and this write. Any other refusal, or a
 * thrown error, stops the run and is reported with the slug; what was already created stays, and
 * because the plan is idempotent a re-run picks up the rest.
 */
export async function writeFishProductChanges(
  create: CreateProduct,
  categoryIds: Partial<Record<FishSubcategorySlug, string>>,
  changes: readonly FishProductChange[],
  options: WriteOptions,
): Promise<WriteSummary> {
  const summary: WriteSummary = { created: [], skipped: [], failed: null };
  for (const change of changes) {
    const categoryId = categoryIds[change.subcategory];
    if (!categoryId) {
      summary.failed = { slug: change.slug, error: `no category id for ${change.subcategory}` };
      return summary;
    }
    try {
      const result = await create(toProductInput(change, categoryId, options));
      if (result.ok) summary.created.push(change.slug);
      else if (result.field === "slug") summary.skipped.push(change.slug);
      else {
        summary.failed = { slug: change.slug, error: result.error };
        return summary;
      }
    } catch (error) {
      summary.failed = {
        slug: change.slug,
        error: error instanceof Error ? error.message : String(error),
      };
      return summary;
    }
  }
  return summary;
}
