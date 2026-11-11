import type { WarmupWindow } from "@/lib/db-warmup/schedule";

/**
 * #1491 R5 — what the scheduled windows are expected to cost. Arithmetic, not a measurement: the
 * staging week compares it with Neon's console (R16).
 *
 * Each window keeps the compute up for its length plus Neon's 5-minute suspend tail after the last
 * ping. Activity-based warmth cannot be predicted and is excluded (the page says so).
 */

const DAYS_PER_MONTH = 30.4;
const HOURS_ALWAYS_ON_PER_MONTH = 730;
const SUSPEND_TAIL_HOURS = 5 / 60;
const WEEK_MS = 7 * 86_400_000;

export interface WarmupEstimate {
  windowHoursPerWeek: number;
  windowsPerWeek: number;
  cuHoursPerMonth: number;
  usdPerMonth: number;
  alwaysOnCuHoursPerMonth: number;
  alwaysOnUsdPerMonth: number;
}

export function estimateWarmupCost(
  windows: WarmupWindow[],
  config: { computeMilliUnits: number; priceMicroUsdPerCuHour: number },
  weekStart: Date,
): WarmupEstimate {
  const from = weekStart.getTime();
  const to = from + WEEK_MS;
  let hours = 0;
  let count = 0;
  for (const w of windows) {
    const start = Math.max(w.start.getTime(), from);
    const end = Math.min(w.end.getTime(), to);
    if (end <= start) continue;
    hours += (end - start) / 3_600_000;
    count += 1;
  }
  const cu = config.computeMilliUnits / 1000;
  const price = config.priceMicroUsdPerCuHour / 1_000_000;
  const cuHoursPerMonth = (hours + count * SUSPEND_TAIL_HOURS) * (DAYS_PER_MONTH / 7) * cu;
  const alwaysOnCuHoursPerMonth = HOURS_ALWAYS_ON_PER_MONTH * cu;
  return {
    windowHoursPerWeek: hours,
    windowsPerWeek: count,
    cuHoursPerMonth,
    usdPerMonth: cuHoursPerMonth * price,
    alwaysOnCuHoursPerMonth,
    alwaysOnUsdPerMonth: alwaysOnCuHoursPerMonth * price,
  };
}
