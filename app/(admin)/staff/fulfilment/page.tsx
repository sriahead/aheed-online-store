import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getFulfilmentAdminRepository } from "@/lib/fulfilment-slots-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import {
  AddExpressWindowForm,
  AddFulfilmentSlotForm,
  ExpressWindowRowForm,
  FulfilmentSettingsForm,
  FulfilmentSlotRowForm,
} from "@/components/staff/FulfilmentManager";

// Reads the session and this vendor's schedule — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fulfilment scheduling" };

/**
 * Fulfilment scheduling (P10, #750).
 *
 * `#401` (delivery slots) and `#402` (express collection) shipped their Prisma models, their
 * checkout UI and their capacity logic with NO administrative surface and NO seed data. Live
 * staging carried `offerDeliverySlots: false`, `expressCollectionEnabled: false`, zero
 * `VendorFulfilmentSlot` rows and zero `VendorExpressSchedule` rows — so the delivery calendar could
 * never appear, express could never appear, and no time window could be authored by anyone. This
 * page is the missing writer, and it is the reason the `staging -> main` promotion was held.
 *
 * Structurally a copy of `/staff/delivery-areas` (#612), which fixed the identical defect shape for
 * `VendorDeliveryArea`: a per-vendor relation on the checkout path whose only writer was the seed.
 *
 * The refusal branch renders `PanelRefusal`, never a bare null return. `app/(admin)/layout.tsx`
 * wraps whatever a page returns in the portal shell, so returning null would serve a 200 with a
 * header and a blank content area — indistinguishable from a loading state rather than a refusal.
 */
export default async function StaffFulfilmentPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's fulfilment scheduling."
      />
    );
  }

  // One factory call, so the three reads share a single resolved vendor id.
  const repository = getFulfilmentAdminRepository();
  const [settings, slots, expressWindows] = await Promise.all([
    repository.settings(),
    repository.listSlots(),
    repository.listExpressWindows(),
  ]);

  const deliverySlots = slots.filter((slot) => slot.method === "DELIVERY");
  const collectionSlots = slots.filter((slot) => slot.method === "COLLECTION");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-primary">
        <CalendarClock className="h-5 w-5" aria-hidden="true" />
        Fulfilment scheduling
      </h1>
      <p className="mb-6 text-sm text-primary-muted">
        When customers can receive their orders. A customer only sees a time window that exists here
        and still has space, so an empty list means no one can choose a time at all.
      </p>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-primary">Fulfilment settings</h2>
        <FulfilmentSettingsForm settings={settings} />
      </section>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-primary">Weekly slots</h2>
        <p className="mb-4 text-xs text-primary-muted">
          Repeats every week. Capacity is the number of orders this store can fulfil in that window
          — once it is full, the slot stops being offered.
        </p>
        <AddFulfilmentSlotForm offerCollection={settings.offerCollection} />

        <h3 className="mt-6 mb-1 text-sm font-semibold text-primary">
          Delivery ({deliverySlots.length})
        </h3>
        {!settings.offerDeliverySlots && (
          <p className="mb-2 text-xs text-primary-muted">
            Delivery time slots are switched off above, so these are not offered at checkout.
          </p>
        )}
        {deliverySlots.length === 0 ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            No delivery slots are set, so no customer can choose a delivery time. Add one above.
          </p>
        ) : (
          <ul className="mt-2">
            {deliverySlots.map((slot) => (
              <FulfilmentSlotRowForm key={slot.id} slot={slot} />
            ))}
          </ul>
        )}

        {settings.offerCollection && (
          <>
            <h3 className="mt-6 mb-1 text-sm font-semibold text-primary">
              Collection ({collectionSlots.length})
            </h3>
            {collectionSlots.length === 0 ? (
              <p className="mt-2 text-sm text-primary-muted">
                No collection slots are set, so collection customers check out without choosing a
                time.
              </p>
            ) : (
              <ul className="mt-2">
                {collectionSlots.map((slot) => (
                  <FulfilmentSlotRowForm key={slot.id} slot={slot} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-primary">Express windows</h2>
        {settings.offerCollection ? (
          <>
            <p className="mb-4 text-xs text-primary-muted">
              The hours during which 60-minute express collection is offered. A customer sees it
              only while the current time falls inside one of these windows.
            </p>
            <AddExpressWindowForm />
            {expressWindows.length === 0 ? (
              <p className="mt-4 text-sm text-primary-muted">
                No express windows are set, so express collection never appears at checkout.
              </p>
            ) : (
              <ul className="mt-4">
                {expressWindows.map((expressWindow) => (
                  <ExpressWindowRowForm key={expressWindow.id} expressWindow={expressWindow} />
                ))}
              </ul>
            )}
          </>
        ) : (
          /* R15a — a control whose effect is unreachable for this vendor is explained, not offered.
             Express is gated on the collection method in SlotPicker, so with Click & Collect off it
             could never render however these windows were configured. */
          <p className="mt-2 text-sm text-primary-muted">
            Express collection windows apply only when Click &amp; Collect is switched on. Turn it
            on in <strong>Storefront</strong> under delivery rules, then set the express hours here.
          </p>
        )}
      </section>
    </main>
  );
}
