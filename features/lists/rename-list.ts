"use server";

import { redirect } from "next/navigation";
import { getShoppingListService } from "@/lib/shopping-lists-service";
import { normaliseListName } from "@/lib/saved-list";

/**
 * Rename a saved list (P10, #116).
 *
 * A blank or whitespace-only name is ignored rather than applied: a list with no name is
 * unusable on /account/lists, and silently keeping the old one is what a person expects from
 * submitting an empty box. There is no default-name fallback here, unlike the save actions —
 * replacing the name they chose with a generated one would be worse than doing nothing.
 *
 * The service scopes the update by vendor and user, so an id belonging to somebody else renames
 * nothing. The redirect is identical either way: a caller must not be able to tell whether an id
 * they do not own exists.
 */
export async function renameList(formData: FormData): Promise<void> {
  const id = formData.get("listId");
  const submitted = formData.get("name");

  if (typeof id === "string" && id.length > 0) {
    const name = normaliseListName(typeof submitted === "string" ? submitted : "");
    if (name !== null) await getShoppingListService().rename(id, name);
  }

  redirect("/account/lists");
}
