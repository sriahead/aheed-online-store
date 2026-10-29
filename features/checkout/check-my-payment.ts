"use server";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/orders-service";
import { getPaymentCheckService } from "@/lib/payment-check-service";

/**
 * The shopper's return-page payment check (#1324).
 *
 * Stripe returns the shopper to `/checkout/<order>?t=…` with a GET, and that page
 * must stay read-only (#428), so a pending order's page calls THIS — a POST —
 * once on mount. When the webhook is late or was lost, the shopper is confirmed
 * here while still looking at the page, instead of waiting for the scheduled
 * sweep.
 *
 * Re-proves access exactly as the page does, because a server action is a
 * public endpoint and its arguments are attacker-controlled: the order must be
 * visible to this viewer (their own order, or a guest order with the right
 * capability token). Anything else returns `{ confirmed: false }` before the
 * provider is asked anything.
 *
 * Returns one boolean and no provider detail. The page re-reads the order from
 * the database on refresh; the browser never learns what Stripe said.
 *
 * Can only CONFIRM (see `lib/payment-check.ts`): nothing a shopper triggers
 * here can cancel or release their order.
 *
 * NOTE: this file may export async functions and nothing else (CLAUDE.md's
 * Server Actions section).
 */
export async function checkMyPayment(
  orderNumber: string,
  token: string | null,
): Promise<{ confirmed: boolean }> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const viewerUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const order = await getOrderRepository().getByOrderNumber(orderNumber, viewerUserId, token);
  if (!order) return { confirmed: false };

  const outcome = await getPaymentCheckService().check(orderNumber);
  return { confirmed: outcome.kind === "confirmed" };
}
