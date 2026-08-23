import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { resolveTier } from "@/lib/loyalty";
import { formatPrice } from "@/components/product/format-price";
import { formatOrderDate } from "@/lib/order-status";

// Reads the session and this vendor's live loyalty rows — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Loyalty points" };

/**
 * Customer loyalty page (P5a, #135).
 *
 * The balance shown is the VISIBLE one — zero once the account has lapsed —
 * never the stored counter, which a lapsed account deliberately leaves stale
 * until its next earn resets it. Showing the stored number here would promise
 * points the checkout guard would then refuse.
 *
 * Vendor-scoped throughout: the repository filters every query on the current
 * vendor, so a shopper who holds points at both stores sees only this one's.
 */
export default async function LoyaltyPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const loyalty = getLoyaltyRepository();
  const config = await loyalty.config();

  // A vendor that doesn't run a loyalty scheme has no such page, rather than an
  // empty one implying the feature is merely unused.
  if (!config.loyaltyEnabled) notFound();

  const [balance, tiers] = await Promise.all([loyalty.balance(userId, config), loyalty.tiers()]);
  const [windowSpend, ledger] = await Promise.all([
    loyalty.windowSpend(userId, config.tierWindowDays),
    loyalty.ledger(userId),
  ]);

  const tier = resolveTier(tiers, windowSpend);
  const nextTier = tiers
    .filter((t) => t.thresholdPence > windowSpend)
    .sort((a, b) => a.thresholdPence - b.thresholdPence)[0];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Loyalty points</h1>
      <p className="mb-6 text-sm text-primary/60">
        Earn points on every order you pay for, then spend them at checkout.
      </p>

      <section className="mb-6 rounded-2xl border border-black/10 bg-action-tint p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary/70">
              Your balance
            </p>
            <p className="mt-1 text-3xl font-extrabold text-primary">
              {balance.balancePoints}{" "}
              <span className="text-base font-medium text-primary/70">points</span>
            </p>
            <p className="mt-1 text-sm text-primary/70">
              Worth {formatPrice(balance.balancePoints * config.pencePerPointRedeemed)} off your
              next order
            </p>
          </div>
          <Sparkles className="h-8 w-8 shrink-0 text-action" aria-hidden />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-black/10 pt-4 text-sm">
          <div>
            <dt className="text-primary/60">Lifetime points earned</dt>
            <dd className="font-bold text-primary">{balance.lifetimePoints}</dd>
          </div>
          <div>
            <dt className="text-primary/60">Current tier</dt>
            <dd className="font-bold text-primary">{tier ? tier.name : "No tier yet"}</dd>
          </div>
        </dl>

        {balance.lapsed && (
          <p className="mt-4 rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            Your points expired after {config.pointsExpiryMonths} months without an order. Place an
            order to start earning again.
          </p>
        )}

        {nextTier && (
          <p className="mt-4 text-xs text-primary/70">
            Spend {formatPrice(nextTier.thresholdPence - windowSpend)} more in the next{" "}
            {config.tierWindowDays} days to reach <strong>{nextTier.name}</strong> and earn{" "}
            {(nextTier.multiplierBps / 10000).toFixed(2)}× points.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">History</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-primary/70">
            No points activity yet — your first paid order will start it off.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {ledger.map((entry, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">{LEDGER_LABELS[entry.kind]}</p>
                  <p className="text-xs text-primary/60">
                    {entry.orderNumber} · {formatOrderDate(entry.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold ${
                    entry.points >= 0 ? "text-action" : "text-primary/70"
                  }`}
                >
                  {entry.points >= 0 ? "+" : "−"}
                  {Math.abs(entry.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const LEDGER_LABELS: Record<string, string> = {
  EARN: "Earned on order",
  REDEEM: "Spent at checkout",
  REVERSAL: "Returned — order cancelled",
};
