import type { getPrisma, getPrismaWs } from "@/lib/db";
import { MAX_SAVED_LISTS, type SavedListItemInput, type SavedListItemRow } from "@/lib/saved-list";

/**
 * Saved shopping lists (P10, #116) — the ONLY DB access for `ShoppingList` and
 * `ShoppingListItem`.
 *
 * ## Scoping
 *
 * This is domain data, so ADR-004's mandatory `vendorId` filter applies in full — and `userId`
 * alongside it, exactly as `customer-addresses.ts` does. Every export takes both explicitly and
 * every query filters on both, so a saved list can never surface to another vendor or another
 * customer even given a valid id. The guard lives in the query, not in which host served the page
 * or which route resolved the id. `ShoppingListItem` is never queried on its own: it is reached
 * only through a `ShoppingList` already so filtered.
 *
 * `userId` is required by the schema. A guest has no durable identity to own a saved record, and
 * a weekly-reuse feature is aimed squarely at a returning identified shopper — so guests keep the
 * stateless /shop-your-list path, which still writes nothing at all.
 *
 * ## Which client, and why it matters here
 *
 * `create` and `rename` take the **WebSocket** client and must. Creating a list writes N item
 * rows through a nested create, and renaming is a vendor- and user-scoped `updateMany`; both are
 * shapes Prisma's client-side query compiler wraps in a transaction that `PrismaNeonHttp` can
 * never execute, so on `getPrisma()` they crash unconditionally — even on zero rows — while every
 * local unit test with a fake client stays green (#382, CLAUDE.md). The reads and the
 * `deleteMany` are fine on the ordinary client. This is the same split `touchCustomerAddress`
 * already carries, for the same reason.
 *
 * Every export takes `prisma` explicitly and reads no request context; the request-scoped facade
 * is `lib/shopping-lists-service.ts`.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface ShoppingListSummary {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: Date;
}

export interface ShoppingListDetail {
  id: string;
  name: string;
  items: SavedListItemRow[];
}

const ITEM_FIELDS = {
  rawText: true,
  terms: true,
  quantity: true,
  measure: true,
  brand: true,
  position: true,
} as const;

/**
 * A customer's saved lists for one vendor, most recently touched first.
 *
 * Recency rather than name order: the list a returning shopper wants is overwhelmingly the one
 * they used last, the same reasoning `listCustomerAddresses` applies to saved addresses.
 */
export async function listShoppingLists(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<ShoppingListSummary[]> {
  const rows = await prisma.shoppingList.findMany({
    where: { vendorId, userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: { select: { items: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    itemCount: row._count.items,
    updatedAt: row.updatedAt,
  }));
}

/**
 * One saved list with its lines, or null when it does not belong to this vendor and user.
 *
 * Returning null rather than throwing is what lets the page call `notFound()` — a list belonging
 * to somebody else must be indistinguishable from one that never existed.
 */
export async function findShoppingList(
  prisma: Db,
  vendorId: string,
  userId: string,
  id: string,
): Promise<ShoppingListDetail | null> {
  const row = await prisma.shoppingList.findFirst({
    where: { id, vendorId, userId },
    select: {
      id: true,
      name: true,
      items: { orderBy: { position: "asc" }, select: ITEM_FIELDS },
    },
  });

  return row ?? null;
}

/**
 * Save a new list. Returns its id, or null when it was refused.
 *
 * Refused, rather than thrown, in two cases: the shopper is already at `MAX_SAVED_LISTS`, and the
 * list has no usable lines. Both are ordinary outcomes a caller has to render a message for, not
 * exceptional ones — an empty list is what a paste of pure punctuation produces.
 *
 * TAKES THE WEBSOCKET CLIENT, and must — see the module docstring. The nested item create is the
 * multi-statement write that the HTTP adapter cannot run.
 *
 * The cap is checked then acted on, which is a race: two concurrent saves at 19 lists could both
 * pass and produce a 21st. That is deliberate. Guarding it needs an interactive transaction to
 * serialise a shopper against themselves, and the cost of being one over a soft ceiling on your
 * own saved lists is nothing — whereas holding a transaction open across two round trips on every
 * save is a real cost on every save.
 */
export async function createShoppingList(
  prismaWs: DbWs,
  vendorId: string,
  userId: string,
  name: string,
  items: readonly SavedListItemInput[],
): Promise<string | null> {
  if (items.length === 0) return null;

  const existing = await prismaWs.shoppingList.count({ where: { vendorId, userId } });
  if (existing >= MAX_SAVED_LISTS) return null;

  const created = await prismaWs.shoppingList.create({
    data: {
      vendorId,
      userId,
      name,
      items: { create: items.map((item) => ({ ...item })) },
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Rename a list. Returns false when no row of this vendor's and user's matched.
 *
 * Scoped by vendor and user in the `where`, so a crafted id belonging to somebody else updates
 * nothing rather than renaming their list. That scoping is why this is an `updateMany` on a
 * compound condition rather than an `update` by primary key — and being an `updateMany` is why it
 * takes the WebSocket client.
 */
export async function renameShoppingList(
  prismaWs: DbWs,
  vendorId: string,
  userId: string,
  id: string,
  name: string,
): Promise<boolean> {
  const updated = await prismaWs.shoppingList.updateMany({
    where: { id, vendorId, userId },
    data: { name },
  });

  return updated.count > 0;
}

/**
 * Delete a list. Its items go with it through the schema's `onDelete: Cascade`, so there is no
 * second delete to get wrong or to leave orphans behind.
 *
 * Deleting a list has no effect on any cart or order: this table holds text, never a `productId`,
 * and nothing downstream references it.
 */
export async function deleteShoppingList(
  prisma: Db,
  vendorId: string,
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await prisma.shoppingList.deleteMany({ where: { id, vendorId, userId } });
  return deleted.count > 0;
}
