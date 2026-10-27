import { describe, expect, it } from "vitest";
import { buildSlotGrid, pageDays, slotBand, type GridSlot } from "@/lib/slot-grid";

/** #1305 — the slot grid's layout logic, which is pure so it needs no DOM. */

const slot = (id: string, startTime: string, endTime: string, available = 5): GridSlot => ({
  id,
  startTime,
  endTime,
  capacity: 5,
  available,
});

describe("slotBand (#1305 R10)", () => {
  it.each([
    ["00:00", "morning"],
    ["05:30", "morning"],
    ["11:59", "morning"],
    ["12:00", "afternoon"],
    ["16:59", "afternoon"],
    ["17:00", "evening"],
    ["21:30", "evening"],
  ])("%s is %s", (start, band) => {
    expect(slotBand(start)).toBe(band);
  });
});

describe("pageDays (#1305 R11)", () => {
  const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 20)}`);

  it("returns seven days for a full page", () => {
    expect(pageDays(days, 0)).toEqual(days.slice(0, 7));
  });

  it("returns the short remainder on the last page", () => {
    expect(pageDays(days, 1)).toEqual(days.slice(7));
  });

  it("returns nothing past the last page or before the first", () => {
    expect(pageDays(days, 2)).toEqual([]);
    expect(pageDays(days, -1)).toEqual([]);
  });

  it("honours an explicit page size", () => {
    expect(pageDays(days, 1, 3)).toEqual(days.slice(3, 6));
  });
});

describe("buildSlotGrid (#1305 R12)", () => {
  const days = ["2026-10-27", "2026-10-28", "2026-10-29"];

  it("orders bands morning, afternoon, evening and omits an empty one", () => {
    const grid = buildSlotGrid(days, {
      "2026-10-27": [slot("e1", "18:00", "19:00"), slot("m1", "09:00", "10:00")],
    });
    expect(grid.map((g) => g.band)).toEqual(["morning", "evening"]);
  });

  it("makes one row per distinct time range across all days, sorted by start then end", () => {
    const grid = buildSlotGrid(days, {
      "2026-10-27": [slot("a", "10:00", "11:00"), slot("b", "09:00", "10:00")],
      "2026-10-28": [slot("c", "09:00", "10:00"), slot("d", "09:00", "09:30")],
      "2026-10-29": [slot("e", "10:00", "11:00")],
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].rows.map((r) => r.key)).toEqual(["09:00-09:30", "09:00-10:00", "10:00-11:00"]);
  });

  it("aligns cells with days and uses null where a weekday has no such slot", () => {
    const grid = buildSlotGrid(days, {
      "2026-10-27": [slot("a", "09:00", "10:00", 0)],
      "2026-10-29": [slot("c", "09:00", "10:00", 2)],
    });
    const [row] = grid[0].rows;
    expect(row.cells).toHaveLength(days.length);
    expect(row.cells[0]).toEqual({ slotId: "a", capacity: 5, available: 0 });
    expect(row.cells[1]).toBeNull();
    expect(row.cells[2]).toEqual({ slotId: "c", capacity: 5, available: 2 });
  });

  it("returns no bands when no day has a slot, or a day is missing from the data", () => {
    expect(buildSlotGrid(days, {})).toEqual([]);
    expect(buildSlotGrid(days, { "2026-10-27": [] })).toEqual([]);
  });
});
