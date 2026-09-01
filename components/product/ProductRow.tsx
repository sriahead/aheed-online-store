import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "./ProductCard";
import { HorizontalScroller } from "@/components/layout/HorizontalScroller";
import type { ProductSummary } from "@/lib/repositories/products";

interface ProductRowProps {
  title: string;
  products: ProductSummary[];
  cdnBaseUrl: string;
  viewAllLink?: string;
  /**
   * P8.5a (#345) — product id -> quantity in the cart, from the page's
   * request-memoised read. Optional so a caller that has no cart context (a
   * test, a future embed) still renders; those cards simply show the add
   * control.
   */
  cartQuantities?: ReadonlyMap<string, number>;
}

export function ProductRow({
  title,
  products,
  cdnBaseUrl,
  viewAllLink,
  cartQuantities,
}: ProductRowProps) {
  if (products.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-black/10 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">{title}</h2>
        {viewAllLink && (
          <Link
            href={viewAllLink}
            className="flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/*
        #511 — a horizontal scroller rather than a wrapping grid, so this row
        carries the same affordance as the department strip. Card width lives
        here on the track's direct children, so `ProductCard` needs no width of
        its own and is unchanged.
      */}
      <HorizontalScroller
        // The row's own title, not a generic "products": `/categories` renders
        // TWO ProductRows, so a fixed label gave both an identically-named pair
        // of arrows — indistinguishable to a screen reader, and exactly the
        // ambiguity `itemLabel` exists to prevent. Caught by reading the live
        // rendered markup, not by a test.
        itemLabel={title.toLowerCase()}
        itemWidthClassName="[&>*]:w-40 [&>*]:shrink-0 sm:[&>*]:w-44 lg:[&>*]:w-52"
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            cdnBaseUrl={cdnBaseUrl}
            cartQuantity={cartQuantities?.get(product.id) ?? 0}
          />
        ))}
      </HorizontalScroller>
    </section>
  );
}
