import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { FaqManager } from "@/components/staff/FaqManager";
import { getVendorFaqRepository } from "@/lib/vendor-faqs-service";

export const dynamic = "force-dynamic";

/**
 * The approved-answer editor (P10, #1012) — where a vendor writes the answers its Help Centre
 * shows, and the corpus every later answering surface reads from.
 *
 * `("ADMIN")`, not `("STAFF", "ADMIN")`: an answer published under the store's name is a claim the
 * store is making, which puts it on the storefront-settings side of the split #737 drew rather
 * than with day-to-day operations. `tests/staff-nav-parity.test.ts` derives the expected nav tier
 * from this gate, so the two cannot drift.
 */
export default async function FaqsAdminPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    // Never `return null` here: app/(admin)/layout.tsx renders the portal shell around whatever
    // this returns, so a bare null serves 200 with the header, the nav and an empty page —
    // indistinguishable from a loading state rather than a refusal. Enforced by
    // tests/panel-refusal-coverage.test.ts, after the same defect was fixed four separate times.
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's answers."
      />
    );
  }

  const faqs = await getVendorFaqRepository().listAll();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-extrabold text-black">Help Centre Answers</h1>
      <p className="mb-8 max-w-2xl text-sm text-black/60">
        Delivery charges, minimums, collection and loyalty are already answered on your Help Centre
        from your own settings, so you do not need to repeat them here. Add anything else shoppers
        ask you.
      </p>
      <FaqManager faqs={faqs} />
    </main>
  );
}
