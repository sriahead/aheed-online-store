import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getBindingRefusalService } from "@/lib/payment-binding-refusals-service";
import { formatPrice } from "@/components/product/format-price";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { reconcileRefusal, recoverRefusedOrder } from "@/features/payments/reconcile-refusal";

// Reads the session and this vendor's live refusal rows — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment issues" };

const LIMIT = 50;

/**
 * The stranded-order recovery worklist (#454, P9.2).
 *
 * #429 made the Stripe webhook fail closed. When it refuses a binding the order
 * stays PENDING_PAYMENT, and until this page existed the only trace was a
 * `console.error` line — the route returns 200 and nothing throws, so no
 * ErrorEvent row is written and `/staff/errors` never shows one.
 *
 * Vendor-scoped, unlike `/staff/errors`, which is platform-admin only: these are
 * this store's own orders and its own staff need to act on them, and nothing
 * here renders a stack trace or any other cross-tenant internal.
 *
 * A refusal that resolved to no vendor (`not-found` — the event named an order
 * that does not exist) appears on no vendor's list by construction, and stranded
 * no order either. Those rows are kept for forensics and read from the database
 * directly.
 */
export default async function StaffPaymentsPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    // 403 — signed in, but not staff for THIS vendor. A message, never a blank
    // shell: app/(admin)/layout.tsx renders the portal chrome around whatever
    // this returns, so `return null` would serve 200 with an empty panel.
    return (
      <PanelRefusal
        title="Staff only"
        message="This area is restricted to store staff. You're signed in, but your account doesn't have access to this store's payment issues."
      />
    );
  }

  const refusals = await getBindingRefusalService().list(LIMIT);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold text-primary">
        <ShieldAlert className="h-6 w-6 text-action" aria-hidden />
        Payment issues
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-primary/70">
        Payment events that were refused because they could not be proved to belong to the order
        they named. The expected number here is zero. A row whose order is still awaiting payment
        may mean a real customer was charged and their order never completed — check with the
        payment provider before doing anything else, and never re-send the original event.
      </p>

      {refusals.length === 0 ? (
        <p className="rounded-2xl border border-black/10 bg-white px-4 py-8 text-center text-sm text-primary/60">
          No refused payment events recorded.
        </p>
      ) : (
        <ul className="space-y-4">
          {refusals.map((refusal) => {
            const stranded = refusal.orderStatus === "PENDING_PAYMENT";
            return (
              <li
                key={refusal.id}
                className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-primary">
                    Order {refusal.orderNumber}
                    <span className="ml-2 text-sm font-normal text-primary/60">
                      {refusal.orderStatus ?? "no matching order"}
                    </span>
                  </p>
                  <p className="text-sm text-primary/60">
                    {refusal.createdAt.toLocaleString("en-GB")}
                  </p>
                </div>

                <p className="mt-1 text-sm text-primary/80">
                  Refused as <span className="font-medium">{refusal.reason}</span> by{" "}
                  {refusal.provider}.
                  {stranded
                    ? " This order is still awaiting payment."
                    : " This order is no longer awaiting payment."}
                </p>

                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-primary">Claimed by the event</dt>
                    <dd className="text-primary/70 break-all">
                      {refusal.claimedProviderReference ?? "no session id"}
                      {refusal.claimedAmountPence !== null && (
                        <> · {formatPrice(refusal.claimedAmountPence)}</>
                      )}
                      {refusal.claimedCurrency && <> · {refusal.claimedCurrency}</>}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-primary">Stored on the order</dt>
                    <dd className="text-primary/70 break-all">
                      {refusal.storedProviderReference ?? "no session id"}
                      {refusal.storedAmountPence !== null && (
                        <> · {formatPrice(refusal.storedAmountPence)}</>
                      )}
                      {refusal.storedCurrency && <> · {refusal.storedCurrency}</>}
                    </dd>
                  </div>
                </dl>

                {refusal.resolution && (
                  <p className="mt-4 rounded-xl bg-surface-muted px-3 py-2 text-sm text-primary/80">
                    <span className="font-medium">{refusal.resolution}</span>
                    {refusal.resolvedAt && (
                      <span className="text-primary/60">
                        {" "}
                        · {refusal.resolvedAt.toLocaleString("en-GB")}
                      </span>
                    )}
                    {refusal.resolutionDetail && (
                      <span className="mt-1 block break-all text-primary/70">
                        {refusal.resolutionDetail}
                      </span>
                    )}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={reconcileRefusal}>
                    <input type="hidden" name="refusalId" value={refusal.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-action px-4 py-2 text-sm font-medium text-action hover:bg-action hover:text-white"
                    >
                      Check with payment provider
                    </button>
                  </form>

                  {stranded && (
                    <form action={recoverRefusedOrder}>
                      <input type="hidden" name="refusalId" value={refusal.id} />
                      <button
                        type="submit"
                        className="rounded-full bg-action px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        Confirm from provider record
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
