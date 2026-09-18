"use server";

import { redirect } from "next/navigation";
import { getShoppingListService } from "@/lib/shopping-lists-service";

/**
 * Delete a saved list (P10, #116).
 *
 * The list's items go with it through the schema's `onDelete: Cascade`. Nothing else references a
 * saved list — it holds text, never a `productId` — so no cart, order or loyalty record is
 * touched by this.
 *
 * The service scopes the delete by vendor and user, so an id belonging to somebody else deletes
 * nothing, and the redirect is identical either way so a caller cannot probe for ids that exist.
 */
export async function deleteList(formData: FormData): Promise<void> {
  const id = formData.get("listId");
  if (typeof id === "string" && id.length > 0) {
    await getShoppingListService().remove(id);
  }

  redirect("/account/lists");
}
