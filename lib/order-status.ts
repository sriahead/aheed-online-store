/**
 * Pure order-status presentation (P4a, #122) — no I/O, so it is unit-testable
 * without a DB (same split as lib/cart-rules.ts, lib/order-totals.ts and
 * lib/shopping-list.ts). P4b extends this module with transition legality.
 */

/**
 * Customer-facing copy for each OrderStatus. Deliberately a plain record rather
 * than a Prisma-typed one: this module must not import @prisma/client, and the
 * status arrives as a string from the repository's select anyway.
 */
const LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Order confirmed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Fallback for a status this build doesn't know — never the raw enum name. */
const UNKNOWN_LABEL = "Order updated";

export function orderStatusLabel(status: string): string {
  return LABELS[status] ?? UNKNOWN_LABEL;
}

/** One raw status change, as stored. Note the absence of `note` — see below. */
export interface StatusEventInput {
  status: string;
  createdAt: Date;
}

export interface TimelineEntry {
  status: string;
  label: string;
  at: Date;
}

/**
 * Build the customer-facing timeline from an order's status events.
 *
 * `OrderStatusEvent.note` is deliberately absent from both the input and the
 * output types, and the repository does not select it. Today's notes are
 * system-written and harmless, but P4b gives staff a control that writes that
 * column — and an internal note ("customer never answers, leave next door")
 * rendered on the customer's own order page is a live incident, not a cosmetic
 * bug. Building the timeline from `status` alone makes that leak
 * unrepresentable rather than merely unlikely.
 *
 * Consecutive identical statuses collapse to their EARLIEST occurrence: the
 * shopper cares that their order was confirmed, not that a retry wrote the row
 * twice. Non-consecutive repeats are preserved, because CONFIRMED → CANCELLED →
 * CONFIRMED is a real sequence of events, not noise.
 */
export function buildTimeline(events: StatusEventInput[]): TimelineEntry[] {
  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const timeline: TimelineEntry[] = [];
  for (const event of ordered) {
    // Collapse against the last kept entry only — never against the whole list.
    if (timeline.length > 0 && timeline[timeline.length - 1].status === event.status) continue;
    timeline.push({
      status: event.status,
      label: orderStatusLabel(event.status),
      at: event.createdAt,
    });
  }
  return timeline;
}

/**
 * Order date for display. `en-GB` explicitly, never the runtime's locale — a
 * Worker isolate has no user locale, and `8/11/2026` would read as the wrong
 * month to every customer this store has.
 */
export function formatOrderDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Same, with the time — the timeline needs to distinguish same-day steps. */
export function formatOrderDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
