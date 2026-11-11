import { isHhMm, type DbWarmupModeName } from "@/lib/db-warmup/schedule";

/**
 * #1491 R14 — parse and allow-list the warm-up settings form. Pure: no session, no database. Every
 * field is checked; anything out of range is a field error and nothing is written.
 */

export const DB_WARMUP_MODES: readonly DbWarmupModeName[] = [
  "OPENING_HOURS",
  "ALWAYS",
  "CUSTOM",
  "ACTIVITY_ONLY",
];

export type DbWarmupField =
  | "mode"
  | "activityMinutes"
  | "leadMinutes"
  | "customStart"
  | "customEnd"
  | "computeUnits"
  | "pricePerCuHour";

export type DbWarmupFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<DbWarmupField, string>> };

export interface ParsedDbWarmupSettings {
  enabled: boolean;
  mode: DbWarmupModeName;
  activityEnabled: boolean;
  activityMinutes: number;
  leadMinutes: number;
  customStart: string | null;
  customEnd: string | null;
  computeMilliUnits: number;
  priceMicroUsdPerCuHour: number;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function intInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function parseDbWarmupForm(
  form: FormData,
):
  | { ok: true; value: ParsedDbWarmupSettings }
  | { ok: false; fieldErrors: Partial<Record<DbWarmupField, string>> } {
  const errors: Partial<Record<DbWarmupField, string>> = {};

  const mode = text(form, "mode");
  if (!(DB_WARMUP_MODES as readonly string[]).includes(mode)) errors.mode = "Choose a mode.";

  const activityMinutes = intInRange(text(form, "activityMinutes"), 5, 240);
  if (activityMinutes === null) errors.activityMinutes = "Enter whole minutes from 5 to 240.";

  const leadMinutes = intInRange(text(form, "leadMinutes"), 0, 120);
  if (leadMinutes === null) errors.leadMinutes = "Enter whole minutes from 0 to 120.";

  const customStartRaw = text(form, "customStart");
  const customEndRaw = text(form, "customEnd");
  const customStart = customStartRaw === "" ? null : customStartRaw;
  const customEnd = customEndRaw === "" ? null : customEndRaw;
  if (customStart !== null && !isHhMm(customStart)) errors.customStart = "Use HH:mm, e.g. 08:30.";
  if (customEnd !== null && !isHhMm(customEnd)) errors.customEnd = "Use HH:mm, e.g. 20:00.";
  if (mode === "CUSTOM") {
    if (customStart === null) errors.customStart = "Set a start time for a custom window.";
    if (customEnd === null) errors.customEnd = "Set an end time for a custom window.";
    if (isHhMm(customStart) && isHhMm(customEnd) && customStart >= customEnd) {
      errors.customEnd = "The end must be after the start.";
    }
  }

  // Compute size in CU, 0.25 to 16 in steps of 0.25, stored as milli-CU (never a float column).
  const cuRaw = text(form, "computeUnits");
  const cu = /^\d+(\.\d{1,2})?$/.test(cuRaw) ? Number(cuRaw) : NaN;
  const computeMilliUnits = Math.round(cu * 1000);
  if (!(cu >= 0.25 && cu <= 16) || computeMilliUnits % 250 !== 0) {
    errors.computeUnits = "Enter 0.25 to 16, in steps of 0.25.";
  }

  // Price in USD per CU-hour, stored as micro-dollars.
  const priceRaw = text(form, "pricePerCuHour");
  const price = /^\d+(\.\d{1,6})?$/.test(priceRaw) ? Number(priceRaw) : NaN;
  if (!(price > 0 && price <= 10)) errors.pricePerCuHour = "Enter a price above 0 and at most 10.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      enabled: form.get("enabled") === "on",
      mode: mode as DbWarmupModeName,
      activityEnabled: form.get("activityEnabled") === "on",
      activityMinutes: activityMinutes as number,
      leadMinutes: leadMinutes as number,
      customStart,
      customEnd,
      computeMilliUnits,
      priceMicroUsdPerCuHour: Math.round(price * 1_000_000),
    },
  };
}
