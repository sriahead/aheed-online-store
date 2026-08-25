import Link from "next/link";
import { Minus, Plus, ShoppingBag, Sparkles, Trash2, Truck } from "lucide-react";
import { formatPrice } from "@/components/product/format-price";
import { composePublicUrl } from "@/lib/storage";
import { deliveryProgress } from "@/lib/cart-rules";
import type { CartSummary } from "@/lib/repositories/cart";
import { removeFromCart } from "@/features/cart/remove-item";
import { updateQuantity } from "@/features/cart/update-quantity";

/**
 * Server-rendered cart body (P3a, #93) — shared by the drawer and /cart so both
 * show the same data from one code path.
 *
 * Quantity and remove controls are plain <form> posts to server actions, so they
 * work without client JS; only the drawer's open/close is a client island.
 *
 * Everything vendor-specific comes from data: the free-delivery threshold and the
 * locality name are VendorConfig values, never constants (the reference mockup
 * hardcoded £30 and "Aheed"). Colours are semantic tokens.
 */
export function CartContents({
  summary,
  freeDeliveryThresholdPence,
  localityName,
  cdnBaseUrl,
  showViewCartLink = false,
}: {
  summary: CartSummary;
  freeDeliveryThresholdPence: number | null;
  localityName: string;
  cdnBaseUrl: string;
  showViewCartLink?: boolean;
}) {
  const progress = deliveryProgress(summary.subtotalPence, freeDeliveryThresholdPence);

  return (
    <>
      {/* Delivery incentive — omitted entirely when the vendor offers no free delivery. */}
      {progress.kind !== "none" && (
        <div className="border-b border-black/5 bg-action-tint p-3 text-xs text-primary">
          {progress.kind === "remaining" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 font-medium">
                <Truck className="h-4 w-4 text-primary" aria-hidden />
                Add {formatPrice(progress.remainingPence)} for FREE Local Delivery
              </span>
              <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-black/10">
                <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1 font-bold text-primary">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
              You unlocked FREE Local Delivery
              {localityName ? ` to ${localityName}` : ""}!
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {summary.lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <ShoppingBag className="mb-3 h-16 w-16 text-primary/20" aria-hidden />
            <h3 className="text-sm font-bold text-primary">Your cart is empty</h3>
            <p className="mt-1 max-w-xs text-xs text-primary/60">
              Browse the aisles and add something you fancy.
            </p>
            <Link
              href="/categories"
              className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          summary.lines.map((line) => (
            <div
              key={line.productId}
              className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3"
            >
              {line.imageKey && cdnBaseUrl ? (
                // Plain <img> by decision, not omission — #46 settled at P7d (#218):
                // Image Transformations aren't enabled on this zone, so a next/image
                // loader would ship identical bytes. Rule is off in eslint.config.mjs.
                <img
                  src={composePublicUrl(cdnBaseUrl, line.imageKey)}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl border border-black/5 bg-surface-muted object-cover"
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-xl bg-surface-muted" />
              )}

              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${line.slug}`}
                  className="block truncate text-xs font-semibold text-primary hover:underline"
                >
                  {line.name}
                </Link>
                <p className="mt-0.5 text-[11px] text-primary/60">
                  {formatPrice(line.unitPricePence)} · {line.unitLabel}
                </p>

                {!line.available && (
                  <p className="mt-1 text-[11px] font-semibold text-danger">
                    Unavailable — not included in the subtotal
                  </p>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-black/10 bg-surface-muted">
                    <form
                      action={async () => {
                        "use server";
                        await updateQuantity(line.productId, line.quantity - 1);
                      }}
                    >
                      <button
                        type="submit"
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="p-1 text-primary/70 hover:text-primary"
                      >
                        <Minus className="h-3 w-3" aria-hidden />
                      </button>
                    </form>
                    <span className="px-2 text-xs font-bold text-primary">{line.quantity}</span>
                    <form
                      action={async () => {
                        "use server";
                        await updateQuantity(line.productId, line.quantity + 1);
                      }}
                    >
                      <button
                        type="submit"
                        disabled={!line.available || line.quantity >= line.stock}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="p-1 text-primary/70 hover:text-primary disabled:opacity-30"
                      >
                        <Plus className="h-3 w-3" aria-hidden />
                      </button>
                    </form>
                  </div>

                  <form
                    action={async () => {
                      "use server";
                      await removeFromCart(line.productId);
                    }}
                  >
                    <button
                      type="submit"
                      aria-label={`Remove ${line.name}`}
                      className="p-1 text-primary/40 transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </form>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span
                  className={`text-sm font-extrabold ${line.available ? "text-primary" : "text-primary/30 line-through"}`}
                >
                  {formatPrice(line.lineTotalPence)}
                </span>
                {/* P8.5d (#348) — the multi-buy saving this line actually earned.
                    Only shown when it is non-zero and the line is still payable:
                    an unavailable line contributes nothing to the subtotal, so
                    advertising a saving on it would be a claim about money the
                    shopper is not being charged. */}
                {line.available && line.tierSavingPence > 0 && (
                  <span className="text-[11px] font-semibold text-action">
                    Saving {formatPrice(line.tierSavingPence)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {summary.lines.length > 0 && (
        <div className="space-y-3 border-t border-black/10 bg-surface-muted p-4">
          <div className="flex justify-between text-sm">
            <span className="text-primary/70">Subtotal</span>
            <span className="font-bold text-primary">{formatPrice(summary.subtotalPence)}</span>
          </div>
          {/* The cart deliberately stops at a subtotal — delivery fee and total are
              computed at checkout (P3b) so the two can never disagree. */}
          <Link
            href="/checkout"
            className="flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white"
          >
            Proceed to checkout
          </Link>
          {showViewCartLink && (
            <Link
              href="/cart"
              className="flex w-full items-center justify-center rounded-2xl border border-primary/20 px-4 py-2.5 text-sm font-bold text-primary"
            >
              View full cart
            </Link>
          )}
        </div>
      )}
    </>
  );
}
