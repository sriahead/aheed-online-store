/**
 * #1435 R12 — "what happens next", the one source both the customer emails and the order progress
 * tracker read (`components/orders/OrderProgressTracker.tsx`), so the page and the email can never
 * tell a customer two different things.
 *
 * Leading with the next step is deliberate: waiting is what makes an order anxious, and a concrete
 * next step with a real time window removes most of that (uncertainty reduction). The copy stays
 * neutral — no store name, no product example — because vendors sell different things.
 *
 * Pure and import-free, so a client component can use it.
 */

export const ORDER_EVENTS = [
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "READY_FOR_COLLECTION",
  "COLLECTED",
  "CANCELLED",
] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

export type FulfilmentMethodValue = "DELIVERY" | "COLLECTION";

export function isOrderEvent(status: string): status is OrderEvent {
  return (ORDER_EVENTS as readonly string[]).includes(status);
}

/**
 * The P9.2 (#696) cancellation copy, verbatim. It is careful about money on purpose: no code path
 * issues a refund (#606), so it says plainly that the charge stands and points to a human.
 */
export const CANCELLED_NEXT_STEP =
  "We're sorry — we've had to cancel this order and any points or discount code you used have been put back on your account. No payment has been returned yet, so please reply to this email and we'll sort that out with you directly.";

const DONE =
  "Nothing else to do. If anything isn't right, reply to this email and we'll put it right.";

/** The text for a status, or null where there is none (e.g. `PENDING_PAYMENT`). */
export function nextStepText(
  status: string,
  method: FulfilmentMethodValue,
  orderNumber: string,
): string | null {
  switch (status) {
    case "CONFIRMED":
      return method === "COLLECTION"
        ? "We'll pack your order and email you as soon as it's ready to collect."
        : "We'll pack your order and email you when it's out for delivery.";
    case "OUT_FOR_DELIVERY":
      return "Our driver has your order now. Please keep your phone nearby in case they need to reach you.";
    case "READY_FOR_COLLECTION":
      return `Your items are packed and waiting for you in store. Bring your order number: ${orderNumber}.`;
    case "DELIVERED":
    case "COLLECTED":
      return DONE;
    case "CANCELLED":
      return CANCELLED_NEXT_STEP;
    default:
      return null;
  }
}

/** The slot sentence that follows the text, or null without a slot label or for a final status. */
export function slotSentence(
  status: string,
  method: FulfilmentMethodValue,
  slotLabel: string | null,
): string | null {
  if (!slotLabel) return null;
  switch (status) {
    case "CONFIRMED":
      return method === "COLLECTION"
        ? `Your collection slot: ${slotLabel}.`
        : `Your delivery slot: ${slotLabel}.`;
    case "OUT_FOR_DELIVERY":
      return `Expected: ${slotLabel}.`;
    case "READY_FOR_COLLECTION":
      return `Your collection slot: ${slotLabel}.`;
    default:
      return null;
  }
}
