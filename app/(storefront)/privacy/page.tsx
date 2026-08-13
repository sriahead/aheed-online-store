import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";
  return {
    title: `Privacy Policy — ${vendorName}`,
    description: `UK GDPR and PECR privacy policy explaining how ${vendorName} protects your personal data.`,
  };
}

export default async function PrivacyPage() {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-primary">
      <nav className="mb-6 text-xs text-primary/60">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="text-primary font-medium">Privacy Policy</span>
      </nav>

      <article className="prose prose-sm max-w-none space-y-6">
        <header className="border-b border-black/10 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">{vendorName} — Privacy Policy</h1>
          <p className="text-xs text-primary/60 mt-1">Last updated: August 13, 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">1. UK GDPR Compliance</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            {vendorName} is committed to protecting your personal data in accordance with the UK General
            Data Protection Regulation (UK GDPR) and the Privacy and Electronic Communications Regulations (PECR).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">2. Information We Collect</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            We collect personal information necessary to process your orders, including your name, email address,
            delivery address, phone number, and transaction history.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">3. How We Use Your Data</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Your data is used solely to process payments (via Stripe), arrange grocery fulfillment, deliver orders,
            and send order confirmations and updates. We do not sell your personal data to third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">4. Cookies and Local Storage</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            We use essential host-scoped cookies for authentication (`aheed_session`), shopping cart state
            (`aheed_cart`), and cookie preference management (`aheed_cookie_consent`).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">5. Your Data Rights</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Under UK GDPR, you have the right to access, rectify, or request deletion of your personal data.
            Contact our privacy compliance team to exercise your rights.
          </p>
        </section>
      </article>
    </main>
  );
}
