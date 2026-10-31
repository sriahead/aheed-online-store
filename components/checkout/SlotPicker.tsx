"use client";

import { useEffect, useState, useTransition } from "react";
import { getAvailableSlotsForWeek } from "@/features/checkout/slots";
import { Icon } from "@/components/icons/Icon";
import type { FulfilmentMethod } from "@/lib/repositories/fulfilment-slots";
import {
  BAND_LABELS,
  buildSlotGrid,
  pageDays,
  DAYS_PER_PAGE,
  type GridSlot,
} from "@/lib/slot-grid";
import {
  addCalendarDays,
  calendarDayInZone,
  calendarDayToUtcMidnight,
  zoneWallClock,
} from "@/lib/local-datetime";

/**
 * The checkout slot picker as a week grid (#1305): days across, time ranges down, one radio per
 * cell. Layout logic is `lib/slot-grid.ts`; this file owns state, fetching and markup.
 */
export function SlotPicker({
  vendorId,
  method,
  bookingWindowDays,
  required,
  expressCollectionEnabled,
  expressSchedules,
  timezone,
}: {
  vendorId: string;
  method: FulfilmentMethod;
  bookingWindowDays: number;
  required?: boolean;
  expressCollectionEnabled?: boolean;
  expressSchedules?: { dayOfWeek: number; openTime: string; closeTime: string }[];
  /**
   * #363/#811 — the VENDOR's IANA zone, not the shopper's. Everything below is a calendar day in
   * this zone; the browser's own zone is never consulted.
   */
  timezone: string;
}) {
  /*
   * #811. A selected date is a `YYYY-MM-DD` CALENDAR DAY in the vendor's zone, not an instant.
   *
   * This used to be `new Date()` with `setHours(0,0,0,0)` — local midnight in the SHOPPER's
   * browser zone — submitted as `.toISOString()`. During BST that is 23:00 on the preceding day,
   * and the Worker read the weekday back off it in UTC, so the shopper was shown and booked into
   * the wrong day's slots all season. Holding a day string means there is no instant to misread.
   */
  const [isExpress, setIsExpress] = useState(false);
  const [showExpress, setShowExpress] = useState(false);
  // Whether Express is currently offered depends on wall-clock time against the
  // vendor's schedule, which the server render and the client's clock can
  // legitimately disagree on — deferred to an effect (client-only, post-hydration)
  // rather than computed during render, to avoid a hydration mismatch.
  useEffect(() => {
    if (
      method !== "COLLECTION" ||
      !expressCollectionEnabled ||
      !expressSchedules ||
      expressSchedules.length === 0
    ) {
      // Resetting to the not-shown state when the gating props no longer allow Express.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowExpress(false);
      setIsExpress(false);
      return;
    }
    /*
     * #811 — read the clock in the VENDOR's zone. `expressSchedules` holds the vendor's own
     * opening times as `HH:mm` text, and this used to compare them against `now.getDay()` /
     * `now.getHours()`, which are the SHOPPER's. A shopper in another zone was offered, or
     * refused, Express against a window that had nothing to do with whether the shop was open.
     */
    const { dayOfWeek: day, hhmm: time } = zoneWallClock(new Date(), timezone);
    const available = expressSchedules.some(
      (s) => s.dayOfWeek === day && time >= s.openTime && time < s.closeTime,
    );
    setShowExpress(available);
    if (!available) setIsExpress(false);
  }, [method, expressCollectionEnabled, expressSchedules, timezone]);

  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(0);
  const [slotsByDay, setSlotsByDay] = useState<Record<string, GridSlot[]>>({});
  const [selected, setSelected] = useState<{ day: string; slotId: string } | null>(null);

  // Selectable days, counted forward from today IN THE VENDOR'S ZONE. String arithmetic through
  // UTC, so a DST boundary inside the booking window cannot shorten or repeat a day.
  const firstDay = calendarDayInZone(new Date(), timezone);
  const days: string[] = [];
  for (let i = 0; i < bookingWindowDays; i++) {
    days.push(addCalendarDays(firstDay, i));
  }
  const shownDays = pageDays(days, page);
  const shownKey = shownDays.join(",");

  useEffect(() => {
    if (shownKey === "") return;
    let cancelled = false;
    startTransition(async () => {
      // Calendar days go over the wire exactly as held — no instant is ever constructed.
      const week = await getAvailableSlotsForWeek(vendorId, method, shownKey.split(","));
      if (cancelled) return;
      setSlotsByDay(Object.fromEntries(week.map(({ day, slots }) => [day, slots])));
    });
    return () => {
      cancelled = true;
    };
  }, [vendorId, method, shownKey]);

  const bands = buildSlotGrid(shownDays, slotsByDay);

  // Paging clears the selection: the form's `required` check is satisfied by a rendered radio, and
  // a chosen slot on a page that is no longer on screen would otherwise leave none checked.
  const goToPage = (next: number) => {
    setPage(next);
    setSelected(null);
  };
  const hasNext = (page + 1) * DAYS_PER_PAGE < days.length;

  /*
   * Labelled from the day's own UTC midnight, formatted with `timeZone: "UTC"` (#811): UTC midnight
   * of 2026-09-19 rendered in a negative-offset zone is the evening of the 18th, so labelling in the
   * vendor zone would reintroduce the off-by-one that slice removed. The day string IS the label.
   */
  const dayParts = (day: string) => {
    const at = calendarDayToUtcMidnight(day) ?? new Date(0);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return { weekday: part("weekday"), dayNumber: part("day"), month: part("month") };
  };

  return (
    <div className="space-y-4">
      {showExpress && (
        <button
          type="button"
          role="switch"
          aria-checked={isExpress}
          onClick={() => setIsExpress(!isExpress)}
          className="mb-6 flex w-full items-center justify-between rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-left"
        >
          <div>
            <div className="font-bold text-primary">Express Collection (ASAP)</div>
            <div className="text-xs text-primary-muted">Pick up in 60 minutes</div>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              name="isExpress"
              value="on"
              checked={isExpress}
              readOnly
              className="sr-only"
            />
            <div
              className={
                `w-10 h-6 rounded-full transition-colors ` +
                (isExpress ? "bg-primary" : "bg-black/20")
              }
            >
              <div
                className={
                  `absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ` +
                  (isExpress ? "translate-x-4" : "")
                }
              />
            </div>
          </div>
        </button>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous week"
          disabled={page === 0}
          onClick={() => goToPage(page - 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-black/10 px-3 py-1.5 text-xs font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
          Previous week
        </button>
        <button
          type="button"
          aria-label="Next week"
          disabled={!hasNext}
          onClick={() => goToPage(page + 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-black/10 px-3 py-1.5 text-xs font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next week
          <Icon name="chevron-right" className="h-4 w-4" />
        </button>
      </div>

      {/* #811 — the bare calendar day of the chosen cell; today, in the vendor zone, until one is chosen. */}
      <input
        type="hidden"
        name="fulfilmentDate"
        disabled={isExpress}
        value={selected?.day ?? firstDay}
      />

      {isPending ? (
        <div className="py-4 text-center text-sm text-black/60">Loading slots…</div>
      ) : bands.length === 0 ? (
        <div className="py-4 text-center text-sm text-black/60">
          No slots available for these dates.
        </div>
      ) : (
        /*
         * Scrolls inside its own wrapper with a sticky time column. #959 R18a: a wide child must
         * not stretch the checkout grid track, or the page renders zoomed out on a phone.
         */
        <div className={`overflow-x-auto ${isExpress ? "pointer-events-none opacity-50" : ""}`}>
          <table className="w-full min-w-xl border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 bg-white py-2 text-left font-bold text-primary"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="calendar-clock" className="h-4 w-4" />
                    {dayParts(shownDays[0]).month}
                  </span>
                </th>
                {shownDays.map((day) => {
                  const { weekday, dayNumber } = dayParts(day);
                  return (
                    <th key={day} scope="col" className="py-2 font-bold text-primary">
                      {`${weekday} ${dayNumber}`}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {bands.map(({ band, rows }) => (
              <tbody key={band}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={shownDays.length + 1}
                    className="sticky left-0 pt-3 text-left text-sm font-bold text-primary"
                  >
                    {BAND_LABELS[band]}
                  </th>
                </tr>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className="sticky left-0 bg-white pe-2 text-left font-medium text-primary-muted"
                    >
                      {row.startTime} - {row.endTime}
                    </th>
                    {row.cells.map((cell, index) => {
                      const day = shownDays[index];
                      if (cell === null) {
                        return (
                          <td key={day} className="rounded-lg bg-black/5 py-2.5 text-black/60">
                            –
                          </td>
                        );
                      }
                      const free = cell.available > 0;
                      const status =
                        cell.available === 0
                          ? "Full"
                          : cell.available <= 3
                            ? `${cell.available} left`
                            : "Free";
                      const { weekday, dayNumber, month } = dayParts(day);
                      return (
                        <td key={day} className="p-0">
                          <label
                            className={`flex cursor-pointer items-center justify-center rounded-lg border py-2.5 font-semibold transition-colors ${
                              free
                                ? "border-black/10 text-primary hover:bg-black/5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                                : "cursor-not-allowed border-black/5 bg-black/5 text-black/60"
                            }`}
                          >
                            <input
                              type="radio"
                              name="fulfilmentSlotId"
                              value={cell.slotId}
                              checked={selected?.day === day && selected.slotId === cell.slotId}
                              onChange={() => setSelected({ day, slotId: cell.slotId })}
                              disabled={!free || isExpress}
                              required={required && !isExpress}
                              aria-label={`${weekday} ${dayNumber} ${month}, ${row.startTime} to ${row.endTime}, ${status.toLowerCase()}`}
                              className="sr-only"
                            />
                            {status}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
