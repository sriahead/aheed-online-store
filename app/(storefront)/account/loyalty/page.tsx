import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { resolveTier } from "@/lib/loyalty";
import { formatPrice } from "@/components/product/format-price";
import { formatOrderDate } from "@/lib/order-status";
import { WaysToEarnAccordion } from "@/components/rewards/WaysToEarnAccordion";
import { WaysToRedeemAccordion } from "@/components/rewards/WaysToRedeemAccordion";
import { ReferralCard } from "@/components/rewards/ReferralCard";
import { AvailableRewardsSection } from "@/components/rewards/AvailableRewardsSection";
import { getReferralStats, ensureReferralDiscountCode } from "@/lib/referrals-service";
import { buildReferralUrl } from "@/lib/referrals";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

// Reads the session and this vendor's live loyalty rows — must render per-request.
export const dynamic = "force-dynamic";

/** #729 — was a hardcoded "Loyalty & Rewards — Aheed Food Centre", which rendered under every vendor. */
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getCurrentVendorProfile();
  return { title: `Loyalty & Rewards — ${profile?.name ?? "Aheed Food Centre"}` };
}

export default async function LoyaltyPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const loyalty = getLoyaltyRepository();
  const config = await loyalty.config();

  // A vendor that doesn't run a loyalty scheme has no such page.
  if (!config.loyaltyEnabled) notFound();

  const [balance, tiers, windowSpend, ledger, referralStats, profile] = await Promise.all([
    loyalty.balance(userId, config),
    loyalty.tiers(),
    loyalty.windowSpend(userId, config.tierWindowDays),
    loyalty.ledger(userId),
    getReferralStats(userId),
    getCurrentVendorProfile(),
  ]);

  // Ensure referral discount code exists in background
  ensureReferralDiscountCode(userId).catch(() => {});

  const tier = resolveTier(tiers, windowSpend);
  const nextTier = tiers
    .filter((t) => t.thresholdPence > windowSpend)
    .sort((a, b) => a.thresholdPence - b.thresholdPence)[0];

  const maxMultiplier =
    tiers.length > 0 ? Math.max(...tiers.map((t) => t.multiplierBps)) / 10000 : 1;

  let expiryDate: string | null = null;
  if (
    config.pointsExpiryMonths &&
    balance.lastActivityAt &&
    !balance.lapsed &&
    balance.balancePoints > 0
  ) {
    const deadline = new Date(balance.lastActivityAt);
    deadline.setUTCMonth(deadline.getUTCMonth() + config.pointsExpiryMonths);
    expiryDate = deadline.toLocaleDateString("en-GB", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  const host = requestHeaders.get("host") || "localhost";
  const proto = requestHeaders.get("x-forwarded-proto") || "https";
  const baseUrl = `${proto}://${host}`;
  const referralUrl = buildReferralUrl(baseUrl, referralStats.referralCode);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Back button */}
      <Link
        href="/account"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-muted hover:text-primary transition"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to Your account</span>
      </Link>

      <h1 className="mb-1 text-2xl font-semibold text-primary">Loyalty & Rewards</h1>
      <p className="mb-6 text-sm text-primary-muted">
        Earn points on every order you pay for, unlock vouchers, and refer friends.
      </p>

      {/* Hero Points Card */}
      <section className="mb-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary-muted">
              Your points balance
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-primary">{balance.balancePoints}</span>
              <span className="text-base font-medium text-primary-muted">points</span>
            </div>
            <p className="mt-1 text-sm font-medium text-action">
              Worth {formatPrice(balance.balancePoints * config.pencePerPointRedeemed)} off your
              next order
            </p>

            {expiryDate && (
              <div className="mt-3 inline-flex items-center rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-medium text-primary">
                Expiration date: {expiryDate}
              </div>
            )}

            {!expiryDate && balance.balancePoints > 0 && (
              <div className="mt-3 inline-flex items-center rounded-lg bg-action-tint px-2.5 py-1 text-xs font-medium text-action">
                Points active · No expiration date
              </div>
            )}
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-action-tint text-action">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-black/10 pt-4 text-sm">
          <div>
            <dt className="text-primary-muted text-xs">Lifetime points earned</dt>
            <dd className="mt-0.5 font-bold text-primary">{balance.lifetimePoints}</dd>
          </div>
          <div>
            <dt className="text-primary-muted text-xs">Current tier</dt>
            <dd className="mt-0.5 font-bold text-primary">{tier ? tier.name : "Standard"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-primary-muted text-xs">Tier rate</dt>
            <dd className="mt-0.5 font-bold text-primary">
              {tier ? `${(tier.multiplierBps / 10000).toFixed(2)}× points` : "1.0× points"}
            </dd>
          </div>
        </dl>

        {balance.lapsed && (
          <p className="mt-4 rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            Your points expired after {config.pointsExpiryMonths} months without an order. Place an
            order to start earning again.
          </p>
        )}

        {nextTier && (
          <div className="mt-4 rounded-xl bg-surface-muted p-3 text-xs text-primary-muted">
            Spend {formatPrice(nextTier.thresholdPence - windowSpend)} more in the next{" "}
            {config.tierWindowDays} days to reach <strong>{nextTier.name}</strong> and earn{" "}
            {(nextTier.multiplierBps / 10000).toFixed(2)}× points.
          </div>
        )}
      </section>

      {/* Available Rewards Vouchers */}
      <section className="mb-6">
        <AvailableRewardsSection
          balancePoints={balance.balancePoints}
          pencePerPointRedeemed={config.pencePerPointRedeemed}
          minRedeemPoints={config.minRedeemPoints}
          variant="light"
        />
      </section>

      {/* Ways to Earn and Redeem in 2-column or stacked grid */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <WaysToEarnAccordion
          pointsPerPoundEarned={config.pointsPerPoundEarned}
          rewardPoints={referralStats.rewardPoints}
          maxMultiplier={maxMultiplier}
          variant="light"
        />

        <WaysToRedeemAccordion
          pencePerPointRedeemed={config.pencePerPointRedeemed}
          minRedeemPoints={config.minRedeemPoints}
          variant="light"
        />
      </section>

      {/* Referrals Section */}
      <section className="mb-6">
        <ReferralCard
          referralUrl={referralUrl}
          referralCode={referralStats.referralCode}
          completedCount={referralStats.completedCount}
          discountOffPence={referralStats.discountOffPence}
          rewardPoints={referralStats.rewardPoints}
          variant="light"
          authenticated={true}
          storeName={profile?.name ?? "Aheed Food Centre"}
        />
      </section>

      {/* Points History Ledger */}
      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">History</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-primary-muted">
            No points activity yet — your first paid order will start it off.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {ledger.map((entry, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">
                    {LEDGER_LABELS[entry.kind] ?? entry.kind}
                  </p>
                  <p className="text-xs text-primary-muted">
                    {entry.orderNumber} · {formatOrderDate(entry.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold ${
                    entry.points >= 0 ? "text-action" : "text-primary-muted"
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
