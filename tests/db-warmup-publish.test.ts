import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseWarmupSchedule } from "@/lib/db-warmup/payload";

/**
 * #1491 R6 — publishWarmupSchedule computes the windows from config + every vendor's hours and writes
 * the KV payload; a failure never throws to the caller.
 */

const getDbWarmupConfig = vi.fn();
vi.mock("@/lib/repositories/db-warmup", () => ({ getDbWarmupConfig }));
const listAllVendorIds = vi.fn();
const fetchVendorProfile = vi.fn();
vi.mock("@/lib/repositories/vendor", () => ({ listAllVendorIds, fetchVendorProfile }));
const putWarmupSchedule = vi.fn(async (_value: string) => {});
vi.mock("@/lib/job-signals", () => ({ putWarmupSchedule }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));

const CONFIG = {
  enabled: true,
  mode: "OPENING_HOURS",
  activityEnabled: true,
  activityMinutes: 30,
  leadMinutes: 30,
  customStart: null,
  customEnd: null,
  computeMilliUnits: 250,
  priceMicroUsdPerCuHour: 106000,
  updatedBy: null,
  updatedAt: null,
};
const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: "09:00",
  closeTime: "20:00",
  closed: false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getDbWarmupConfig.mockResolvedValue(CONFIG);
  listAllVendorIds.mockResolvedValue(["v1", "v2"]);
  fetchVendorProfile.mockImplementation(async (_p: unknown, id: string) => ({
    weeklyHours: id === "v1" ? hours : [],
    hoursOverrides: [],
  }));
});

describe("publishWarmupSchedule (#1491 R6)", () => {
  it("reads every vendor through the vendor-scoped reader and writes a valid v1 payload", async () => {
    const { publishWarmupSchedule } = await import("@/lib/db-warmup-service");
    const now = new Date("2026-11-11T10:00:00Z");
    const result = await publishWarmupSchedule(now);
    expect(result.windows).toBe(8);
    expect(fetchVendorProfile).toHaveBeenCalledWith(expect.anything(), "v1");
    expect(fetchVendorProfile).toHaveBeenCalledWith(expect.anything(), "v2");
    const payload = parseWarmupSchedule(putWarmupSchedule.mock.calls[0][0]);
    expect(payload).not.toBeNull();
    expect(payload?.v).toBe(1);
    expect(payload?.enabled).toBe(true);
    expect(payload?.activityMinutes).toBe(30);
    expect(payload?.validUntil).toBe("2026-11-19T00:00:00.000Z");
    expect(payload?.windows[0]).toEqual(["2026-11-11T08:30:00.000Z", "2026-11-11T20:00:00.000Z"]);
  });

  it("a database failure is logged and resolves (never fails a save)", async () => {
    getDbWarmupConfig.mockRejectedValue(new Error("db down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { publishWarmupSchedule } = await import("@/lib/db-warmup-service");
    await expect(publishWarmupSchedule()).resolves.toEqual({ windows: 0 });
    expect(putWarmupSchedule).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("noOpeningHours is true only when no vendor has any weekly hours", async () => {
    const { computeWarmupPlan } = await import("@/lib/db-warmup-service");
    expect((await computeWarmupPlan()).noOpeningHours).toBe(false);
    fetchVendorProfile.mockResolvedValue({ weeklyHours: [], hoursOverrides: [] });
    expect((await computeWarmupPlan()).noOpeningHours).toBe(true);
  });
});
