/**
 * An order's delivery address (P4a, #122).
 *
 * Extracted from the P3b confirmation page so /checkout/{orderNumber} and
 * /account/orders/{orderNumber} share one implementation. This is the per-order
 * Address SNAPSHOT, not the customer's current address — editing a saved
 * address later must never rewrite where a past order went.
 */
export interface OrderAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  notes: string | null;
}

export function OrderAddressCard({
  address,
  fulfilmentMethod = "DELIVERY",
  orderNumber,
}: {
  address: OrderAddress;
  fulfilmentMethod?: "DELIVERY" | "COLLECTION";
  orderNumber?: string;
}) {
  if (fulfilmentMethod === "COLLECTION") {
    return (
      <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-black/5 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-primary">
            Click &amp; Collect
          </h2>
          <span className="inline-flex items-center rounded-full bg-action-tint px-2.5 py-0.5 text-xs font-bold text-action">
            Customer Collection
          </span>
        </div>
        <div className="space-y-2 text-sm text-primary-muted">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-primary-muted">
              Customer Name
            </span>
            <span className="font-semibold text-primary">{address.recipientName}</span>
          </div>
          {orderNumber && (
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-primary-muted">
                Order Reference
              </span>
              <span className="font-mono font-bold text-primary">{orderNumber}</span>
            </div>
          )}
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-primary-muted">
              Contact Phone
            </span>
            <span className="text-primary">{address.phone}</span>
          </div>
          {address.notes && (
            <div className="pt-1">
              <span className="block text-xs font-semibold uppercase tracking-wider text-primary-muted">
                Collection Notes
              </span>
              <span className="text-primary">{address.notes}</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Delivering to</h2>
      <address className="text-sm not-italic leading-relaxed text-primary-muted">
        <span className="font-semibold text-primary">{address.recipientName}</span>
        <br />
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.city}
        <br />
        {address.postcode}
        <br />
        <span className="text-primary-muted">{address.phone}</span>
      </address>
      {address.notes && <p className="mt-2 text-xs text-primary-muted">Notes: {address.notes}</p>}
    </section>
  );
}
