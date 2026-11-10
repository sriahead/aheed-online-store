import { getPrisma } from "@/lib/db";
import { fetchVendorProfile, listAllVendorIds } from "@/lib/repositories/vendor";
import { getDbWarmupConfig, type DbWarmupConfigRow } from "@/lib/repositories/db-warmup";
import { computeWarmupWindows, scheduleSpan, type WarmupWindow } from "@/lib/db-warmup/schedule";
import { serializeWarmupSchedule } from "@/lib/db-warmup/payload";
import { putWarmupSchedule } from "@/lib/job-signals";

/**
 * #1491 — the request-scoped half of the database warm-up: read the config and every vendor's
 * opening hours in this cell, compute the windows, and publish them to KV for the scheduler.
 *
 * Runs on saves and once a day, never per request and never from the scheduler's 4-minute tick: the
 * tick reads only KV, so deciding whether to ping cannot be what wakes the database.
 *
 * Vendor hours are read one vendor at a time through the vendor-scoped `fetchVendorProfile`, so the
 * tenant boundary in `lib/repositories/*` stays intact (tests/repository-vendor-scoping.test.ts).
 */

export interface WarmupPlan {
  config: DbWarmupConfigRow;
  windows: WarmupWindow[];
  validUntil: Date;
  /** True when no vendor in this cell has any weekly hours row: OPENING_HOURS then pings nothing. */
  noOpeningHours: boolean;
}

export async function computeWarmupPlan(now: Date = new Date()): Promise<WarmupPlan> {
  const prisma = getPrisma();
  const config = await getDbWarmupConfig(prisma);
  const vendorIds = await listAllVendorIds(prisma);
  const vendors = [];
  for (const vendorId of vendorIds) {
    const profile = await fetchVendorProfile(prisma, vendorId);
    vendors.push({ weeklyHours: profile.weeklyHours, overrides: profile.hoursOverrides });
  }
  const windows = computeWarmupWindows({ config, now, vendors });
  const { validUntil } = scheduleSpan(now);
  const noOpeningHours = vendors.every((v) => v.weeklyHours.length === 0);
  return { config, windows, validUntil, noOpeningHours };
}

/** Compute and publish. Never throws to its caller: a failed publish must not fail a save. */
export async function publishWarmupSchedule(now: Date = new Date()): Promise<{ windows: number }> {
  try {
    const plan = await computeWarmupPlan(now);
    await putWarmupSchedule(
      serializeWarmupSchedule({
        v: 1,
        enabled: plan.config.enabled,
        activityEnabled: plan.config.activityEnabled,
        activityMinutes: plan.config.activityMinutes,
        windows: plan.windows.map((w) => [w.start.toISOString(), w.end.toISOString()]),
        validUntil: plan.validUntil.toISOString(),
        generatedAt: now.toISOString(),
      }),
    );
    return { windows: plan.windows.length };
  } catch (error) {
    console.error(
      `db-warmup publish failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { windows: 0 };
  }
}
