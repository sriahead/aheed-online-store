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
          <p className="text-xs text-primary/60 mt-1">Last updated: August 18, 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">1. UK GDPR Compliance</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            {vendorName} is committed to protecting your personal data in accordance with the UK
            General Data Protection Regulation (UK GDPR) and the Privacy and Electronic
            Communications Regulations (PECR).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">2. Information We Collect</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            We collect personal information necessary to process your orders, including your name,
            email address, delivery address, phone number, and transaction history.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">3. How We Use Your Data</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Your data is used solely to process payments (via Stripe), arrange grocery fulfillment,
            deliver orders, and send order confirmations and updates. We do not sell your personal
            data to third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">4. Cookies and Local Storage</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            We use essential host-scoped cookies for authentication (`aheed_session`), shopping cart
            state (`aheed_cart`), and cookie preference management (`aheed_cookie_consent`).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">5. How Long We Keep Your Data</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            We keep records of completed orders for <strong>six years</strong>, which is the
            retention period UK tax law requires for proof of sale. Your account details, saved
            addresses, reviews, basket and loyalty points are kept for as long as you have an
            account with us, and are removed when you ask us to erase your data.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">6. Your Data Rights</h2>
          <p className="text-sm text-primary/80 leading-relaxed">
            Under UK GDPR you have the right to access, rectify and request deletion of your
            personal data. If you have an account with us, you can exercise all three yourself from{" "}
            <Link href="/account/data" className="font-medium underline">
              your data
            </Link>{" "}
            in your account — download everything we hold about you, correct your name, or erase
            your data without needing to contact anyone.
          </p>
          <p className="text-sm text-primary/80 leading-relaxed">
            <strong>What erasure does.</strong> We remove your name, contact details, addresses,
            reviews, basket and loyalty points. We <em>keep</em> your past orders, because we are
            required to retain proof of sale — but we strip your name and address from them first,
            so the records that remain no longer identify you. If you do not shop with any of our
            other stores, your sign-in is deleted too.
          </p>
          <p className="text-sm text-primary/80 leading-relaxed">
            <strong>If you checked out as a guest.</strong> You do not need an account to exercise
            these rights. Look your order up at{" "}
            <Link href="/orders/lookup" className="font-medium underline">
              track your order
            </Link>{" "}
            using the order number and the email address you gave at checkout — that shows you
            everything we hold about the order, and lets you erase the personal details on it. We
            ask for both the order number and the email because either one on its own is not proof
            the order is yours; households often share a mailbox.
          </p>
          <p className="text-sm text-primary/80 leading-relaxed">
            Guest erasure covers <strong>one order per request</strong>. If you placed several
            orders as a guest, look each one up and erase it the same way. As above, the order
            itself is kept as an anonymised financial record with your name, address and phone
            number removed.
          </p>
          <p className="text-sm text-primary/80 leading-relaxed">
            Each of our stores holds its own records, so erasing your data here does not affect an
            account you hold with another store on this platform. Payments are processed by Stripe,
            which keeps its own transaction records under its own privacy policy; erasing your data
            here does not remove them.
          </p>
        </section>
      </article>
    </main>
  );
}
