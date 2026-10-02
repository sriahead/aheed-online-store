import type { ReactNode } from "react";
import { productGridClassName, type ProductGridDensity } from "@/lib/product-grid-density";

/**
 * The one grid every product listing renders through (#962): category, search and bundles. Before
 * it, each page hardcoded its own 2 / 3 / 4-column class string. The three copies could drift, and
 * the odd 3-column step left a short page as 3 + 3 + 2.
 *
 * Columns come from the vendor's `productGridDensity` preset (`lib/product-grid-density.ts`), never
 * from a class written at the call site. `as="ul"` is for bundles, whose cards are `<li>`s.
 * `data-product-grid` is a stable hook for `scripts/verify-mobile-layout.ts`.
 */
export function ProductGrid({
  density,
  as = "div",
  children,
}: {
  density: ProductGridDensity;
  as?: "div" | "ul";
  children: ReactNode;
}) {
  const Element = as;
  return (
    <Element data-product-grid="" className={productGridClassName(density)}>
      {children}
    </Element>
  );
}
