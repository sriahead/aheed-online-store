import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Bookmark, ClipboardList, MessageSquareQuote, ShieldCheck, Sparkles } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

export const dynamic = "force-dynamic";

/** #729 — was a hardcoded "Your account — Aheed Food Centre", which rendered under every vendor. */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  return { title: `Your account — ${profile?.name ?? "Aheed Food Centre"}` };
}

/**
 * Shopper Account Hub.
 *
 * Visually matches the Staff View / Store Admin layout (max-w-5xl, 2-column responsive
 * card grid, identical border radius, padding, typography, hover transitions, and spacing).
 *
 * Provides direct access to Orders, Lists, Loyalty & Rewards, Feedback, and Data Rights.
 */
export default async function AccountPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const { name, email, role } = session.user as { name: string; email: string; role?: string };
  const loyalty = getLoyaltyRepository();
  const config = await loyalty.config();

  let balancePoints: number | null = null;
  if (config.loyaltyEnabled) {
    try {
      const balance = await loyalty.balance(session.user.id, config);
      balancePoints = balance.balancePoints;
    } catch {
      balancePoints = null;
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Your account</h1>
      <p className="mb-6 text-sm text-primary-muted">
        Manage your orders, shopping lists, loyalty rewards, customer feedback, and personal data.
      </p>

      {/* Account Info near the top */}
      <div className="mb-6 rounded-2xl border border-black/10 bg-surface-muted p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <div>
            <span className="text-primary-muted">Name:</span>{" "}
            <strong className="text-primary">{name}</strong>
          </div>
          <div>
            <span className="text-primary-muted">Email:</span>{" "}
            <strong className="text-primary">{email}</strong>
          </div>
          <div>
            <span className="text-primary-muted">Role:</span>{" "}
            <span className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
              {role ?? "CUSTOMER"}
            </span>
          </div>
        </div>
      </div>

      {/* Responsive card grid: 2-column on desktop, single-column on mobile */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. Your orders */}
        <Link
          href="/account/orders"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block"
        >
          <ClipboardList className="mb-3 h-6 w-6 text-action" aria-hidden="true" />
          <p className="font-semibold text-primary">Your orders</p>
          <p className="mt-1 text-sm text-primary-muted">
            Track active deliveries, view order receipts, and reorder past purchases.
          </p>
        </Link>

        {/* 2. Your lists */}
        <Link
          href="/account/lists"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block"
        >
          <Bookmark className="mb-3 h-6 w-6 text-accent" aria-hidden="true" />
          <p className="font-semibold text-primary">Your lists</p>
          <p className="mt-1 text-sm text-primary-muted">
            Manage saved items, recurring shopping lists, and quick shopping.
          </p>
        </Link>

        {/* 3. Loyalty & Rewards */}
        {config.loyaltyEnabled ? (
          <Link
            href="/account/loyalty"
            className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block"
          >
            <Sparkles className="mb-3 h-6 w-6 text-accent" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-primary">Loyalty & Rewards</p>
              {balancePoints !== null && balancePoints > 0 && (
                <span className="rounded-full bg-action-tint px-2.5 py-0.5 text-xs font-bold text-action">
                  {balancePoints} pts
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-primary-muted">
              {balancePoints !== null && balancePoints > 0
                ? `${balancePoints} points available. Check ways to earn and redeem, and invite friends.`
                : "View your points balance, earning options, exclusive rewards, and referral invite link."}
            </p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white/60 p-5 opacity-60">
            <Sparkles className="mb-3 h-6 w-6 text-primary-muted" aria-hidden="true" />
            <p className="font-semibold text-primary">Loyalty & Rewards</p>
            <p className="mt-1 text-sm text-primary-muted">
              Loyalty rewards are currently not enabled for this store.
            </p>
          </div>
        )}

        {/* 4. Your feedback */}
        <Link
          href="/feedback"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block"
        >
          <MessageSquareQuote className="mb-3 h-6 w-6 text-accent" aria-hidden="true" />
          <p className="font-semibold text-primary">Your feedback</p>
          <p className="mt-1 text-sm text-primary-muted">
            Share reviews and ratings about your store experience and deliveries.
          </p>
        </Link>

        {/* 5. Your data */}
        <Link
          href="/account/data"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block"
        >
          <ShieldCheck className="mb-3 h-6 w-6 text-action" aria-hidden="true" />
          <p className="font-semibold text-primary">Your data</p>
          <p className="mt-1 text-sm text-primary-muted">
            Download an export of your account activity, correct details, or request erasure.
          </p>
        </Link>
      </div>

      {/* Log out clearly accessible below account options */}
      <div className="mt-8 border-t border-black/10 pt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
