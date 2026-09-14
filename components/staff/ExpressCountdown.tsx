"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Live countdown badge for Express Collection orders (#402).
 * Renders "Xm left" in amber, turning red once the SLA is breached.
 * Re-ticks every 60 seconds to keep the display current without flooding updates.
 */
export function ExpressCountdown({ targetStr }: { targetStr: string }) {
  const [mins, setMins] = useState(0);

  useEffect(() => {
    const target = new Date(targetStr).getTime();
    const update = () => {
      setMins(Math.round((target - Date.now()) / 60_000));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [targetStr]);

  const isBreached = mins < 0;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 text-xs font-bold rounded-full ${
        isBreached ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
      }`}
    >
      <Clock className="w-3.5 h-3.5" aria-hidden />
      {isBreached ? `Overdue (${Math.abs(mins)}m)` : `${mins}m left`}
    </div>
  );
}
