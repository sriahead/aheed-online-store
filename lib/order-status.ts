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

// ---- Transition legality (P4b, #125) ---------------------------------------

/**
 * The five OrderStatus values, as a plain literal union.
 *
 * Deliberately declared here rather than imported from @prisma/client: this
 * module's defining property is that it does no I/O and pulls in no client, so
 * its rules stay unit-testable with no database. The union is structurally
 * identical to Prisma's generated enum type, so a value narrowed by
 * `isOrderStatus` is assignable to a Prisma `status` field with no cast.
 */
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/** Narrows untrusted input (a form field, a URL) to a real status. */
export function isOrderStatus(value: string): value is OrderStatusValue {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * The staff-advanceable ladder. Strictly forward, strictly one rung at a time.
 *
 * `PENDING_PAYMENT` is deliberately absent as a source: only Stripe's webhook
 * confirms or cancels an unpaid order (P3c), so no staff action can move it and
 * an unpaid order can never jump to delivered. `DELIVERED` and `CANCELLED` are
 * terminal. Staff cannot cancel — that is refund-adjacent (ADR-005) and a
 * decision of its own, not a fifth button.
 *
 * A map rather than a chain of `if`s so the whole rule surface is one readable
 * object, and so `nextStatus` and `canTransition` cannot drift apart.
 */
const LEGAL_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING_PAYMENT: [],
  CONFIRMED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * Is `from -> to` a transition staff are allowed to make?
 *
 * An unrecognised `from` permits nothing: an unknown status is not a licence to
 * move an order, and the safe default for an authorization-shaped question is
 * always "no".
 */
export function canTransition(from: string, to: string): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * The single legal next rung, or null where there is none. Drives the queue's
 * one button, so the UI cannot offer a move the service would then reject.
 */
export function nextStatus(from: string): string | null {
  return LEGAL_TRANSITIONS[from]?.[0] ?? null;
}

/**
 * The statuses a staff member can actually act on — the default worklist.
 *
 * Moved here from lib/repositories/orders.ts in P6a (#158) so the pure
 * query parser (lib/staff-orders-query.ts) can reach it without importing a
 * repository. It was always a status rule, not a data-access concern.
 *
 * Deliberately the inverse of P4a's customer list, which is unfiltered: a
 * shopper hunting a failed payment most needs the PENDING_PAYMENT row nobody
 * wants to show them, whereas a staff QUEUE is a worklist. PENDING_PAYMENT is
 * Stripe's to resolve and no staff action can touch it; DELIVERED and CANCELLED
 * are finished. P6a keeps this as the DEFAULT rather than widening it — an
 * explicit ?status= is what reaches the rest.
 */
export const STAFF_QUEUE_STATUSES = ["CONFIRMED", "OUT_FOR_DELIVERY"] as const;

// ---- Staff-facing timeline (P6a, #158) -------------------------------------

/**
 * One status change as staff see it — WITH the note and the acting user.
 *
 * A separate type from `StatusEventInput` on purpose. P4a's guarantee is that an
 * internal note cannot reach a customer's order page *structurally*: the
 * customer-facing `StatusEventInput` and `TimelineEntry` have no `note` field at
 * all, and `getForUser` does not select the column. Widening those to serve this
 * page would have replaced a structural impossibility with a filtering
 * convention someone must remember. Two types, two builders, one guarantee
 * intact.
 */
export interface StaffStatusEventInput extends StatusEventInput {
  note: string | null;
  /** Display name of whoever caused the transition; null for system events. */
  actorName: string | null;
}

export interface StaffTimelineEntry extends TimelineEntry {
  note: string | null;
  actorName: string | null;
}

/**
 * The staff view of an order's history: every event, oldest first, carrying the
 * note and the actor.
 *
 * Deliberately does NOT collapse consecutive identical statuses the way
 * `buildTimeline` does. That collapse exists to spare a shopper the noise of a
 * webhook retry writing CONFIRMED twice; for staff, two rows written for the
 * same status IS the diagnostic information — hiding it would make an audit
 * trail lie by omission. This is the first read of P4b's
 * `OrderStatusEvent.createdByUserId`, which shipped with nothing able to
 * display it.
 */
export function buildStaffTimeline(events: StaffStatusEventInput[]): StaffTimelineEntry[] {
  return [...events]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((event) => ({
      status: event.status,
      label: orderStatusLabel(event.status),
      at: event.createdAt,
      note: event.note,
      actorName: event.actorName,
    }));
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
