import { MapPin } from "lucide-react";
import { getCategoryRepository } from "@/lib/repositories/categories";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { isDeliverable } from "@/lib/delivery";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm can't
// load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

// Vendor-aware title (ADR-004 slice 4). The storefront layout gates the tenant,
// so a profile resolves; fall back defensively to the platform name.
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: profile?.tagline ? `${name} — ${profile.tagline}` : name };
}

type SearchParams = { postcode?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { postcode } = await searchParams;
  const [categories, profile] = await Promise.all([
    getCategoryRepository().listTopLevel(),
    getCurrentVendorProfile(),
  ]);
  const localityName = profile?.localityName ?? "";
  const prefixes = profile?.deliveryPrefixes ?? [];

  const trimmedPostcode = postcode?.trim() ?? "";
  const deliverable = trimmedPostcode ? isDeliverable(trimmedPostcode, prefixes) : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <section className="rounded-lg bg-action-tint px-6 py-12 sm:px-12">
        <h1 className="max-w-2xl text-3xl font-bold text-primary md:text-4xl">
          {profile?.tagline ?? `Fresh groceries, delivered across ${localityName}`}
        </h1>
        <p className="mt-3 max-w-xl text-primary/80">
          Quality you can trust, delivered across {localityName}.
        </p>

        {/* Postcode deliverability checker — a plain GET form; the result renders
            here because this is a page (layouts don't receive searchParams). */}
        <form method="GET" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-primary">Check your postcode</span>
            <input
              type="text"
              name="postcode"
              defaultValue={trimmedPostcode}
              placeholder="e.g. MK9 1AA"
              aria-label="Your postcode"
              className="w-40 rounded-full border border-black/15 bg-white px-4 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-action px-5 py-2 font-semibold text-white"
          >
            Check delivery
          </button>
        </form>
        {deliverable !== null && (
          <p
            className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold ${
              deliverable ? "text-primary" : "text-danger"
            }`}
          >
            <MapPin className="h-4 w-4" aria-hidden />
            {deliverable
              ? `Great news — we deliver to ${trimmedPostcode.toUpperCase()}.`
              : `Sorry, we don't deliver to ${trimmedPostcode.toUpperCase()} yet (${localityName} ${prefixes.join("/")} postcodes only).`}
          </p>
        )}
      </section>

      {/* Department nav — horizontal, icon-led, arrow-scrolled (no scrollbar). */}
      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold text-primary">Shop by department</h2>
        <DepartmentScroller categories={categories} />
      </section>
    </main>
  );
}
