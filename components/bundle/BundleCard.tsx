import Link from "next/link";
import { addBundleToCart } from "@/features/cart/add-bundle-to-cart";
import { formatPrice } from "@/components/product/format-price";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  availableBundleItems,
  bundleRegularPence,
  bundleSavingPence,
  bundleTotalPence,
  type BundleItemInput,
} from "@/lib/bundle-pricing";
import { IconMedallion } from "@/components/icons/IconMedallion";

interface BundleCardProps {
  id: string;
  /** #1517 — the name links to `/bundles/<slug>`; omitted on that page itself. */
  slug?: string;
  linkToPage?: boolean;
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
 * THE TOTAL IS WHAT CHECKOUT CHARGES. #1517: each line is priced with the product's multi-buy tier
 * through `lib/bundle-pricing.ts`, which calls the same `tieredLineTotalPence` the cart does. When
 * the multi-buys take something off, the normal total is shown struck through with "Save £X" and the
 * button reads "Buy this offer" — a saving the checkout honours, unlike the "no saving claims" rule
 * this card was written under before tiers existed (P8.5c predates P8.5d, #348).
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
 *
 * #498 — shares `ProductCard`'s `.skew-card` treatment (`app/globals.css`)
 * rather than a plain flat card, so the bundle rail reads as the same design
 * language as every product grid on the site instead of a visually distinct
 * component bolted on beside it. The skewed element stays a `<div>`, not a `<Link>`: it holds the
 * add-to-basket form, and a form inside a link is invalid HTML. #1517 links the NAME to the bundle's
 * own page (`/bundles/<slug>`) instead.
 */
/** A bundle with no photo, or whose stored photo is missing (#655): the same box either way. */
function NoBundleImage() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted">
      <IconMedallion icon="package" size={40} decorative />
    </div>
  );
}

export function BundleCard({
  id,
  slug,
  linkToPage = true,
  name,
  tagline,
  imageKey,
  altText,
  items,
  cdnBaseUrl,
}: BundleCardProps) {
  const available = availableBundleItems(items);
  const totalPence = bundleTotalPence(items);
  const regularPence = bundleRegularPence(items);
  const savingPence = bundleSavingPence(items);

  return (
    <li className="skew-card-wrap h-full">
      <div className="skew-card group relative flex h-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white hover:border-action/50">
        {/* Image container — matches ProductCard's aspect-4/3 + skew-card-inner
            counter-skew, so an imageless bundle's placeholder block sits at
            exactly the same size and position a product photo would. */}
        <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-surface-muted">
          <div className="skew-card-inner h-full w-full">
            {imageKey && cdnBaseUrl ? (
              // #655: a missing object shows the same Package box as a bundle with no image.
              <ImageWithFallback
                src={`${cdnBaseUrl}/${imageKey}`}
                alt={altText ?? ""}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                fallback={<NoBundleImage />}
              />
            ) : (
              <NoBundleImage />
            )}
          </div>
        </div>

        <div className="skew-card-inner flex flex-1 flex-col gap-3 p-3.5">
          <div>
            <h3 className="text-sm leading-tight font-semibold text-black/90">
              {slug && linkToPage ? (
                <Link href={`/bundles/${slug}`} className="hover:text-action hover:underline">
                  {name}
                </Link>
              ) : (
                name
              )}
            </h3>
            {tagline && <p className="mt-0.5 text-xs text-black/60">{tagline}</p>}
          </div>

          {/* Constituents carry NO price of their own — see the note above on why
              this card shows exactly one. */}
          <ul className="flex-1 space-y-1 text-xs text-black/70">
            {available.map((item) => (
              <li key={item.productId}>
                <span className="font-semibold text-primary">{item.quantity} ×</span> {item.name}
              </li>
            ))}
          </ul>

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/5 pt-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                {available.length} {available.length === 1 ? "item" : "items"}
              </p>
              <p className="skew-card-price text-base font-bold text-primary">
                {formatPrice(totalPence)}
                {savingPence > 0 ? (
                  <span className="ml-1.5 text-xs font-normal text-black/60 line-through">
                    {formatPrice(regularPence)}
                  </span>
                ) : null}
              </p>
              {savingPence > 0 ? (
                <p className="text-xs font-semibold text-action">Save {formatPrice(savingPence)}</p>
              ) : null}
            </div>

            <form action={addBundleToCart}>
              <input type="hidden" name="bundleId" value={id} />
              <button
                type="submit"
                className="rounded-xl bg-action px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-action-hover"
              >
                {savingPence > 0 ? "Buy this offer" : `Add all ${available.length} to basket`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </li>
  );
}
