import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listAttributesForVendor } from "@/lib/attributes-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { AddAttributeForm, AttributeCard } from "@/components/staff/AttributeManager";
import { Card } from "@/components/ui/Card";

// Reads the session and this vendor's filters — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Product filters" };

/**
 * Vendor-defined product filters (#912) — the filters a shopper can narrow this store's catalogue
 * by, beyond the platform's own (price, stock, brand, origin, pack size and the label switches on
 * /staff/storefront).
 *
 * Same role gate as /staff/brands: a filter is catalogue data, and staff maintain the catalogue.
 * The refusal branch renders <PanelRefusal>, never `return null` — the admin layout would otherwise
 * serve a 200 with a blank content area, indistinguishable from loading.
 */
export default async function StaffAttributesPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's product filters."
      />
    );
  }

  const attributes = await listAttributesForVendor(auth.vendorId);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-primary">
        <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
        Product filters
      </h1>
      <p className="mb-6 text-sm text-primary-muted">
        Filters your shoppers can narrow the catalogue by, such as Colour or Size, each with its own
        list of values. Set a product&apos;s value on its own edit page. A filter shows in the shop
        only where at least one product carries a value for it.
      </p>

      <Card as="section" className="mb-8">
        <h2 className="mb-3 text-sm font-bold text-primary">Add a filter</h2>
        <AddAttributeForm />
      </Card>

      <h2 className="mb-3 text-sm font-bold text-primary">
        {attributes.length === 0
          ? "No filters yet"
          : `${attributes.length} ${attributes.length === 1 ? "filter" : "filters"}`}
      </h2>
      {attributes.length === 0 ? (
        <p className="text-sm text-primary-muted">
          Add a filter above. Until one exists and a product carries a value for it, the shop shows
          no custom filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {attributes.map((attribute) => (
            <Card as="li" key={attribute.id}>
              <AttributeCard attribute={attribute} />
            </Card>
          ))}
        </ul>
      )}
    </main>
  );
}
