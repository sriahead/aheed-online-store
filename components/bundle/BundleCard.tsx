import { Package } from "lucide-react";
import { addBundleToCart } from "@/features/cart/add-bundle-to-cart";
import { formatPrice } from "@/components/product/format-price";
import { availableBundleItems, bundleTotalPence, type BundleItemInput } from "@/lib/bundle-pricing";

interface BundleCardProps {
  id: string;
  name: string;
  tagline: string | null;
  imageKey: string | null;
  altText: string | null;
  items: BundleItemInput[];
  cdnBaseUrl: string;
}

/**
 * One curated bundle (P8.5c, #347).
 *
 * THERE IS EXACTLY ONE PRICE ON THIS CARD: the derived total, summed from the
 * constituents' live `basePrice` every render. No struck-through bundle price,
 * no "Save £X", no comparison against anything — because nothing in the current
 * discounts engine actually reduces what this bundle charges. That mechanism is
 * P8.5d (#348), and until it ships, a savings figure here would be a claim the
 * checkout does not honour.
 *
 * THE CONSTITUENT LIST CARRIES NO PRICES AT ALL — quantity and name only. Two
 * reasons, and the second is the one that matters. First, requirements.md R14
 * asks for exactly one price on this card. Second, a per-constituent price row
 * is where a "Save £X" badge would naturally go, and `ProductCard` really does
 * render one for any product with `originalPrice > basePrice` (live since
 * P2.5b1). Repeated three times down a bundle card, that phrase reads as a
 * BUNDLE saving — the single thing this card must not imply while P8.5d (#348)
 * doesn't exist. Leaving prices off the lines removes the temptation entirely
 * rather than relying on wording to keep the distinction.
 *
 * The product's own offer badge is untouched everywhere it actually lives —
 * `ProductCard` in the product rows, search and the product page. Nothing
 * correct was deleted; it simply isn't repeated here.
 *
 * A form, not a client component: "Add all" is a plain progressive-enhancement
 * POST, so the whole card works with no JavaScript.
 */
export function BundleCard({
  id,
  name,
  tagline,
  imageKey,
  altText,
  items,
  cdnBaseUrl,
}: BundleCardProps) {
  const available = availableBundleItems(items);
  const totalPence = bundleTotalPence(items);

  return (
    <li className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white">
      {/* An imageless bundle is a first-class state, not a broken one — it gets
          a token-styled block, never an <img> with an empty src. */}
      {imageKey && cdnBaseUrl ? (
        <img
          src={`${cdnBaseUrl}/${imageKey}`}
          alt={altText ?? ""}
          className="aspect-4/3 w-full shrink-0 object-cover"
        />
      ) : (
        <div className="flex aspect-4/3 w-full shrink-0 items-center justify-center bg-surface-muted">
          <Package className="h-10 w-10 text-primary/30" aria-hidden />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-base font-bold text-primary">{name}</h3>
          {tagline && <p className="mt-0.5 text-xs text-primary/70">{tagline}</p>}
        </div>

        {/* Constituents carry NO price of their own — see the note above on why
            this card shows exactly one. */}
        <ul className="flex-1 space-y-1 text-xs text-primary/80">
          {available.map((item) => (
            <li key={item.productId}>
              <span className="font-semibold text-primary">{item.quantity} ×</span> {item.name}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/10 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/50">
              {available.length} {available.length === 1 ? "item" : "items"}
            </p>
            <p className="text-lg font-bold text-primary">{formatPrice(totalPence)}</p>
          </div>

          <form action={addBundleToCart}>
            <input type="hidden" name="bundleId" value={id} />
            <button
              type="submit"
              className="rounded-xl bg-action px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-action-hover"
            >
              Add all {available.length} to basket
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
