"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { sendOrderStatusEmail } from "./send-status-email";

/**
 * Advance a whole staff-selected batch along the ladder in one submit (P7a
 * fix, #162 — GAP-010, never actually built despite the roadmap claiming it
 * had been).
 *
 * The RBAC check is re-run here for the same reason `advanceStatus` re-runs
 * it: a server action is a public endpoint at a stable id, not something a
 * page's gate protects on its own.
 *
 * Each selected row arrives as `orderNumber:toStatus` — the queue mixes
 * orders at different stages, so the client encodes each row's OWN next
 * status rather than the form carrying one shared `toStatus`. Nothing here
 * trusts that pairing: `advanceBulk` re-reads every order's PERSISTED status
 * inside its transaction and re-derives legality itself, so a forged or stale
 * pairing simply gets skipped, the same way a single stale submit does today.
 */
export async function advanceStatusBulk(formData: FormData) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return;

  const pairs = formData
    .getAll("selection")
    .filter((value): value is string => typeof value === "string")
    .map((value) => {
      const [orderNumber, toStatus] = value.split(":");
      return orderNumber && toStatus ? { orderNumber, toStatus } : null;
    })
    .filter((pair): pair is { orderNumber: string; toStatus: string } => pair !== null);

  if (pairs.length === 0) return;

  const result = await getOrderRepository().advanceBulk(pairs, { userId: auth.user.id });

  // Emails are sent after the batch commits, one per order that actually
  // moved — never inside advanceBulk's transaction, for the same reason a
  // single advance sends its email after commit (an HTTP call inside a
  // Prisma transaction holds it open against a 5s timeout).
  for (const { order, toStatus } of result.moved) {
    await sendOrderStatusEmail(order, toStatus);
  }

  revalidatePath("/staff/orders");
}
