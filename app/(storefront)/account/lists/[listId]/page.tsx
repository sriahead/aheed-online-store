import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getProductRepository } from "@/lib/products-service";
import { getShoppingListService } from "@/lib/shopping-lists-service";
import { itemsToLines } from "@/lib/saved-list";
import { distinctTerms, resolveLines } from "@/lib/shopping-list";
import { ListReview } from "@/components/cart/ListReview";

/**
 * Open a saved list against today's catalogue (P10, #116).
 *
 * ## No AI call is on this path, by construction
 *
 * The AI pre-pass in `lib/list-normalisation.ts` rewrites a shopper's WORDS, and it already ran
 * once — at save time, on /shop-your-list — with its output persisted in `ShoppingListItem.terms`.
 * Re-running it here would pay for the model on every open to recompute something already stored,
 * and would spend the shopper's rate-limit budget doing it. So this page deliberately imports
 * neither `features/cart/match-list.ts` nor `lib/list-normalisation.ts`: it goes straight to the
 * deterministic half, which is the only half that depends on the catalogue.
 *
 * That leaves exactly one query for the whole list, the same `matchListTerms` pass a pasted list
 * gets — a 100-line saved list is not 100 queries.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your list" };

export default async function SavedListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;

  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  // Scoped by vendor and user inside the repository, so a list belonging to somebody else is
  // indistinguishable from one that never existed.
  const list = await getShoppingListService().find(listId);
  if (!list) notFound();

  const lines = itemsToLines(list.items);
  const repo = getProductRepository();
  // Same pairing as features/cart/match-list.ts: the alias map has to reach resolveLines() too,
  // not just the candidate query, or a candidate found ONLY via an alias is silently re-rejected
  // (#566, #396).
  const [candidates, aliases] = await Promise.all([
    repo.matchListTerms(distinctTerms(lines)),
    repo.synonymAliasMap(),
  ]);
  const resolved = resolveLines(lines, candidates, aliases);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link
        href="/account/lists"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary-muted hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Your lists
      </Link>

      <h1 className="text-xl font-bold text-primary">{list.name}</h1>
      <p className="mt-1 mb-5 text-sm text-primary-muted">
        Matched against what we have in today. Nothing goes in your cart until you say so.
      </p>

      {resolved.length === 0 ? (
        <p className="rounded-2xl border border-black/10 bg-surface-muted p-5 text-sm text-primary-muted">
          This list has nothing in it.
        </p>
      ) : (
        <ListReview lines={resolved} />
      )}
    </main>
  );
}
