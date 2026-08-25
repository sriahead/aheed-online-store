/**
 * Bundle pricing (P8.5c, #347) — pure, DB-free, unit-tested.
 *
 * A bundle has NO stored price. Its total is summed here from its constituents'
 * live `Product.basePrice`, in integer pence, every time it is read. That is the
 * whole modelling decision from `/propose`: a copied price drifts silently out
 * of date, a derived one cannot.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT COMPUTE: a saving. Nothing in the current
 * discounts engine reduces a bundle's charge — `DiscountCode.code` is required
 * and `lib/discounts.ts` normalises a code on both the create and lookup paths,
 * so there is no codeless-discount path at all. That mechanism is P8.5d (#348),
 * and until it exists the storefront shows this total and makes no savings
 * claim. Adding a `savingsPence` here would produce a number the checkout does
 * not honour.
 */

/** One constituent, as the repository hands it over. */
export interface BundleItemInput {
  productId: string;
  slug: string;
  name: string;
  unitLabel: string;
  /** Pence. `Product.basePrice`. */
  basePrice: number;
  /** `Product.originalPrice` — the product's OWN pre-discount price when it is on
   *  offer independently of any bundle.
   *
   *  Carried on the type but DELIBERATELY NOT USED in any calculation here: a
   *  bundle's total sums what the cart will actually charge (`basePrice`), and
   *  summing `originalPrice` instead would inflate the total above the real one.
   *  `BundleCard` doesn't render it either — see its own note on why the
   *  constituent list carries no prices. It stays on the type because the
   *  repository selects it as part of the product row and dropping it would make
   *  a future price-aware surface re-query for it. */
  originalPrice: number | null;
  quantity: number;
  isActive: boolean;
  /** Normalised stock count; 0 when there is no `Inventory` row. */
  stockQuantity: number;
}

/** A constituent that can actually be added right now, with its line total. */
export interface AvailableBundleItem extends BundleItemInput {
  /** `basePrice * quantity`, pence. */
  linePence: number;
}

/**
 * An item counts as available when its product is active AND has stock. Both
 * conditions matter: `isActive` is the vendor's catalogue decision,
 * `stockQuantity` is the warehouse's, and `addCartItems` filters on stock alone
 * (lib/repositories/cart.ts) — so checking only one here would let the rendered
 * total disagree with what the add action actually puts in the cart.
 */
export function isBundleItemAvailable(item: BundleItemInput): boolean {
  return item.isActive && item.stockQuantity > 0;
}

/**
 * The constituents a shopper can actually buy, in the bundle's curated order,
 * each carrying its line total.
 *
 * Unavailable items are dropped rather than rendered greyed out: the bundle is a
 * convenience, and a list that shows something unbuyable invites a click that
 * silently does nothing. What the shopper sees is what "Add all" will add.
 */
export function availableBundleItems(items: readonly BundleItemInput[]): AvailableBundleItem[] {
  return items
    .filter(isBundleItemAvailable)
    .map((item) => ({ ...item, linePence: item.basePrice * item.quantity }));
}

/**
 * Total pence for the available constituents.
 *
 * Integer arithmetic end to end — every input is already pence (CLAUDE.md's
 * money rule), and multiplying and summing integers stays exact, so nothing here
 * rounds and nothing here can produce a fractional penny.
 */
export function bundleTotalPence(items: readonly BundleItemInput[]): number {
  return availableBundleItems(items).reduce((total, item) => total + item.linePence, 0);
}

/**
 * A bundle is renderable when at least one constituent is available. A bundle
 * whose every product went out of stock renders nowhere rather than as an empty
 * card with a £0.00 total.
 */
export function hasAvailableItems(items: readonly BundleItemInput[]): boolean {
  return items.some(isBundleItemAvailable);
}
