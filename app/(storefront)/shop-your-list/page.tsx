import type { Metadata } from "next";
import Link from "next/link";
import { ShopYourList } from "@/components/cart/ShopYourList";

/**
 * "Shop your list" (P3d, #114) — the second way to fill a cart, alongside
 * clicking Add to Cart on a product card.
 *
 * force-dynamic for the same reason as /search and /categories: the storefront
 * layout resolves the vendor through Prisma, which next build's Node-based
 * static prerendering cannot load (@prisma/client/wasm).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shop your list" };

export default function ShopYourListPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-primary">Shop your list</h1>
      <p className="mt-1 mb-5 text-sm text-primary/60">
        Paste your shopping list and we&apos;ll find each item. Nothing goes in your cart until you
        say so.
      </p>

      <ShopYourList />

      <Link href="/cart" className="mt-6 inline-block text-xs font-semibold text-primary underline">
        Back to your cart
      </Link>
    </main>
  );
}
