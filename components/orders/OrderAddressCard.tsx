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

export function OrderAddressCard({ address }: { address: OrderAddress }) {
  return (
    <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Delivering to</h2>
      <address className="text-sm not-italic leading-relaxed text-primary/80">
        {address.recipientName}
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
        <span className="text-primary/60">{address.phone}</span>
      </address>
      {address.notes && <p className="mt-2 text-xs text-primary/60">Notes: {address.notes}</p>}
    </section>
  );
}
