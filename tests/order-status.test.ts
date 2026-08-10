import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  formatOrderDate,
  formatOrderDateTime,
  orderStatusLabel,
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
