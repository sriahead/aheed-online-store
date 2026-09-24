import { matchDeliveryArea } from "@/lib/delivery";

/**
 * Per-area delivery money (#890) — pure, DB-free, and the ONE place a shopper's delivery charge,
 * minimum order and free-delivery threshold are decided.
 *
 * A vendor's `VendorConfig` holds the defaults. Any `VendorDeliveryArea` row may override each of
 * the three independently; `null` on the row means "use the default", so an outlying district can
 * charge more for delivery while inheriting the store's minimum. When an area row ("MK") and a
 * district row ("MK9") both cover a postcode, the district row's overrides apply
 * (`matchDeliveryArea`).
 *
 * `0` keeps the meaning it already has on `VendorConfig`: a £0 fee is free delivery, a £0 minimum is
 * no minimum, and a £0 threshold means free delivery is never offered — `computeTotals` and
 * `fulfilmentProgress` both already treat a threshold of `0` that way. That is the only way an area
 * can opt OUT of a store-wide free-delivery offer, which `null` (inherit) cannot express.
 *
 * Every surface that shows or charges delivery money calls this — checkout, `place-order`, the cart
 * drawer, `/cart` and the landing banner — so none of them can quote a price another will not
 * charge. `place-order` passes the delivery ADDRESS postcode; the rest pass the `delivery-postcode`
 * cookie.
 *
 * Click & Collect is outside per-area pricing: `COLLECTION` always resolves to the vendor defaults.
 */

export interface DeliveryMoneyRules {
  deliveryFeePence: number;
  minimumOrderPence: number;
  /** `null` or `0` = free delivery not offered. */
  freeDeliveryThresholdPence: number | null;
}

export interface DeliveryAreaCharges {
  prefix: string;
  deliveryFeePence: number | null;
  minimumOrderPence: number | null;
  freeDeliveryThresholdPence: number | null;
}

export interface ResolvedDeliveryRules extends DeliveryMoneyRules {
  /** The matched row's prefix, or `null` when the vendor defaults apply. */
  areaPrefix: string | null;
}

export function resolveDeliveryRules(
  vendorDefaults: DeliveryMoneyRules,
  areas: readonly DeliveryAreaCharges[],
  postcode: string | null | undefined,
  method: "DELIVERY" | "COLLECTION",
): ResolvedDeliveryRules {
  const defaults: ResolvedDeliveryRules = {
    deliveryFeePence: vendorDefaults.deliveryFeePence,
    minimumOrderPence: vendorDefaults.minimumOrderPence,
    freeDeliveryThresholdPence: vendorDefaults.freeDeliveryThresholdPence,
    areaPrefix: null,
  };
  if (method !== "DELIVERY" || !postcode) return defaults;

  const row = matchDeliveryArea(postcode, areas);
  if (!row) return defaults;

  return {
    deliveryFeePence: row.deliveryFeePence ?? vendorDefaults.deliveryFeePence,
    minimumOrderPence: row.minimumOrderPence ?? vendorDefaults.minimumOrderPence,
    freeDeliveryThresholdPence:
      row.freeDeliveryThresholdPence ?? vendorDefaults.freeDeliveryThresholdPence,
    areaPrefix: row.prefix,
  };
}

/**
 * The quote a checkout page was priced with, carried through a hidden field so `place-order` can
 * refuse rather than silently charge a different amount (#890 R23). `<fee>:<minimum>:<threshold>`
 * in pence; `threshold` is empty for `null`. Values, not the area prefix, are compared: a shopper
 * whose area carries no overrides is quoted exactly the defaults, whichever row matched.
 */
export function encodeDeliveryQuote(rules: DeliveryMoneyRules): string {
  return `${rules.deliveryFeePence}:${rules.minimumOrderPence}:${
    rules.freeDeliveryThresholdPence ?? ""
  }`;
}

/** True only when `quote` is well-formed and names exactly these three values. */
export function quoteMatches(quote: string | null | undefined, rules: DeliveryMoneyRules): boolean {
  if (typeof quote !== "string" || !/^\d+:\d+:\d*$/.test(quote)) return false;
  return quote === encodeDeliveryQuote(rules);
}
