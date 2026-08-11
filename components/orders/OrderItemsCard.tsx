import { formatPrice } from "@/components/product/format-price";

/**
 * An order's purchased lines and money breakdown (P4a, #122).
 *
 * Extracted from the P3b confirmation page so /checkout/{orderNumber} and
 * /account/orders/{orderNumber} render one implementation rather than two
 * copies of the totals markup. The figures are order SNAPSHOTS — never
 * recomputed here from live product prices.
 */
export interface OrderItemLine {
  productName: string;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export function OrderItemsCard({
  items,
  subtotalPence,
  discountPence = 0,
  deliveryFeePence,
  totalPence,
}: {
  items: OrderItemLine[];
  subtotalPence: number;
  /**
   * P5a (#135) — rendered only when non-zero, so a pre-P5a order looks unchanged.
   * Since P5b (#145) this can be a loyalty redemption, a discount code, or both
   * combined into one figure — never labelled as loyalty-specific below.
   */
  discountPence?: number;
  deliveryFeePence: number;
  totalPence: number;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Your items</h2>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 text-primary/80">
              {item.quantity} × {item.productName}
              <span className="ml-1 text-xs text-primary/50">
                ({formatPrice(item.unitPricePence)} each)
              </span>
            </span>
            <span className="shrink-0 font-medium text-primary">
              {formatPrice(item.lineTotalPence)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 border-t border-black/10 pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-primary/70">Subtotal</dt>
          <dd className="font-medium text-primary">{formatPrice(subtotalPence)}</dd>
        </div>
        {discountPence > 0 && (
          <div className="flex justify-between">
            <dt className="text-primary/70">Discount</dt>
            <dd className="font-medium text-action">−{formatPrice(discountPence)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-primary/70">Delivery</dt>
          <dd className="font-medium text-primary">
            {deliveryFeePence === 0 ? "FREE" : formatPrice(deliveryFeePence)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-black/10 pt-2 text-base font-bold">
          <dt className="text-primary">Total</dt>
          <dd className="text-primary">{formatPrice(totalPence)}</dd>
        </div>
      </dl>
    </section>
  );
}
