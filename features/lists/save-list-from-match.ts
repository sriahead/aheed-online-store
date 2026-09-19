"use server";

import { getShoppingListService } from "@/lib/shopping-lists-service";
import {
  defaultListName,
  linesToItems,
  normaliseListName,
  type SaveListState,
} from "@/lib/saved-list";
import { MAX_LINE_QUANTITY, type ParsedLine } from "@/lib/shopping-list";

/**
 * Save the list the shopper just reviewed on /shop-your-list (P10, #116).
 *
 * This action stays on the page rather than redirecting, because the shopper is mid-task: they
 * are about to add these lines to the cart, and navigating away would make them re-paste to do
 * it. That is why it is a `useActionState` action with a returned state, unlike the cart and
 * order entry points which redirect back to a page that can render a notice from its own
 * searchParams.
 *
 * ## What gets saved, and why it is these fields
 *
 * The form carries the reviewed lines back as five positional arrays, the same alignment
 * discipline `add-list-to-cart.ts` already relies on: every rendered line emits all five inputs or
 * none, so the arrays stay index-aligned. The lines carry the AI pre-pass's output where it ran
 * (`lib/list-normalisation.ts`), so what is persisted is exactly what the shopper saw and
 * approved — not a re-parse of their raw text, which would silently throw the normalisation away
 * and make the list match worse on re-open than the screen it was saved from.
 *
 * Unmatched lines are saved too, deliberately. A line this shop does not stock is the shopper's
 * own note to themselves and re-matches every week; under a product-id model it could not be
 * stored at all.
 */
export async function saveListFromMatch(
  _prev: SaveListState,
  formData: FormData,
): Promise<SaveListState> {
  const texts = formData.getAll("lineText");
  const termGroups = formData.getAll("lineTerms");
  const quantities = formData.getAll("lineQuantity");
  const measures = formData.getAll("lineMeasure");
  const brands = formData.getAll("lineBrand");

  const lines: ParsedLine[] = [];
  for (const [index, rawTerms] of termGroups.entries()) {
    const terms = (typeof rawTerms === "string" ? rawTerms : "")
      .split(/\s+/)
      .filter((term) => term.length > 0);
    if (terms.length === 0) continue; // a line that can never match is not worth a row

    const rawQuantity = quantities[index];
    const quantity = Number(typeof rawQuantity === "string" ? rawQuantity : "");
    const rawText = texts[index];
    const measure = measures[index];
    const brand = brands[index];

    lines.push({
      original: typeof rawText === "string" ? rawText : terms.join(" "),
      quantity: Number.isFinite(quantity) && quantity >= 1 ? Math.min(quantity, MAX_LINE_QUANTITY) : 1, // prettier-ignore
      terms,
      measure: typeof measure === "string" && measure.length > 0 ? measure : null,
      brand: typeof brand === "string" && brand.length > 0 ? brand : null,
    });
  }

  const items = linesToItems(lines);
  if (items.length === 0) return { outcome: "empty" };

  const submitted = formData.get("name");
  const name =
    normaliseListName(typeof submitted === "string" ? submitted : "") ??
    defaultListName(new Date());

  const saved = await getShoppingListService().save(name, items);
  // The service returns null for a signed-out shopper and for a shopper at the cap. They read
  // differently to a person, so the cheap disambiguation is which one the page can even reach:
  // the control is only rendered when signed in (R37), so null here means the cap.
  if (saved === null) return { outcome: "capped" };

  return { outcome: "saved", name };
}
