import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getDeliveryAreaRepository } from "@/lib/delivery-areas-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { AddDeliveryAreaForm, DeliveryAreaRowForm } from "@/components/staff/DeliveryAreaManager";

// Reads the session and this vendor's delivery areas — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Delivery areas" };

/**
 * Delivery-area management (P9.2, #612).
 *
 * These rows are a hard checkout gate — `features/checkout/place-order.ts` refuses an order outright
 * when no prefix matches the shopper's postcode — and until this page existed their only writer
 * anywhere in the repository was `prisma/seed.ts`. Changing where the shop delivers therefore
 * required a developer with production database access, which is why this sits in P9.2 as an
 * operability gap rather than in P10 as a convenience.
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

  const areas = await getDeliveryAreaRepository().list();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-primary">
        <Truck className="h-5 w-5" aria-hidden="true" />
        Delivery areas
      </h1>
      <p className="mb-6 text-sm text-primary-muted">
        The postcode areas this store delivers to. A customer whose postcode falls outside every
        area listed here cannot complete checkout, so keep this list current before turning away an
        order.
      </p>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-primary">Add an area</h2>
        <AddDeliveryAreaForm />
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
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
              <DeliveryAreaRowForm key={area.id} area={area} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
