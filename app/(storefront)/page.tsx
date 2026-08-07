import { MapPin } from "lucide-react";
import { getCategoryRepository } from "@/lib/repositories/categories";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { isDeliverable } from "@/lib/delivery";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm can't
// load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

export const metadata = { title: "Aheed Food Centre — Milton Keynes Cultural Groceries" };

type SearchParams = { postcode?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { postcode } = await searchParams;
  const categories = await getCategoryRepository().listTopLevel();

  const trimmedPostcode = postcode?.trim() ?? "";
  const deliverable = trimmedPostcode ? isDeliverable(trimmedPostcode) : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <section className="rounded-lg bg-action-tint px-6 py-12 sm:px-12">
        <h1 className="max-w-2xl text-3xl font-bold text-primary md:text-4xl">
          Fresh halal meat, produce &amp; cultural groceries — delivered across Milton Keynes
        </h1>
        <p className="mt-3 max-w-xl text-primary/80">
          100% certified HMC halal meat cut daily, alongside the staples, spices, and specialities
          Milton Keynes shops for.
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
              : `Sorry, we don't deliver to ${trimmedPostcode.toUpperCase()} yet (Milton Keynes MK postcodes only).`}
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
