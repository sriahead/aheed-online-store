import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import { getUserId } from "@/lib/cart-identity";
import { getShoppingListService } from "@/lib/shopping-lists-service";
import { ShopYourList } from "@/components/cart/ShopYourList";
import { getProductRepository } from "@/lib/products-service";
import { MAX_EXAMPLE_NAMES } from "@/lib/shopping-list-examples";

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

/** Rows shown before the shopper has to click through to /account/lists (#806). */
const QUICK_PICK_LIMIT = 5;

export default async function ShopYourListPage() {
  // Saving a list needs an account, so the control is resolved here and passed down: ShopYourList
  // is a client component and cannot read the session, and CLAUDE.md rules out a middleware.ts or
  // proxy.ts to carry it. Matching and adding stay available to guests exactly as before (#116).
  const canSave = (await getUserId()) !== null;
  const [savedLists, examples] = await Promise.all([
    canSave ? getShoppingListService().list() : [],
    // #729 — the textarea's examples come from this vendor's own in-stock products rather than a
    // fixed grocery list; see lib/shopping-list-examples.ts.
    getProductRepository().list({ take: MAX_EXAMPLE_NAMES, inStockOnly: true }),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-primary">Shop your list</h1>
      <p className="mt-1 mb-5 text-sm text-primary-muted">
        Paste your shopping list and we&apos;ll find each item. Nothing goes in your cart until you
        say so.
      </p>

      {savedLists.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-primary">Your saved lists</h2>
          <ul className="mt-2 space-y-2">
            {savedLists.slice(0, QUICK_PICK_LIMIT).map((list) => (
              <li key={list.id} className="rounded-2xl border border-black/10 bg-surface-muted p-3">
                <Link
                  href={`/account/lists/${list.id}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-primary">
                        {list.name}
                      </span>
                      <span className="block text-xs text-primary-muted">
                        {list.itemCount} item{list.itemCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-primary-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/account/lists"
            className="mt-2 inline-block text-xs font-semibold text-primary underline"
          >
            Manage your lists →
          </Link>
        </div>
      )}

      <ShopYourList canSave={canSave} exampleNames={examples.items.map((item) => item.name)} />

      <Link href="/cart" className="mt-6 inline-block text-xs font-semibold text-primary underline">
        Back to your cart
      </Link>
    </main>
  );
}
