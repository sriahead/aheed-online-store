/**
 * Layout logic for the checkout slot grid (#1305) — pure, so it is tested without a DOM.
 *
 * A `VendorFulfilmentSlot` belongs to a WEEKDAY, not a date, so the same time range can exist on
 * Tuesday and not on Wednesday. The grid's rows are therefore the union of time ranges across the
 * days on screen, and a day without that range gets a `null` cell.
 */

export type SlotBand = "morning" | "afternoon" | "evening";

export interface GridSlot {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  available: number;
}

export interface GridCell {
  slotId: string;
  capacity: number;
  available: number;
}

export interface GridRow {
  /** `HH:mm-HH:mm`, stable across re-renders. */
  key: string;
  startTime: string;
  endTime: string;
  /** Same length and order as the `days` the grid was built from. */
  cells: (GridCell | null)[];
}

export interface GridBand {
  band: SlotBand;
  rows: GridRow[];
}

export const DAYS_PER_PAGE = 7;

const BAND_ORDER: SlotBand[] = ["morning", "afternoon", "evening"];

/** The heading shown for each band — real text, not CSS capitalisation, so it is what a reader hears. */
export const BAND_LABELS: Record<SlotBand, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** `startTime` is zero-padded `HH:mm`, so string comparison is time comparison. */
export function slotBand(startTime: string): SlotBand {
  if (startTime < "12:00") return "morning";
  if (startTime < "17:00") return "afternoon";
  return "evening";
}

/** The days on one page of the grid; `[]` once `page` is past the last day. */
export function pageDays(days: string[], page: number, size: number = DAYS_PER_PAGE): string[] {
  if (page < 0) return [];
  return days.slice(page * size, page * size + size);
}

export function buildSlotGrid(
  days: string[],
  slotsByDay: Record<string, GridSlot[] | undefined>,
): GridBand[] {
  const rows = new Map<string, GridRow>();

  days.forEach((day, index) => {
    for (const slot of slotsByDay[day] ?? []) {
      const key = `${slot.startTime}-${slot.endTime}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          startTime: slot.startTime,
          endTime: slot.endTime,
          cells: days.map(() => null),
        };
        rows.set(key, row);
      }
      row.cells[index] = {
        slotId: slot.id,
        capacity: slot.capacity,
        available: slot.available,
      };
    }
  });

  const sorted = [...rows.values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
  );

  return BAND_ORDER.map((band) => ({
    band,
    rows: sorted.filter((row) => slotBand(row.startTime) === band),
  })).filter((group) => group.rows.length > 0);
}
