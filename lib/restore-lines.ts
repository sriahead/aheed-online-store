import type { BulkAddLine, MergeLine } from "@/lib/cart-rules";
import type { RestoredLine } from "@/lib/restore-notice";

/**
 * #957 — put an order's lines back through the bulk add and name what happened to each, for
 * `buildRestoreNoticeUrl`. Shared by reorder and the unpaid-order cancel, which differ only in whose
 * cart they write to.
 *
 * A line whose product was deleted (`productId` empty) never reaches the cart and is reported as
 * unavailable under the order's snapshot name. Every other line is named from the order too, matched
 * back by product id: the order's name is the one the shopper bought it under.
 *
 * A plain module, so it is testable without a request and importable by `"use server"` files.
 */
export async function restoredLines(
  items: { productId: string | null; productName: string; quantity: number }[],
  addItems: (lines: MergeLine[]) => Promise<BulkAddLine[]>,
): Promise<RestoredLine[]> {
  const deleted: RestoredLine[] = items
    .filter((item) => !item.productId)
    .map((item) => ({
      name: item.productName,
      requested: item.quantity,
      added: 0,
      kind: "unavailable",
    }));

  const live = items.filter((item): item is typeof item & { productId: string } =>
    Boolean(item.productId),
  );
  const report =
    live.length > 0
      ? await addItems(live.map((item) => ({ productId: item.productId, quantity: item.quantity })))
      : [];

  const nameOf = new Map(live.map((item) => [item.productId, item.productName]));
  const added: RestoredLine[] = report.map((line) => ({
    name: nameOf.get(line.productId) ?? line.productId,
    requested: line.requested,
    added: line.added,
    kind: line.kind,
  }));

  return [...added, ...deleted];
}
