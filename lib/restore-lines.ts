import type { BulkAddLine, MergeLine } from "@/lib/cart-rules";
import type { RestoredLine, RestoredLineKind } from "@/lib/restore-notice";

/**
 * #957 — put an order's lines back through the bulk add and name what happened to each, for
 * `buildRestoreNoticeUrl`. Shared by reorder and the unpaid-order cancel, which differ only in whose
 * cart they write to.
 *
 * A line whose product was deleted (`productId` empty) never reaches the cart and is reported as
 * unavailable under the order's snapshot name. Every other line is named from the order too, matched
 * back by product id: the order's name is the one the shopper bought it under.
 *
 * `#1088` reuses this for "shop your list", which differs only in WHY a line has no product id: the
 * shopper left an ambiguous line unresolved rather than the product having been deleted. That is the
 * `missingKind` parameter and the only difference — the id-to-name mapping, the empty-`live`
 * short-circuit (which is what keeps a guest from being issued a token when nothing is addable) and
 * the report shape are all identical, so they stay in one place.
 *
 * `#1090` lets an item name its own `kind`, because a shop list now submits two more id-less lines —
 * an out-of-stock match (`unavailable`) and an unmatched line (`unmatched`) — beside the skipped
 * one, so one `missingKind` for the whole call no longer fits. An item without a `kind` falls back
 * to `missingKind`, which is all reorder and cancel ever pass.
 *
 * A plain module, so it is testable without a request and importable by `"use server"` files.
 */
export async function restoredLines(
  items: {
    productId: string | null;
    productName: string;
    quantity: number;
    kind?: RestoredLineKind;
    /** #1135 — the order line's note, carried back onto the basket line. */
    customNote?: string | null;
  }[],
  addItems: (lines: MergeLine[]) => Promise<BulkAddLine[]>,
  missingKind: RestoredLineKind = "unavailable",
): Promise<RestoredLine[]> {
  const deleted: RestoredLine[] = items
    .filter((item) => !item.productId)
    .map((item) => ({
      name: item.productName,
      requested: item.quantity,
      added: 0,
      kind: item.kind ?? missingKind,
    }));

  const live = items.filter((item): item is typeof item & { productId: string } =>
    Boolean(item.productId),
  );
  const report =
    live.length > 0
      ? await addItems(
          live.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            ...(item.customNote ? { customNote: item.customNote } : {}),
          })),
        )
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
