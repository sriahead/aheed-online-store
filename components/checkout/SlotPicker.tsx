"use client";

import { useEffect, useState, useTransition } from "react";
import { getAvailableSlotsForDate } from "@/features/checkout/slots";
import type { FulfilmentMethod } from "@/lib/repositories/fulfilment-slots";
import {
  addCalendarDays,
  calendarDayInZone,
  calendarDayToUtcMidnight,
  zoneWallClock,
} from "@/lib/local-datetime";

interface Slot {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  available: number;
}

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
   * #811. The selected date is a `YYYY-MM-DD` CALENDAR DAY in the vendor's zone, not an instant.
   *
   * This used to be `new Date()` with `setHours(0,0,0,0)` — local midnight in the SHOPPER's
   * browser zone — submitted as `.toISOString()`. During BST that is 23:00 on the preceding day,
   * and the Worker read the weekday back off it in UTC, so the shopper was shown and booked into
   * the wrong day's slots all season. Holding a day string means there is no instant to misread.
   */
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    calendarDayInZone(new Date(), timezone),
  );
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

  const [slots, setSlots] = useState<Slot[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      // The calendar day goes over the wire exactly as held — no instant is ever constructed.
      const data = await getAvailableSlotsForDate(vendorId, method, selectedDay);
      setSlots(data);
    });
  }, [vendorId, method, selectedDay]);

  // Selectable days, counted forward from today IN THE VENDOR'S ZONE. String arithmetic through
  // UTC, so a DST boundary inside the booking window cannot shorten or repeat a day.
  const firstDay = calendarDayInZone(new Date(), timezone);
  const days: string[] = [];
  for (let i = 0; i < bookingWindowDays; i++) {
    days.push(addCalendarDays(firstDay, i));
  }

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

      <div>
        <div className="block text-xs font-bold uppercase tracking-wide text-black/60 mb-2">
          Select Date
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {days.map((day) => {
            const isSelected = day === selectedDay;
            /*
             * Labelled from the day's own UTC midnight, formatted with `timeZone: "UTC"`.
             *
             * Explicitly UTC rather than the vendor's zone: UTC midnight of 2026-09-19 rendered in
             * a negative-offset zone is the evening of the 18th, so labelling in the vendor zone
             * would reintroduce exactly the off-by-one this slice removes — for a different set of
             * vendors. The day string IS the label; UTC is just the lens that shows it unchanged.
             */
            const at = calendarDayToUtcMidnight(day) ?? new Date(0);
            const label = new Intl.DateTimeFormat("en-GB", {
              timeZone: "UTC",
              weekday: "short",
              day: "numeric",
              month: "short",
            }).formatToParts(at);
            const part = (type: Intl.DateTimeFormatPartTypes) =>
              label.find((p) => p.type === type)?.value ?? "";

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl border px-4 py-2 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-white"
                    : "border-black/10 hover:border-black/20 hover:bg-black/5"
                }`}
              >
                <span className="text-xs font-medium opacity-80">{part("weekday")}</span>
                <span className="text-lg font-bold">{part("day")}</span>
                <span className="text-xs font-medium opacity-80">{part("month")}</span>
              </button>
            );
          })}
        </div>
        {/* #811 — the bare calendar day, the same string the slot lookup above was given. */}
        <input type="hidden" name="fulfilmentDate" disabled={isExpress} value={selectedDay} />
      </div>

      <div>
        <div className="block text-xs font-bold uppercase tracking-wide text-black/60 mb-2">
          Select Time Slot
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {isPending ? (
            <div className="col-span-full py-4 text-center text-sm text-black/60">
              Loading slots...
            </div>
          ) : slots.length === 0 ? (
            <div className="col-span-full py-4 text-center text-sm text-black/60">
              No slots available for this date.
            </div>
          ) : (
            slots.map((slot) => {
              const isAvailable = slot.available > 0;
              return (
                <label
                  key={slot.id}
                  className={`flex cursor-pointer ${isExpress ? "opacity-50 pointer-events-none" : ""}  flex-col items-center justify-center rounded-xl border p-3 transition-colors ${
                    !isAvailable
                      ? "opacity-50 cursor-not-allowed bg-black/5 border-black/5"
                      : "border-black/10 hover:bg-black/5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfilmentSlotId"
                    value={slot.id}
                    disabled={!isAvailable || isExpress}
                    required={required && !isExpress}
                    className="sr-only"
                  />
                  <span className="font-bold text-sm">
                    {slot.startTime} - {slot.endTime}
                  </span>
                  {!isAvailable && (
                    <span className="text-xs text-danger font-medium mt-1">Fully booked</span>
                  )}
                  {isAvailable && slot.available <= 3 && (
                    <span className="text-xs text-warning font-medium mt-1">
                      Only {slot.available} left
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
