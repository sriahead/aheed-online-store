import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getDiscountRepository } from "@/lib/discounts-service";
import { DiscountCodesPanel } from "@/components/staff/DiscountCodesPanel";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

// Reads the session and this vendor's live codes — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Discount codes" };

/**
 * Discount codes (P5b, #145) — create, list and deactivate, on the `/staff`
 * segment P4b created and beside P5a's `/staff/loyalty`.
 *
 * ADMIN only, matching `/staff/loyalty`: creating money-off is an owner decision
 * with money attached, not a packing-floor one. The actions behind the forms
 * re-check this themselves — this gate protects the page, not the endpoints.
 *
 * The refusal branch renders `<PanelRefusal>` (#350). It hand-rolled the same
 * markup from P5b until 2026-09-08 — a deliberate P6a deferral (see that
 * component's docstring) that then outlived every record of itself: it was the
 * FOURTH instance of this defect class and the only one no list mentioned.
 * `tests/panel-refusal-coverage.test.ts` now enforces the rule mechanically, so
 * the next one fails a test rather than waiting for someone to walk the pages.
 */
export default async function StaffDiscountsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's discount codes."
      />
    );
  }

  const codes = await getDiscountRepository().list();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Discount codes</h1>
      <p className="mb-6 text-sm text-primary-muted">
        Codes apply to future orders only. A code can be deactivated but not edited — orders that
        already used it keep the discount they were given.
      </p>
      <DiscountCodesPanel codes={codes} />
    </main>
  );
}
