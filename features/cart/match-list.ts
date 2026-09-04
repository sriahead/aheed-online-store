"use server";

import { getProductRepository } from "@/lib/products-service";
import { distinctTerms, parseList, resolveLines, type MatchListState } from "@/lib/shopping-list";

/**
 * "Shop your list" step 1 (P3d, #114): parse the pasted list and resolve every
 * line against this vendor's catalogue.
 *
 * This action deliberately WRITES NOTHING — no cart, no CartItem, no guest
 * cookie. A shopper who pastes a list and leaves still has no state, preserving
 * P3a's lazy-creation rule. The guest token is issued only by add-list-to-cart.
 *
 * MatchListState lives in lib/shopping-list.ts: a "use server" module may only
 * export async functions, so the state's empty value cannot live here.
 */

export async function matchList(
  _prev: MatchListState,
  formData: FormData,
): Promise<MatchListState> {
  const raw = formData.get("list");
  const parsed = parseList(typeof raw === "string" ? raw : "");

  if (parsed.length === 0) {
    return { lines: null, error: "Add at least one item to your list." };
  }

  const repo = getProductRepository();
  const terms = distinctTerms(parsed);
  // P2.6 slice 3 (#566, #396) — the alias map has to reach resolveLines() too, not just the
  // candidate query: matchListTerms already widens its OR with approved aliases, but the
  // per-line re-check resolveLines does afterwards is a separate, alias-blind step unless this
  // is passed through — see synonymAliasMap()'s docstring in lib/repositories/products.ts.
  const [candidates, aliases] = await Promise.all([
    repo.matchListTerms(terms),
    repo.synonymAliasMap(),
  ]);
  return { lines: resolveLines(parsed, candidates, aliases) };
}
