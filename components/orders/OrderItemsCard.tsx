import { formatPrice } from "@/components/product/format-price";
import { splitDiscount, type OrderDiscountCode } from "@/lib/order-totals";

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
  discountCode = null,
  deliveryFeePence,
  totalPence,
}: {
  items: OrderItemLine[];
  subtotalPence: number;
  /**
   * P5a (#135) — rendered only when non-zero, so a pre-P5a order looks unchanged.
   * Since P5b (#145) this can be a loyalty redemption, a discount code, or both
   * combined into one figure, which is why P7.5b (#150) splits it below rather
   * than labelling the whole amount with one source's name.
   */
  discountPence?: number;
  /**
   * P7.5b (#150) — the code applied, with its own share of `discountPence`.
   * Null means no code was used, which (given `placeOrder` is the only writer of
   * `discountPence`) means any discount present is a loyalty redemption.
   */
  discountCode?: OrderDiscountCode | null;
  deliveryFeePence: number;
  totalPence: number;
}) {
  const { codePence, loyaltyPence } = splitDiscount({ discountPence, discountCode });
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
        {/* Each source gets its own row and its own amount (P7.5b, #150). The two
            always sum to `discountPence` — see splitDiscount — so the money block
            still reconciles line by line. */}
        {codePence > 0 && discountCode && (
          <div className="flex justify-between">
            <dt className="text-primary/70">
              Code <span className="font-semibold text-primary">{discountCode.code}</span>
            </dt>
            <dd className="font-medium text-action">−{formatPrice(codePence)}</dd>
          </div>
        )}
        {loyaltyPence > 0 && (
          <div className="flex justify-between">
            <dt className="text-primary/70">Loyalty points</dt>
            <dd className="font-medium text-action">−{formatPrice(loyaltyPence)}</dd>
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
