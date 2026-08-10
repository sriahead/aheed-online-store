import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { getCartRepository } from "@/lib/repositories/cart";
import { getCartIdentity } from "@/lib/cart-identity";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { getEnv } from "@/lib/config";
import { CartContents } from "@/components/cart/CartContents";
import { MergePrompt } from "@/components/cart/MergePrompt";

/**
 * Canonical cart URL (P3a, #93). The drawer is the primary surface, but this
 * route is what the drawer links to, where the post-sign-in merge prompt lives
 * (sign-in redirects to a URL, not to a drawer), and the no-JS fallback.
 *
 * Both surfaces render the same server data via CartContents.
 */
export const metadata: Metadata = { title: "Your cart" };

export default async function CartPage() {
  const [identity, vendor] = await Promise.all([getCartIdentity(), getCurrentVendorProfile()]);
  const summary = await getCartRepository().getSummary(identity);
  const cdnBaseUrl = getEnv().CDN_BASE_URL ?? "";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">Your cart</h1>
        {/* The other cart-entry path (P3d, #114) — discoverable without knowing the URL. */}
        <Link
          href="/shop-your-list"
          className="flex items-center gap-1.5 rounded-xl border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary"
        >
          <ListChecks className="h-4 w-4" aria-hidden />
          Shop your list
        </Link>
      </div>

      {summary.mergePending && (
        <MergePrompt
          savedItemCount={summary.savedItemCount}
          guestItemCount={summary.guestItemCount}
        />
      )}

      <div className="flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white">
        <CartContents
          summary={summary}
          freeDeliveryThresholdPence={vendor?.freeDeliveryThresholdPence ?? null}
          localityName={vendor?.localityName ?? ""}
          cdnBaseUrl={cdnBaseUrl}
        />
      </div>
    </main>
  );
}
