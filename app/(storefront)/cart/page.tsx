import type { Metadata } from "next";
import Link from "next/link";
import { BookmarkPlus, ListChecks } from "lucide-react";
import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity, getUserId } from "@/lib/cart-identity";
import { saveCartAsList } from "@/features/lists/save-cart-as-list";
import { MAX_LIST_NAME_LENGTH, MAX_SAVED_LISTS } from "@/lib/saved-list";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getEnv } from "@/lib/config";
import { CartContents } from "@/components/cart/CartContents";
import { MergePrompt } from "@/components/cart/MergePrompt";
import { parseUnavailableNames } from "@/lib/bundle-notice";
import { getFulfilmentMethod } from "@/lib/fulfilment-service";

/**
 * Canonical cart URL (P3a, #93). The drawer is the primary surface, but this
 * route is what the drawer links to, where the post-sign-in merge prompt lives
 * (sign-in redirects to a URL, not to a drawer), and the no-JS fallback.
 *
 * Both surfaces render the same server data via CartContents.
 */
export const metadata: Metadata = { title: "Your cart" };

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ unavailable?: string; list?: string }>;
}) {
  const [identity, vendor, params] = await Promise.all([
    getCartIdentity(),
    getCurrentVendorProfile(),
    searchParams,
  ]);
  const summary = await getCartRepository().getSummary(identity);
  const fulfilmentMethod = await getFulfilmentMethod();
  // P10 (#116) — saving needs an account, so the control is resolved here rather than rendered
  // and then refused. Guests keep the cart exactly as it was.
  const canSaveList = (await getUserId()) !== null;
  const cdnBaseUrl = getEnv().CDN_BASE_URL ?? "";
  // P8.5c (#347): "Add all N to basket" adds what it can and names what it
  // couldn't, rather than silently delivering a partial bundle.
  const unavailable = parseUnavailableNames(params.unavailable);

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

      {unavailable.length > 0 && (
        <div
          role="status"
          className="mb-4 rounded-2xl border border-accent/30 bg-accent-tint px-4 py-3 text-sm text-primary"
        >
          <p className="font-bold">
            {unavailable.length === 1
              ? "One item from that bundle wasn't available:"
              : `${unavailable.length} items from that bundle weren't available:`}
          </p>
          <ul className="mt-1 list-disc ps-5">
            {unavailable.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="mt-1 text-primary-muted">Everything else has been added to your cart.</p>
        </div>
      )}

      {summary.mergePending && (
        <MergePrompt
          savedItemCount={summary.savedItemCount}
          guestItemCount={summary.guestItemCount}
        />
      )}

      <div className="flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white">
        <CartContents
          summary={summary}
          method={fulfilmentMethod}
          minimumOrderPence={vendor?.minimumOrderPence ?? 0}
          freeDeliveryThresholdPence={vendor?.freeDeliveryThresholdPence ?? null}
          localityName={vendor?.localityName ?? ""}
          cdnBaseUrl={cdnBaseUrl}
        />
      </div>

      {/* P10 (#116) — turn this cart into a reusable list. We save the product NAMES, not ids, so
          next week the list matches whatever is in stock under those names. */}
      {canSaveList && summary.lines.length > 0 && (
        <form action={saveCartAsList} className="mt-4 space-y-2">
          <label htmlFor="cartListName" className="block text-sm font-bold text-primary">
            Save this cart as a list
          </label>
          <div className="flex gap-2">
            <input
              id="cartListName"
              name="name"
              type="text"
              maxLength={MAX_LIST_NAME_LENGTH}
              placeholder="Weekly shop"
              className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white p-2.5 text-sm text-primary placeholder:text-primary-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
            >
              <BookmarkPlus className="h-4 w-4" aria-hidden />
              Save list
            </button>
          </div>
          {params.list === "saved" && (
            <p role="status" className="text-xs font-semibold text-primary">
              Saved — find it under Your lists.
            </p>
          )}
          {params.list === "capped" && (
            <p role="status" className="text-xs font-semibold text-danger">
              You already have {MAX_SAVED_LISTS} saved lists. Delete one to save another.
            </p>
          )}
          {params.list === "empty" && (
            <p role="status" className="text-xs font-semibold text-danger">
              There is nothing in your cart to save.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
