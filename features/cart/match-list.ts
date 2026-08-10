"use server";

import { getProductRepository } from "@/lib/repositories/products";
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

  const candidates = await getProductRepository().matchListTerms(distinctTerms(parsed));
  return { lines: resolveLines(parsed, candidates) };
}
