import { Metadata } from "next";
import { requireVendorRole } from "@/lib/auth-rbac";
import Link from "next/link";
import { ShieldAlert, MapPin, Sparkles, TicketPercent, Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Help Centre",
};

export default async function HelpPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  const isStaff = auth.ok;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-black/90">Help Centre</h1>
        <p className="text-black/60">
          Everything you need to know about shopping, loyalty, and your data.
        </p>
      </header>

      {isStaff && (
        <section className="bg-primary/5 rounded-2xl p-6 sm:p-8 border border-primary/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">Internal Staff Resources</h2>
              <p className="text-sm text-black/70 mt-1">
                You are authenticated as store staff. The operational runbook and administrative tools are available in the Staff Panel.
              </p>
              <div className="mt-4 p-4 bg-white rounded-xl border border-primary/10">
                <h3 className="font-bold text-sm mb-2">How to access the Staff Panel:</h3>
                <ol className="list-decimal list-inside text-sm text-black/70 space-y-2">
                  <li>Click the <strong>View Switcher</strong> in the top right of the header (currently says &quot;Shopper View&quot;).</li>
                  <li>Select <strong>Staff View</strong> (or Admin View if available).</li>
                  <li>Use the navigation tabs to access Orders, Live Inventory, and the <Link href="/staff/runbook" className="font-bold text-primary hover:underline">Operational Runbook</Link>.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="w-5 h-5 text-action-tint" />
            <h2 className="font-bold text-lg">Delivery & Minimums</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              <strong>Delivery Zones:</strong> We currently deliver across Milton Keynes and surrounding local areas. Eligibility is verified at checkout using your postcode.
            </p>
            <p>
              <strong>Minimum Order:</strong> A minimum order value is required for delivery, which varies by vendor and distance. This will be clearly shown in your cart.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-lg">Loyalty Points</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              <strong>Earning Points:</strong> Every purchase earns you points automatically. Points are credited once your order is confirmed by the store.
            </p>
            <p>
              <strong>Redeeming Points:</strong> Points can be redeemed for money off your next order. They are automatically applied at checkout when you have enough points.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <TicketPercent className="w-5 h-5 text-accent" />
            <h2 className="font-bold text-lg">Discount Codes</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              <strong>How to use:</strong> Enter your promo code at checkout before payment.
            </p>
            <p>
              <strong>Limitations:</strong> Currently, only one discount code can be used per order. Discount codes cannot be stacked, but they can be used alongside your earned loyalty points.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-black/50" />
            <h2 className="font-bold text-lg">Privacy & Data Rights</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              <strong>Data Portability:</strong> If you are an account holder, you can request a machine-readable export of your data from your Account Settings page.
            </p>
            <p>
              <strong>Right to Erasure:</strong> You can permanently delete your account and anonymize your historical order data via your Account Settings. Guest shoppers can also request erasure using their order details.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
