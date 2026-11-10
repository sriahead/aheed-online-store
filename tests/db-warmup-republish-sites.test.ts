import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #1491 R7 — every opening-hours change republishes the warm-up schedule, after the write succeeds
 * and never after a failed one.
 */

const publishWarmupSchedule = vi.fn(async () => ({ windows: 1 }));
vi.mock("@/lib/db-warmup-service", () => ({ publishWarmupSchedule }));

const replaceVendorFooterHours = vi.fn();
const saveVendorHoursOverride = vi.fn();
const deleteVendorHoursOverride = vi.fn();
vi.mock("@/lib/repositories/vendor", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  replaceVendorFooterHours,
  saveVendorHoursOverride,
  deleteVendorHoursOverride,
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}), getPrismaWs: () => ({}) }));

const OVERRIDE = {
  date: "2026-12-25",
  label: "Christmas",
  openTime: null,
  closeTime: null,
  closed: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  replaceVendorFooterHours.mockResolvedValue(undefined);
  saveVendorHoursOverride.mockResolvedValue({ ok: true });
  deleteVendorHoursOverride.mockResolvedValue(undefined);
});

describe("republish after opening-hours writes (#1491 R7)", () => {
  it.each([
    [
      "replaceVendorFooterHours",
      () =>
        import("@/lib/vendor-service").then((m) =>
          m.replaceVendorFooterHours("v1", { weeklyHours: [], paymentBadges: [] }),
        ),
      replaceVendorFooterHours,
    ],
    [
      "saveVendorHoursOverride",
      () =>
        import("@/lib/vendor-service").then((m) =>
          m.saveVendorHoursOverride("v1", "2026-11-11", OVERRIDE),
        ),
      saveVendorHoursOverride,
    ],
    [
      "deleteVendorHoursOverride",
      () => import("@/lib/vendor-service").then((m) => m.deleteVendorHoursOverride("v1", "o1")),
      deleteVendorHoursOverride,
    ],
  ])("%s republishes after a successful write", async (_name, call, repo) => {
    await call();
    expect(repo).toHaveBeenCalledTimes(1);
    expect(publishWarmupSchedule).toHaveBeenCalledTimes(1);
    expect(repo.mock.invocationCallOrder[0]).toBeLessThan(
      publishWarmupSchedule.mock.invocationCallOrder[0],
    );
  });

  it("a failed write does not republish", async () => {
    replaceVendorFooterHours.mockRejectedValue(new Error("write failed"));
    const { replaceVendorFooterHours: wrapper } = await import("@/lib/vendor-service");
    await expect(wrapper("v1", { weeklyHours: [], paymentBadges: [] })).rejects.toThrow(
      "write failed",
    );
    expect(publishWarmupSchedule).not.toHaveBeenCalled();
  });
});
