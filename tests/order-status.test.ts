import { describe, it, expect } from "vitest";
import {
  buildStaffTimeline,
  buildTimeline,
  canTransition,
  formatOrderDate,
  formatOrderDateTime,
  isOrderStatus,
  nextStatus,
  orderStatusLabel,
  REVENUE_STATUSES,
  STAFF_QUEUE_STATUSES,
  type StaffStatusEventInput,
  type StatusEventInput,
} from "@/lib/order-status";

// lib/order-status.ts is deliberately pure — no lib/db import — so like
// tests/cart.test.ts this needs no @prisma/client/wasm mocking.

const ALL_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

const at = (iso: string): Date => new Date(iso);
const event = (status: string, iso: string): StatusEventInput => ({
  status,
  createdAt: at(iso),
});

describe("orderStatusLabel", () => {
  it("gives every OrderStatus a distinct, non-empty customer-facing label", () => {
    const labels = ALL_STATUSES.map(orderStatusLabel);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(ALL_STATUSES.length);
  });

  it("never leaks the raw enum name into customer copy", () => {
    for (const status of ALL_STATUSES) {
      expect(orderStatusLabel(status)).not.toBe(status);
      expect(orderStatusLabel(status)).not.toContain("_");
    }
  });

  it("falls back for an unrecognised status rather than throwing", () => {
    const label = orderStatusLabel("NOT_A_STATUS");
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("NOT_A_STATUS");
  });
});

describe("buildTimeline", () => {
  it("sorts ascending by date regardless of input order", () => {
    const timeline = buildTimeline([
      event("DELIVERED", "2026-08-03T10:00:00Z"),
      event("PENDING_PAYMENT", "2026-08-01T10:00:00Z"),
      event("OUT_FOR_DELIVERY", "2026-08-02T10:00:00Z"),
    ]);

    expect(timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
  });

  it("labels each entry with orderStatusLabel", () => {
    const timeline = buildTimeline([event("CONFIRMED", "2026-08-01T10:00:00Z")]);
    expect(timeline[0].label).toBe(orderStatusLabel("CONFIRMED"));
  });

  it("collapses CONSECUTIVE duplicates, keeping the earliest occurrence", () => {
    const timeline = buildTimeline([
      event("CONFIRMED", "2026-08-01T10:00:00Z"),
      event("CONFIRMED", "2026-08-01T11:00:00Z"),
      event("DELIVERED", "2026-08-02T10:00:00Z"),
    ]);

    expect(timeline).toHaveLength(2);
    expect(timeline[0].at).toEqual(at("2026-08-01T10:00:00Z"));
  });

  it("preserves NON-consecutive repeats — a re-confirmation is a real event", () => {
    const timeline = buildTimeline([
      event("CONFIRMED", "2026-08-01T10:00:00Z"),
      event("CANCELLED", "2026-08-02T10:00:00Z"),
      event("CONFIRMED", "2026-08-03T10:00:00Z"),
    ]);

    expect(timeline.map((entry) => entry.status)).toEqual(["CONFIRMED", "CANCELLED", "CONFIRMED"]);
  });

  it("returns an empty timeline for an order with no events", () => {
    expect(buildTimeline([])).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const events = [
      event("DELIVERED", "2026-08-02T10:00:00Z"),
      event("CONFIRMED", "2026-08-01T10:00:00Z"),
    ];
    buildTimeline(events);
    expect(events[0].status).toBe("DELIVERED");
  });

  it("carries no note field — an internal staff note cannot reach the customer", () => {
    // P4b lets staff write OrderStatusEvent.note. Even when one is smuggled in
    // on the input object, nothing about it survives into the timeline.
    const smuggled = {
      status: "OUT_FOR_DELIVERY",
      createdAt: at("2026-08-01T10:00:00Z"),
      note: "INTERNAL-DO-NOT-SHOW",
    } as StatusEventInput;

    const timeline = buildTimeline([smuggled]);

    expect(Object.keys(timeline[0]).sort()).toEqual(["at", "label", "status"]);
    expect(JSON.stringify(timeline)).not.toContain("INTERNAL-DO-NOT-SHOW");
  });
});

describe("order date formatting", () => {
  it("formats as en-GB day-month-year, never the ambiguous US order", () => {
    // 11 August 2026 — a US format would render this as "8/11/2026".
    expect(formatOrderDate(at("2026-08-11T09:30:00Z"))).toBe("11 August 2026");
  });

  it("includes the time when steps can share a day", () => {
    const formatted = formatOrderDateTime(at("2026-08-11T09:30:00Z"));
    expect(formatted).toContain("11 August 2026");
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });
});

// ---- Transition legality (P4b, #125) ---------------------------------------

describe("canTransition", () => {
  it("allows exactly the two rungs of the staff ladder", () => {
    expect(canTransition("CONFIRMED", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("allows NOTHING else across the whole 5x5 matrix", () => {
    const legal: string[] = [];
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (canTransition(from, to)) legal.push(`${from}->${to}`);
      }
    }

    // Asserting the exact set, not just spot-checks: a future added status must
    // not be able to widen the ladder silently.
    expect(legal).toEqual(["CONFIRMED->OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY->DELIVERED"]);
  });

  it("refuses to move an unpaid order at all", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition("PENDING_PAYMENT", to)).toBe(false);
    }
  });

  it("treats DELIVERED and CANCELLED as terminal", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition("DELIVERED", to)).toBe(false);
      expect(canTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("never skips a rung or moves backwards", () => {
    expect(canTransition("CONFIRMED", "DELIVERED")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "CONFIRMED")).toBe(false);
    expect(canTransition("DELIVERED", "OUT_FOR_DELIVERY")).toBe(false);
  });

  it("permits nothing from or to an unrecognised status, without throwing", () => {
    expect(canTransition("NOT_A_STATUS", "DELIVERED")).toBe(false);
    expect(canTransition("CONFIRMED", "NOT_A_STATUS")).toBe(false);
    expect(canTransition("", "")).toBe(false);
  });
});

describe("nextStatus", () => {
  it("returns the single legal successor, or null at the ends of the ladder", () => {
    expect(nextStatus("CONFIRMED")).toBe("OUT_FOR_DELIVERY");
    expect(nextStatus("OUT_FOR_DELIVERY")).toBe("DELIVERED");
    expect(nextStatus("PENDING_PAYMENT")).toBeNull();
    expect(nextStatus("DELIVERED")).toBeNull();
    expect(nextStatus("CANCELLED")).toBeNull();
    expect(nextStatus("NOT_A_STATUS")).toBeNull();
  });

  it("cannot disagree with canTransition", () => {
    for (const from of ALL_STATUSES) {
      const next = nextStatus(from);
      if (next === null) {
        // Nothing legal from here at all.
        expect(ALL_STATUSES.some((to) => canTransition(from, to))).toBe(false);
      } else {
        expect(canTransition(from, next)).toBe(true);
      }
    }
  });
});

describe("isOrderStatus", () => {
  it("accepts every real status and rejects anything else", () => {
    for (const status of ALL_STATUSES) {
      expect(isOrderStatus(status)).toBe(true);
    }
    for (const forged of ["BANANA", "", "confirmed", "DELIVERED "]) {
      expect(isOrderStatus(forged)).toBe(false);
    }
  });
});

// ---- Staff timeline (P6a, #158) --------------------------------------------

describe("buildStaffTimeline", () => {
  const staffEvent = (
    status: string,
    iso: string,
    note: string | null = null,
    actorName: string | null = null,
  ): StaffStatusEventInput => ({ status, createdAt: at(iso), note, actorName });

  it("orders events oldest first regardless of input order", () => {
    const timeline = buildStaffTimeline([
      staffEvent("DELIVERED", "2026-08-03T10:00:00Z"),
      staffEvent("CONFIRMED", "2026-08-01T10:00:00Z"),
      staffEvent("OUT_FOR_DELIVERY", "2026-08-02T10:00:00Z"),
    ]);
    expect(timeline.map((e) => e.status)).toEqual(["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });

  it("carries the note and the acting user through to the entry", () => {
    const [entry] = buildStaffTimeline([
      staffEvent("OUT_FOR_DELIVERY", "2026-08-02T10:00:00Z", "Left with neighbour.", "Sam Staff"),
    ]);
    expect(entry.note).toBe("Left with neighbour.");
    expect(entry.actorName).toBe("Sam Staff");
    expect(entry.label).toBe("Out for delivery");
  });

  it("keeps system events, which carry no actor", () => {
    const [entry] = buildStaffTimeline([
      staffEvent("CONFIRMED", "2026-08-01T10:00:00Z", "Payment confirmed.", null),
    ]);
    expect(entry.actorName).toBeNull();
    expect(entry.note).toBe("Payment confirmed.");
  });

  it("does NOT collapse consecutive identical statuses, unlike the customer timeline", () => {
    const events = [
      staffEvent("CONFIRMED", "2026-08-01T10:00:00Z", "Payment confirmed."),
      staffEvent("CONFIRMED", "2026-08-01T10:00:05Z", "Duplicate webhook delivery."),
    ];
    // The shopper is spared the retry noise...
    expect(buildTimeline(events)).toHaveLength(1);
    // ...but for staff the repeat IS the diagnostic information.
    expect(buildStaffTimeline(events)).toHaveLength(2);
  });

  it("returns an empty timeline for no events", () => {
    expect(buildStaffTimeline([])).toEqual([]);
  });
});

/**
 * P7.5a (#238) — the set of statuses that count as revenue.
 *
 * `getFinancialsForStaff` aggregated on vendorId alone, so abandoned checkouts
 * and cancelled orders were reported to the owner as money taken (39% overstated
 * on staging). These tests pin the two ways that fix can silently regress.
 */
describe("REVENUE_STATUSES", () => {
  it("excludes orders that were never paid for or were cancelled", () => {
    expect(REVENUE_STATUSES).not.toContain("PENDING_PAYMENT");
    expect(REVENUE_STATUSES).not.toContain("CANCELLED");
  });

  it("includes DELIVERED — the case that breaks if it is derived from the staff queue", () => {
    // STAFF_QUEUE_STATUSES is a WORKLIST: it omits DELIVERED because there is
    // nothing left to do, not because the money isn't real. Expressing revenue
    // in terms of it is the tempting one-liner and would drop the most certain
    // revenue there is.
    expect(REVENUE_STATUSES).toContain("DELIVERED");
    expect(STAFF_QUEUE_STATUSES).not.toContain("DELIVERED");
  });

  it("is exactly the three post-payment statuses", () => {
    expect([...REVENUE_STATUSES]).toEqual(["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });
});
