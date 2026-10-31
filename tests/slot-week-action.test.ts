import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1305 — `getAvailableSlotsForWeek` is a public server action, so its input is bounded, and it
 * must stay a thin fan-out over the existing per-day lookup (the repository is not changed).
 */

const getAvailableSlotsForVendor = vi.fn();
vi.mock("@/lib/fulfilment-slots-service", () => ({ getAvailableSlotsForVendor }));

const actions = await import("@/features/checkout/slots");
const { getAvailableSlotsForWeek, getAvailableSlotsForDate } = actions;

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

beforeEach(() => {
  vi.clearAllMocks();
  getAvailableSlotsForVendor.mockImplementation(async (_v: string, _m: string, d: string) => [
    { id: `slot-${d}` },
  ]);
});

describe("getAvailableSlotsForWeek (#1305 R13)", () => {
  it("returns one entry per day, in the order given, from the per-day lookup", async () => {
    const days = [day(21), day(20), day(22)];
    const result = await getAvailableSlotsForWeek("vendor-1", "DELIVERY", days);
    expect(result.map((r) => r.day)).toEqual(days);
    expect(result[1].slots).toEqual([{ id: "slot-2026-10-20" }]);
    expect(getAvailableSlotsForVendor).toHaveBeenCalledTimes(3);
    expect(getAvailableSlotsForVendor).toHaveBeenCalledWith("vendor-1", "DELIVERY", day(21));
  });

  it("ignores days after the seventh", async () => {
    const days = Array.from({ length: 9 }, (_, i) => day(10 + i));
    const result = await getAvailableSlotsForWeek("vendor-1", "COLLECTION", days);
    expect(result).toHaveLength(7);
    expect(getAvailableSlotsForVendor).toHaveBeenCalledTimes(7);
  });

  it("drops anything that is not a real calendar day without querying for it", async () => {
    const result = await getAvailableSlotsForWeek("vendor-1", "DELIVERY", [
      day(20),
      "not-a-day",
      "2026-02-31",
      day(21),
    ]);
    expect(result.map((r) => r.day)).toEqual([day(20), day(21)]);
    expect(getAvailableSlotsForVendor).toHaveBeenCalledTimes(2);
  });

  it("keeps the single-day action", async () => {
    expect(await getAvailableSlotsForDate("vendor-1", "DELIVERY", day(20))).toEqual([
      { id: "slot-2026-10-20" },
    ]);
  });

  it("exports only async functions (a `use server` file may export nothing else)", () => {
    for (const [name, value] of Object.entries(actions)) {
      expect(typeof value, name).toBe("function");
      expect((value as { constructor: { name: string } }).constructor.name, name).toBe(
        "AsyncFunction",
      );
    }
  });
});
