"use server";

import { redirect } from "next/navigation";
import { getCartRepository } from "@/lib/cart-service";
import { getUserId, issueGuestToken, type CartIdentity } from "@/lib/cart-identity";
import { restoredLines } from "@/lib/restore-lines";
import { buildRestoreNoticeUrl, type RestoredLineKind } from "@/lib/restore-notice";
import { MAX_LINE_QUANTITY } from "@/lib/shopping-list";
import { revalidateCartSurfaces } from "./shared";

/**
 * "Shop your list" step 2 (P3d, #114): add the reviewed lines to the cart.
 *
 * The review step is stateless, so the form submits a productId and quantity
 * per confirmed line. Those ids are UNTRUSTED — the repository resolves stock
 * scoped to the current vendor, so an id belonging to another vendor (or to
 * nothing) has no row, resolves to stock 0, and is skipped. Nothing here
 * re-derives that check.
 *
 * The fields are read positionally: every rendered line emits ALL FOUR inputs
 * (`productId`, `quantity`, `lineLabel`, `lineStatus`), so the arrays stay
 * aligned. An unresolved ambiguous line, an out-of-stock match and an unmatched
 * line each emit an empty productId. Until #1090 the last two emitted nothing at
 * all, which kept the arrays aligned but left `/cart` silent about them.
 *
 * ## It now says what did not go in (#1088)
 *
 * This used to end in a bare `redirect("/cart")`, so a line the shopper left on
 * "Skip this line" vanished with no acknowledgement anywhere — the reported
 * defect. Two things made that hard to fix and are worth not rediscovering:
 *
 * 1. A skipped line arrives as an EMPTY productId, so it was countable but
 *    nameless; the line's own text lived only in the client. `lineLabel` (added
 *    to `ListReview` by this slice) is that text, carried positionally. It is
 *    deliberately not conditional on the component's selection state: a hidden
 *    input gated on client state would report a line the shopper really did
 *    resolve whenever the select changes without React.
 * 2. `addItems` already returns a per-line report and this action discarded it,
 *    so a line clamped by stock — or one whose stock the cart already holds in
 *    full — was dropped as silently as a skipped one. Passing that report
 *    through costs no extra query.
 *
 * Both now travel through `#957`'s existing notice (`lib/restore-lines.ts`,
 * `lib/restore-notice.ts`) rather than a second mechanism; the only thing this
 * path needs that reorder does not is the `"skipped"` kind.
 */

/**
 * Shown when a skipped line's label is missing or blank, which only a crafted
 * post produces — the review step always writes it. A skipped line is never
 * dropped from the notice for want of a label, because `parseRestoreNotice`
 * discards a nameless entry and the shopper would be back to silence.
 */
const SKIPPED_LINE_FALLBACK_NAME = "An item from your list";

const readText = (value: FormDataEntryValue | undefined) =>
  typeof value === "string" ? value.trim() : "";

/**
 * #1090 — why a submitted line has no product, from the review step's positional `lineStatus`.
 *
 * Read ONLY for an empty productId: a line carrying a product goes to the bulk add whatever its
 * status says, so the field can choose a notice's wording but never cause or prevent an add. That
 * is what makes it safe to take from the client. Anything other than the two recognised values —
 * including no field at all, which is what a review page rendered before #1090 submits — is a
 * skipped line, exactly as `#1088` reported it.
 */
function missingLineKind(status: string): RestoredLineKind {
  if (status === "unavailable") return "unavailable";
  if (status === "unmatched") return "unmatched";
  return "skipped";
}

export async function addListToCart(formData: FormData) {
  const productIds = formData.getAll("productId");
  const quantities = formData.getAll("quantity");
  const labels = formData.getAll("lineLabel");
  const statuses = formData.getAll("lineStatus");

  const submitted = productIds
    .map((rawId, index) => ({
      productId: readText(rawId),
      label: readText(labels[index]),
      status: readText(statuses[index]),
      quantity: Number(readText(quantities[index])),
    }))
    // A line carrying a product but an unusable quantity is dropped exactly as it was before this
    // slice, and contributes no notice entry — only a crafted post produces one, since the review
    // step writes the quantity itself, and no entry wording would be true of it.
    .filter(
      (line) => line.productId === "" || (Number.isFinite(line.quantity) && line.quantity >= 1),
    )
    .map((line) => ({
      productId: line.productId === "" ? null : line.productId,
      productName: line.label === "" ? SKIPPED_LINE_FALLBACK_NAME : line.label,
      kind: line.productId === "" ? missingLineKind(line.status) : undefined,
      quantity:
        Number.isFinite(line.quantity) && line.quantity >= 1
          ? Math.min(Math.trunc(line.quantity), MAX_LINE_QUANTITY)
          : 1,
    }));

  const lines = await restoredLines(
    submitted,
    async (toAdd) => {
      // Only now — on a real add — does a guest get a token, matching add-to-cart.
      // `restoredLines` calls this at all only when there is something to send.
      const userId = await getUserId();
      const identity: CartIdentity = userId
        ? { userId, guestToken: null }
        : { userId: null, guestToken: await issueGuestToken() };

      const report = await getCartRepository().addItems(identity, toAdd);
      await revalidateCartSurfaces();
      return report;
    },
    "skipped",
  );

  // Exactly `/cart` when every line went in in full — `buildRestoreNoticeUrl` decides that, so the
  // shopper sees no notice when there is nothing to say.
  redirect(buildRestoreNoticeUrl("list", lines));
}
