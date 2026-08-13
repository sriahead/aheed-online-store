import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Metadata {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";
  return {
    title: `Terms of Service — ${vendorName}`,
    description: `Terms and conditions governing orders, delivery, pricing, and services at ${vendorName}.`,
  };
}

export default async function TermsPage() {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-primary">
      <nav className="mb-6 text-xs text-primary/60">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="text-primary font-medium">Terms of Service</span>
      </nav>

      <article className="prose prose-sm max-w-none space-y-6">
        <header className="border-b border-black/10 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">{vendorName} — Terms of Service</h1>
          <p className="text-xs text-primary/60 mt-1">Last updated: August 13, 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">1. Overview</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Welcome to {vendorName}. These terms and conditions govern your use of our website,
            catalogue browsing, cart reservation, checkout, and home delivery services within our
            supported delivery areas.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">2. Pricing and Availability</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            All prices displayed on our website are in Pound Sterling (GBP) inclusive of applicable
            VAT. Product availability is updated dynamically. In the unlikely event an item becomes
            unavailable after order placement, we will issue a full refund for the unavailable item.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">3. Delivery Terms</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Deliveries are made to supported postcode areas. Minimum order values and delivery fees
            apply as stated at checkout. You must ensure someone is available at the delivery address to receive your order.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">4. Order Cancellations & Refunds</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Orders can be cancelled before picking commences by contacting customer support. For fresh
            or perishable grocery items, cancellations after processing are subject to verification under UK Consumer Rights Law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">5. Governing Law</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            These terms are governed by and construed in accordance with the laws of England and Wales.
          </p>
        </section>
      </article>
    </main>
  );
}
