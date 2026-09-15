"use client";

import { useEffect, useState, useTransition } from "react";
import { getAvailableSlotsForDate } from "@/features/checkout/slots";
import type { FulfilmentMethod } from "@/lib/repositories/fulfilment-slots";

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
}: {
  vendorId: string;
  method: FulfilmentMethod;
  bookingWindowDays: number;
  required?: boolean;
  expressCollectionEnabled?: boolean;
  expressSchedules?: { dayOfWeek: number; openTime: string; closeTime: string }[];
}) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
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
    const now = new Date();
    const day = now.getDay();
    const time =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");
    const available = expressSchedules.some(
      (s) => s.dayOfWeek === day && time >= s.openTime && time < s.closeTime,
    );
    setShowExpress(available);
    if (!available) setIsExpress(false);
  }, [method, expressCollectionEnabled, expressSchedules]);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const data = await getAvailableSlotsForDate(vendorId, method, selectedDate.toISOString());
      setSlots(data);
    });
  }, [vendorId, method, selectedDate]);

  // Generate selectable dates
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < bookingWindowDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
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
          {dates.map((date) => {
            const isSelected = date.getTime() === selectedDate.getTime();
            const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
            const dayNum = date.getDate();
            const monthName = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);

            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl border px-4 py-2 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-white"
                    : "border-black/10 hover:border-black/20 hover:bg-black/5"
                }`}
              >
                <span className="text-xs font-medium opacity-80">{dayName}</span>
                <span className="text-lg font-bold">{dayNum}</span>
                <span className="text-xs font-medium opacity-80">{monthName}</span>
              </button>
            );
          })}
        </div>
        <input
          type="hidden"
          name="fulfilmentDate"
          disabled={isExpress}
          value={selectedDate.toISOString()}
        />
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
