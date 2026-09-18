"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/orders-service";
import { getShoppingListService } from "@/lib/shopping-lists-service";
import {
  defaultListName,
  linesToItems,
  normaliseListName,
  productNamesToLines,
} from "@/lib/saved-list";

/**
 * Save a past order as a reusable list (P10, #116).
 *
 * Sits beside the existing "Reorder items" control and deliberately does NOT replace it. Reorder
 * answers "the same products as last time, exactly" and puts them straight in the cart; this turns
 * a one-off repeat into a standing list that re-matches against next week's catalogue. Both are
 * useful and they answer different questions — see this slice's plan.md.
 *
 * The order is resolved through `getForUser`, which scopes by the signed-in user, so an order
 * number belonging to somebody else resolves to null and saves nothing. Nothing here re-derives
 * that check.
 */
export async function saveOrderAsList(formData: FormData): Promise<void> {
  const orderNumber = formData.get("orderNumber");
  if (typeof orderNumber !== "string" || orderNumber.length === 0) redirect("/account/orders");

  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const userId = (session.user as { id: string }).id;
  const order = await getOrderRepository().getForUser(orderNumber, userId);
  if (!order) redirect("/account/orders");

  const items = linesToItems(
    productNamesToLines(
      order.items.map((item) => ({ name: item.productName, quantity: item.quantity })),
    ),
  );
  if (items.length === 0) redirect(`/account/orders/${orderNumber}?list=empty`);

  const submitted = formData.get("name");
  const name =
    normaliseListName(typeof submitted === "string" ? submitted : "") ??
    defaultListName(new Date());

  const saved = await getShoppingListService().save(name, items);
  redirect(`/account/orders/${orderNumber}?list=${saved === null ? "capped" : "saved"}`);
}
