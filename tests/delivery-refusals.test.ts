import { describe, expect, it, vi } from "vitest";
import {
  listRecentDeliveryRefusals,
  recordDeliveryRefusal,
} from "@/lib/repositories/delivery-refusals";
import { refusalRecordFor } from "@/lib/delivery-refusal";
import type { DeliveryEligibility } from "@/lib/delivery-eligibility";

/**
 * #889 R29/R30 — out-of-area refusal counts: the upsert's shape, the per-district fold, and the rule
 * for which verdicts count. R32 lives in
 * `tests/delivery-refusals-service.test.ts`, which mocks this repository.
 */

const VENDOR = "vendor-1";
const DAY = new Date("2026-09-24T00:00:00.000Z");

function eligibility(
  status: DeliveryEligibility["status"],
  postcode = "MK17 8NL",
): DeliveryEligibility {
  return {
    status,
    postcode,
    deliverable: status === "DELIVERABLE",
    verified: true,
    areaCovered: true,
  };
}

describe("recordDeliveryRefusal (R29)", () => {
  it("upserts on the four-key unique, creating at 1 and incrementing by 1", async () => {
    const upsert = vi.fn(async (_args: unknown) => ({}));
    await recordDeliveryRefusal(
      { deliveryRefusalCount: { upsert } } as never,
      VENDOR,
      "MK17",
      DAY,
      "HEADER",
    );

    expect(upsert).toHaveBeenCalledWith({
      where: {
        vendorId_district_day_source: {
          vendorId: VENDOR,
          district: "MK17",
          day: DAY,
          source: "HEADER",
        },
      },
      create: { vendorId: VENDOR, district: "MK17", day: DAY, source: "HEADER", count: 1 },
      update: { count: { increment: 1 } },
    });
  });
});

describe("listRecentDeliveryRefusals (R29)", () => {
  it("folds both surfaces per district and sorts by total, then district", async () => {
    const findMany = vi.fn(async (_args: unknown) => [
      { district: "MK17", source: "HEADER", count: 3 },
      { district: "MK17", source: "CHECKOUT", count: 1 },
      { district: "LU1", source: "HEADER", count: 2 },
      { district: "AL1", source: "CHECKOUT", count: 2 },
      { district: "MK17", source: "HEADER", count: 1 },
    ]);
    const rows = await listRecentDeliveryRefusals(
      { deliveryRefusalCount: { findMany } } as never,
      VENDOR,
      DAY,
      20,
    );

    expect(rows).toEqual([
      { district: "MK17", header: 4, checkout: 1, total: 5 },
      { district: "AL1", header: 0, checkout: 2, total: 2 },
      { district: "LU1", header: 2, checkout: 0, total: 2 },
    ]);
    const args = findMany.mock.calls[0][0] as { where: { vendorId: string; day: { gte: Date } } };
    expect(args.where).toEqual({ vendorId: VENDOR, day: { gte: DAY } });
  });

  it("returns at most the limit", async () => {
    const findMany = vi.fn(async (_args: unknown) =>
      ["A1", "B1", "C1"].map((district) => ({ district, source: "HEADER", count: 1 })),
    );
    const rows = await listRecentDeliveryRefusals(
      { deliveryRefusalCount: { findMany } } as never,
      VENDOR,
      DAY,
      2,
    );
    expect(rows).toHaveLength(2);
  });
});

describe("refusalRecordFor (R30)", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");

  it("counts an OUTSIDE_DELIVERY_AREA verdict against its outward code", () => {
    expect(refusalRecordFor(eligibility("OUTSIDE_DELIVERY_AREA"), now, "Europe/London")).toEqual({
      district: "MK17",
      day: new Date("2026-09-24T00:00:00.000Z"),
    });
  });

  it.each(["INVALID_POSTCODE", "UNVERIFIED", "DELIVERABLE"] as const)(
    "records nothing for %s",
    (status) => {
      expect(refusalRecordFor(eligibility(status), now, "Europe/London")).toBeNull();
    },
  );

  it("uses the vendor-local calendar day, not the UTC one", () => {
    // 20:00 UTC on the 24th is already the 25th in Auckland.
    const late = new Date("2026-09-24T20:00:00.000Z");
    expect(
      refusalRecordFor(eligibility("OUTSIDE_DELIVERY_AREA"), late, "Pacific/Auckland")?.day,
    ).toEqual(new Date("2026-09-25T00:00:00.000Z"));
  });
});
