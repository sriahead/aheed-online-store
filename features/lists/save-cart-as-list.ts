"use server";

import { redirect } from "next/navigation";
import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity } from "@/lib/cart-identity";
import { getShoppingListService } from "@/lib/shopping-lists-service";
import {
  defaultListName,
  linesToItems,
  normaliseListName,
  productNamesToLines,
} from "@/lib/saved-list";

/**
 * Save the current cart as a reusable list (P10, #116).
 *
 * The text saved is each line's catalogue product NAME, not its id — the whole point of this
 * aggregate. A name re-tokenises to terms that match the very product it came from, so this loses
 * nothing today, and next week it still matches whatever the shop has under that name even if the
 * original product row is gone. No AI call is involved: the text is already catalogue vocabulary.
 *
 * Redirects back to /cart with a status rather than returning state, because /cart is a server
 * component that already reads `searchParams` for P8.5c's unavailable-items notice — reusing that
 * surface is cheaper than turning the page client-side for one confirmation line.
 */
export async function saveCartAsList(formData: FormData): Promise<void> {
  const identity = await getCartIdentity();
  const summary = await getCartRepository().getSummary(identity);

  const items = linesToItems(
    productNamesToLines(
      summary.lines.map((line) => ({ name: line.name, quantity: line.quantity })),
    ),
  );
  if (items.length === 0) redirect("/cart?list=empty");

  const submitted = formData.get("name");
  const name =
    normaliseListName(typeof submitted === "string" ? submitted : "") ??
    defaultListName(new Date());

  const saved = await getShoppingListService().save(name, items);
  redirect(saved === null ? "/cart?list=capped" : "/cart?list=saved");
}
