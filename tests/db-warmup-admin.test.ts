import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { parseDbWarmupForm } from "@/lib/db-warmup/form";

/**
 * #1491 R14 — the settings form is allow-listed field by field, saved only by a platform admin,
 * audited, and followed by a schedule republish.
 */

const requirePlatformAdmin = vi.fn();
vi.mock("@/lib/auth-rbac", () => ({ requirePlatformAdmin }));
const saveDbWarmupConfig = vi.fn(async () => ({}));
vi.mock("@/lib/repositories/db-warmup", () => ({ saveDbWarmupConfig }));
const publishWarmupSchedule = vi.fn(async () => ({ windows: 8 }));
vi.mock("@/lib/db-warmup-service", () => ({ publishWarmupSchedule }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));

const VALID = {
  enabled: "on",
  mode: "OPENING_HOURS",
  activityEnabled: "on",
  activityMinutes: "30",
  leadMinutes: "30",
  customStart: "",
  customEnd: "",
  computeUnits: "0.25",
  pricePerCuHour: "0.106",
};

function form(over: Record<string, string | undefined> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...VALID, ...over })) if (v !== undefined) f.set(k, v);
  return f;
}

describe("parseDbWarmupForm (#1491 R14)", () => {
  it("accepts the defaults and converts to integers", () => {
    const r = parseDbWarmupForm(form());
    expect(r).toEqual({
      ok: true,
      value: {
        enabled: true,
        mode: "OPENING_HOURS",
        activityEnabled: true,
        activityMinutes: 30,
        leadMinutes: 30,
        customStart: null,
        customEnd: null,
        computeMilliUnits: 250,
        priceMicroUsdPerCuHour: 106000,
      },
    });
  });

  it("unchecked boxes are false", () => {
    const r = parseDbWarmupForm(form({ enabled: undefined, activityEnabled: undefined }));
    expect(r.ok && r.value.enabled).toBe(false);
    expect(r.ok && r.value.activityEnabled).toBe(false);
  });

  it.each([
    [{ mode: "FOO" }, "mode"],
    [{ activityMinutes: "1" }, "activityMinutes"],
    [{ activityMinutes: "241" }, "activityMinutes"],
    [{ leadMinutes: "999" }, "leadMinutes"],
    [{ leadMinutes: "-5" }, "leadMinutes"],
    [{ customStart: "25:00" }, "customStart"],
    [{ mode: "CUSTOM", customStart: "20:00", customEnd: "08:00" }, "customEnd"],
    [{ mode: "CUSTOM", customStart: "", customEnd: "08:00" }, "customStart"],
    [{ computeUnits: "0" }, "computeUnits"],
    [{ computeUnits: "0.3" }, "computeUnits"],
    [{ computeUnits: "17" }, "computeUnits"],
    [{ pricePerCuHour: "0" }, "pricePerCuHour"],
    [{ pricePerCuHour: "abc" }, "pricePerCuHour"],
  ])("%o -> field error on %s", (over, field) => {
    const r = parseDbWarmupForm(form(over));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors[field as keyof typeof r.fieldErrors]).toBeTruthy();
  });

  it("CUSTOM with a valid window is accepted", () => {
    const r = parseDbWarmupForm(form({ mode: "CUSTOM", customStart: "07:00", customEnd: "21:00" }));
    expect(r.ok && r.value.customStart).toBe("07:00");
  });
});

describe("saveDbWarmupSettings (#1491 R14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("refuses anyone who is not a platform admin, without saving or publishing", async () => {
    requirePlatformAdmin.mockResolvedValue({ ok: false, status: 403, reason: "forbidden" });
    const { saveDbWarmupSettings } = await import("@/lib/db-warmup-admin-service");
    const r = await saveDbWarmupSettings(form());
    expect(r.status).toBe("error");
    expect(saveDbWarmupConfig).not.toHaveBeenCalled();
    expect(publishWarmupSchedule).not.toHaveBeenCalled();
  });

  it("an invalid field saves nothing and publishes nothing", async () => {
    requirePlatformAdmin.mockResolvedValue({ ok: true, user: { email: "pa@x.test" } });
    const { saveDbWarmupSettings } = await import("@/lib/db-warmup-admin-service");
    const r = await saveDbWarmupSettings(form({ leadMinutes: "999" }));
    expect(r.status).toBe("error");
    expect(saveDbWarmupConfig).not.toHaveBeenCalled();
    expect(publishWarmupSchedule).not.toHaveBeenCalled();
  });

  it("a valid save records updatedBy, then republishes", async () => {
    requirePlatformAdmin.mockResolvedValue({ ok: true, user: { email: "pa@x.test" } });
    const { saveDbWarmupSettings } = await import("@/lib/db-warmup-admin-service");
    expect(await saveDbWarmupSettings(form())).toEqual({ status: "saved" });
    expect(saveDbWarmupConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "OPENING_HOURS" }),
      "pa@x.test",
    );
    expect(publishWarmupSchedule).toHaveBeenCalledTimes(1);
    expect(saveDbWarmupConfig.mock.invocationCallOrder[0]).toBeLessThan(
      publishWarmupSchedule.mock.invocationCallOrder[0],
    );
  });

  it("the action file exports only async functions (no constants)", () => {
    const src = readFileSync("app/(admin)/staff/platform/db-warmup/actions.ts", "utf8");
    expect(src).not.toMatch(/^export const/m);
    expect(src).toMatch(/^"use server";/);
  });
});
