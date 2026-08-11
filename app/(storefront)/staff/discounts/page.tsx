import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getDiscountRepository } from "@/lib/repositories/discounts";
import { DiscountCodesPanel } from "@/components/staff/DiscountCodesPanel";

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
 */
export default async function StaffDiscountsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-primary">Store admins only</h1>
        <p className="mt-3 text-primary/70">
          You&apos;re signed in, but your account doesn&apos;t have permission to manage this
          store&apos;s discount codes.
        </p>
      </main>
    );
  }

  const codes = await getDiscountRepository().list();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Discount codes</h1>
      <p className="mb-6 text-sm text-primary/60">
        Codes apply to future orders only. A code can be deactivated but not edited — orders that
        already used it keep the discount they were given.
      </p>
      <DiscountCodesPanel codes={codes} />
    </main>
  );
}
