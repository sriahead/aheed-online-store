import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getAbandonedCheckoutsPage } from "@/lib/abandoned-checkouts-service";
import { ABANDONED_LIST_DAYS, REMINDER_WINDOW_DAYS } from "@/lib/abandoned-checkout/eligibility";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { AbandonedCheckoutList } from "./AbandonedCheckoutList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Abandoned checkouts" };

/**
 * #1554 — checkouts that expired before payment, and the one recovery reminder an admin may send for
 * each (opted-in customers only, within the reminder window). Admin tier, like Customers.
 */
export default async function AbandonedCheckoutsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Admins only"
        message="Abandoned checkouts and recovery emails are restricted to store admins."
      />
    );
  }

  const { rows, codes } = await getAbandonedCheckoutsPage(auth.vendorId);
  const sendable = rows.filter((r) => r.blockedReason === null).length;

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Abandoned checkouts</h1>
          <p className="mt-1 max-w-3xl text-sm text-primary-muted">
            Checkouts from the last {ABANDONED_LIST_DAYS} days that expired before payment. You can
            send one reminder email per checkout, within {REMINDER_WINDOW_DAYS} days, to signed-in
            customers who have agreed to marketing emails. Guests and customers who have not opted
            in are listed but cannot be emailed.
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm shadow-sm">
          <span className="font-bold text-primary">{sendable}</span>{" "}
          <span className="text-primary-muted">can be reminded</span> ·{" "}
          <span className="font-bold text-primary">{rows.length}</span>{" "}
          <span className="text-primary-muted">total</span>
        </div>
      </div>

      <AbandonedCheckoutList rows={rows} codes={codes} />
    </PageContainer>
  );
}
