import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getLoyaltyRepository } from "@/lib/repositories/loyalty";
import { LoyaltyConfigForm } from "@/components/staff/LoyaltyConfigForm";

// Reads the session and this vendor's live config — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Loyalty config" };

/**
 * Loyalty configuration (P5a, #135) — the mockup's admin-only Loyalty Config
 * tab, on the `/staff` segment P4b created.
 *
 * ADMIN only, unlike `/staff/orders` which also admits STAFF: advancing an order
 * is a packing-floor action, changing the earn rate is an owner decision with
 * money attached. The action behind the form re-checks this itself — this gate
 * protects the page, not the endpoint.
 */
export default async function StaffLoyaltyPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-primary">Store admins only</h1>
        <p className="mt-3 text-primary/70">
          You&apos;re signed in, but your account doesn&apos;t have permission to change this
          store&apos;s loyalty settings.
        </p>
      </main>
    );
  }

  const loyalty = getLoyaltyRepository();
  const [config, tiers] = await Promise.all([loyalty.config(), loyalty.tiers()]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Loyalty config</h1>
      <p className="mb-6 text-sm text-primary/60">
        How this store&apos;s customers earn and spend points. Changes apply to future orders only —
        points already earned keep the rate they were earned at.
      </p>
      <LoyaltyConfigForm config={config} tiers={tiers} />
    </main>
  );
}
