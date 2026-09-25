import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getDeliveryAreaRepository } from "@/lib/delivery-areas-service";
import { listRecentRefusalsForCurrentVendor } from "@/lib/delivery-refusals-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import {
  AddDeliveryAreaForm,
  DeliveryAreaRowForm,
  type StoreDefaultCharges,
} from "@/components/staff/DeliveryAreaManager";

// Reads the session and this vendor's delivery areas — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Delivery areas" };

/**
 * Delivery-area management (P9.2 #612; lists, ranges and per-area charges #613/#890; turned-away
 * districts #889).
 *
 * These rows are a hard checkout gate — `features/checkout/place-order.ts` refuses a delivery order
 * outright when no row covers the shopper's postcode. A row is a postcode AREA (`MK`, every
 * district in it) or a DISTRICT (`MK9`, exactly that one); a district row beats an area row, and
 * its optional charges override the store's delivery defaults for that district.
 *
 * The turned-away table reads `DeliveryRefusalCount`: real postcodes outside the list, counted by
 * district and day only. It exists so the next district to add is chosen on evidence.
 *
 * The refusal branch renders `PanelRefusal`, never a bare null return. `app/(admin)/layout.tsx`
 * wraps whatever a page returns in the portal shell, so returning null would serve a 200 with a
 * header and a blank content area — indistinguishable from a loading state rather than a refusal.
 */
export default async function StaffDeliveryAreasPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's delivery areas."
      />
    );
  }

  const [areas, refusals, profile] = await Promise.all([
    getDeliveryAreaRepository().list(),
    listRecentRefusalsForCurrentVendor(),
    getCurrentVendorProfile(),
  ]);
  const defaults: StoreDefaultCharges = {
    deliveryFeePence: profile?.deliveryFeePence ?? 0,
    minimumOrderPence: profile?.minimumOrderPence ?? 0,
    freeDeliveryThresholdPence: profile?.freeDeliveryThresholdPence ?? null,
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-primary">
        <Truck className="h-5 w-5" aria-hidden="true" />
        Delivery areas
      </h1>
      <p className="mb-6 text-sm text-primary-muted">
        The postcode areas and districts this store delivers to. An area such as MK covers every
        district in it; a district such as MK9 covers only that one. Any area or district can have
        its own delivery charge, minimum order and free-delivery threshold — leave them blank to use
        the store&apos;s defaults. A customer whose postcode falls outside every entry here cannot
        complete a delivery order.
      </p>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-primary">Add areas or districts</h2>
        <AddDeliveryAreaForm />
      </section>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-primary">
          Currently delivering to {areas.length} {areas.length === 1 ? "area" : "areas"}
        </h2>
        {areas.length === 0 ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            No delivery areas are set, so no customer can check out. Add one above.
          </p>
        ) : (
          <ul className="mt-2">
            {areas.map((area) => (
              <DeliveryAreaRowForm key={area.id} area={area} defaults={defaults} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-primary">
          Districts you turned away (last 30 days)
        </h2>
        <p className="mb-3 text-xs text-primary-muted">
          Real postcodes outside your delivery areas, entered in the header postcode box or at
          checkout. Counted by district and day only — no customer details are kept.
        </p>
        {refusals.length === 0 ? (
          <p className="text-sm text-primary-muted">
            No out-of-area postcodes in the last 30 days.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-primary">
                <th scope="col" className="py-2 font-semibold">
                  District
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Header
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Checkout
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {refusals.map((row) => (
                <tr key={row.district} className="border-b border-black/5 last:border-b-0">
                  <th scope="row" className="py-2 font-semibold text-primary">
                    {row.district}
                  </th>
                  <td className="py-2 text-right">{row.header}</td>
                  <td className="py-2 text-right">{row.checkout}</td>
                  <td className="py-2 text-right font-semibold">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
