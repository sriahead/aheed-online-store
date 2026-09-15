import { formatPrice } from "@/components/product/format-price";
import type { OrderTotals } from "@/lib/order-totals";
import type { FulfilmentMethodChoice } from "@/lib/fulfilment-cookie";

/**
 * Order summary beside the checkout form.
 *
 * #748 — this used to be a client component that recomputed the delivery fee and
 * the total itself, from a method it learned about through a `window` CustomEvent
 * and a `localStorage` read. Three things were wrong with that: the fee row was
 * labelled "Delivery" unconditionally, so a Click & Collect order displayed
 * "Delivery FREE"; the arithmetic was a second implementation of
 * `computeTotals`, free to disagree with the figure the order was actually
 * placed at; and that second implementation ignored `discountPence` entirely, so
 * loyalty redemptions and discount codes never appeared at all.
 *
 * It is now a Server Component that renders the totals it is handed. The page
 * computes them once, through `computeTotals`, with the method resolved from the
 * shared cookie. The method arrives here only to LABEL the fee row — no money
 * decision is made in this file.
 */
export function CheckoutSummary({
  lines,
  totals,
  method,
}: {
  lines: { productId: string; name: string; quantity: number; lineTotalPence: number }[];
  totals: OrderTotals;
  method: FulfilmentMethodChoice;
}) {
  const isCollection = method === "COLLECTION";

  return (
    <aside className="h-fit rounded-2xl border border-black/10 bg-surface-muted p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Order summary</h2>
      <ul className="mb-3 space-y-2">
        {lines.map((line) => (
          <li key={line.productId} className="flex justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-primary-muted">
              {line.quantity} × {line.name}
            </span>
            <span className="shrink-0 font-medium text-primary">
              {formatPrice(line.lineTotalPence)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 border-t border-black/10 pt-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-primary-muted">Subtotal</dt>
          <dd className="font-medium text-primary">{formatPrice(totals.subtotalPence)}</dd>
        </div>

        {totals.discountPence > 0 && (
          <div className="flex justify-between">
            <dt className="text-primary-muted">Discount</dt>
            <dd className="font-medium text-action">−{formatPrice(totals.discountPence)}</dd>
          </div>
        )}

        {/*
          "FREE" is reserved for delivery the shopper actually EARNED. A
          collection order has no delivery to waive, so it reads "No charge"
          against its own label — the previous "Delivery FREE" on a Click &
          Collect order claimed a saving that was never in play.
        */}
        <div className="flex justify-between">
          <dt className="text-primary-muted">{isCollection ? "Click & Collect" : "Delivery"}</dt>
          <dd className="font-medium text-primary">
            {isCollection
              ? "No charge"
              : totals.deliveryFeePence === 0
                ? "FREE"
                : formatPrice(totals.deliveryFeePence)}
          </dd>
        </div>

        <div className="flex justify-between border-t border-black/10 pt-2 text-sm font-bold">
          <dt className="text-primary">Total</dt>
          <dd className="text-primary">{formatPrice(totals.totalPence)}</dd>
        </div>
      </dl>
    </aside>
  );
}
