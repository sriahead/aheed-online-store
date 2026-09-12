"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/components/product/format-price";

export function CheckoutSummary({
  lines,
  initialTotals,
}: {
  lines: { productId: string; name: string; quantity: number; lineTotalPence: number }[];
  initialTotals: { subtotalPence: number; deliveryFeePence: number; totalPence: number };
}) {
  const [method, setMethod] = useState<"DELIVERY" | "COLLECTION">("DELIVERY");

  useEffect(() => {
    const handleMethodChanged = (e: Event) => {
      if (e instanceof CustomEvent) {
        setMethod(e.detail);
      }
    };

    // Check localStorage in case of refresh
    const saved = localStorage.getItem("aheed_checkout_details");
    if (saved) {
      try {
        const details = JSON.parse(saved);
        if (details.fulfilmentMethod) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMethod(details.fulfilmentMethod);
        }
      } catch (e) {}
    }

    window.addEventListener("fulfilment-method-changed", handleMethodChanged);
    return () => window.removeEventListener("fulfilment-method-changed", handleMethodChanged);
  }, []);

  const activeDeliveryFee = method === "COLLECTION" ? 0 : initialTotals.deliveryFeePence;
  const activeTotal = initialTotals.subtotalPence + activeDeliveryFee;

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
          <dd className="font-medium text-primary">{formatPrice(initialTotals.subtotalPence)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-primary-muted">Delivery</dt>
          <dd className="font-medium text-primary">
            {activeDeliveryFee === 0 ? "FREE" : formatPrice(activeDeliveryFee)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-black/10 pt-2 text-sm font-bold">
          <dt className="text-primary">Total</dt>
          <dd className="text-primary">{formatPrice(activeTotal)}</dd>
        </div>
      </dl>
    </aside>
  );
}
