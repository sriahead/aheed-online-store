import { MapPin, Sparkles, CheckCircle2, Truck, ShieldCheck, HeartHandshake } from "lucide-react";
import { getCategoryRepository } from "@/lib/repositories/categories";
import { getProductRepository } from "@/lib/repositories/products";
import { getEnv } from "@/lib/config";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { ProductRow } from "@/components/product/ProductRow";
import { isDeliverable } from "@/lib/delivery";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: profile?.tagline ? `${name} — ${profile.tagline}` : name };
}

type SearchParams = { postcode?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { postcode } = await searchParams;
  const productsRepo = getProductRepository();
  const [categories, profile, newArrivalsPage, dealsPage] = await Promise.all([
    getCategoryRepository().listTopLevel(),
    getCurrentVendorProfile(),
    productsRepo.search("", { take: 4 }), // recent products
    productsRepo.search("", { take: 4, isHalal: true }), // simulated deals / halal featured
  ]);
  const { CDN_BASE_URL } = getEnv();
  const localityName = profile?.localityName ?? "";
  const prefixes = profile?.deliveryPrefixes ?? [];
  const trimmedPostcode = postcode?.trim() ?? "";
  const deliverable = trimmedPostcode ? isDeliverable(trimmedPostcode, prefixes) : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      {/* Hero Brand & Banner */}
      <section className="relative rounded-3xl bg-primary text-white p-6 md:p-10 overflow-hidden shadow-xl border border-black/10">
        {/* Background glow placeholder */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-1.5 bg-black/20 border border-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Local Delivery across {localityName}
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            {profile?.tagline ?? "Fresh Produce, Halal Meat & Cultural Staples."}
          </h1>

          <p className="text-white/80 text-sm md:text-base font-normal leading-relaxed">
            Delivering fresh groceries straight to your door with our own dedicated delivery team.
          </p>

          <div className="pt-2 flex flex-wrap gap-3 text-xs font-medium text-white/90">
            <span className="flex items-center gap-1 bg-black/20 px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-action-tint" /> 100% Certified Halal Meat
            </span>
            <span className="flex items-center gap-1 bg-black/20 px-2.5 py-1 rounded-lg">
              <Truck className="w-3.5 h-3.5 text-amber-300" /> Free Delivery Over £30
            </span>
            <span className="flex items-center gap-1 bg-black/20 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-action-tint" /> Same-Day Local Dispatch
            </span>
          </div>

          <div className="pt-4">
            <form method="GET" className="flex flex-wrap items-center gap-3">
              <div className="relative flex items-center">
                <MapPin className="absolute left-3 w-4 h-4 text-black/40" />
                <input
                  type="text"
                  name="postcode"
                  defaultValue={trimmedPostcode}
                  placeholder={prefixes.length ? `e.g. ${prefixes[0]}1 1AA` : "Enter postcode"}
                  className="w-48 pl-9 pr-4 py-2.5 rounded-l-xl text-black font-semibold text-sm focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-accent text-white px-5 py-2.5 font-bold text-sm rounded-r-xl transition-colors hover:opacity-90"
                >
                  Check Area
                </button>
              </div>
              {deliverable !== null && (
                <p
                  className={`text-sm font-semibold px-2 py-1 rounded ${deliverable ? "bg-action text-white" : "bg-danger text-white"}`}
                >
                  {deliverable
                    ? `✓ We deliver to ${trimmedPostcode.toUpperCase()}`
                    : `✗ Sorry, ${localityName} ${prefixes.join("/")} only`}
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Hero Banner Accent Image */}
        <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 w-[350px] h-[280px] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 rotate-2 hover:rotate-0 transition-transform duration-500">
          <img
            src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80"
            alt="Fresh Produce"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* Trust Values Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-action-tint text-primary flex items-center justify-center font-bold shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">Freshness</h4>
            <p className="text-[11px] text-black/50 leading-tight">Every day, fresh produce</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-danger-tint text-danger flex items-center justify-center font-bold shrink-0">
            <ShieldCheck className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Halal Quality
            </h4>
            <p className="text-[11px] text-black/50 leading-tight">Certified fresh meats</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent flex items-center justify-center font-bold shrink-0">
            <HeartHandshake className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Community Trust
            </h4>
            <p className="text-[11px] text-black/50 leading-tight">Serving local families</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold shrink-0">
            <Truck className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Local Delivery
            </h4>
            <p className="text-[11px] text-black/50 leading-tight">Self-delivered with care</p>
          </div>
        </div>
      </section>

      {/* Store Categories Nav */}
      <section className="bg-white rounded-2xl border border-black/10 p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-primary">Shop by department</h2>
        <DepartmentScroller categories={categories} />
      </section>

      {/* Product Discovery Rows */}
      <ProductRow
        title="New Arrivals"
        products={newArrivalsPage.items}
        cdnBaseUrl={CDN_BASE_URL ?? ""}
        viewAllLink="/search"
      />
      <ProductRow
        title="Featured Halal Deals"
        products={dealsPage.items}
        cdnBaseUrl={CDN_BASE_URL ?? ""}
        viewAllLink="/search?isHalal=true"
      />
    </main>
  );
}
