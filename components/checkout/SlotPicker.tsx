"use client";

import { useEffect, useState, useTransition } from "react";
import { getAvailableSlotsForDate } from "@/features/checkout/slots";
import type { FulfilmentMethod } from "@prisma/client";

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
}: {
  vendorId: string;
  method: FulfilmentMethod;
  bookingWindowDays: number;
  required?: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
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
      <div>
        <label className="block text-xs font-bold uppercase tracking-wide text-black/60 mb-2">
          Select Date
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {dates.map((date) => {
            const isSelected = date.getTime() === selectedDate.getTime();
            const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
            const dayNum = date.getDate();
            const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
            
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
        <input type="hidden" name="fulfilmentDate" value={selectedDate.toISOString()} />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wide text-black/60 mb-2">
          Select Time Slot
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {isPending ? (
            <div className="col-span-full py-4 text-center text-sm text-black/60">Loading slots...</div>
          ) : slots.length === 0 ? (
            <div className="col-span-full py-4 text-center text-sm text-black/60">No slots available for this date.</div>
          ) : (
            slots.map((slot) => {
              const isAvailable = slot.available > 0;
              return (
                <label
                  key={slot.id}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border p-3 transition-colors ${
                    !isAvailable
                      ? "opacity-50 cursor-not-allowed bg-black/5 border-black/5"
                      : "border-black/10 hover:bg-black/5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfilmentSlotId"
                    value={slot.id}
                    disabled={!isAvailable}
                    required={required}
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
