import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1134 — `/staff/storefront`'s marketing-consent switch action: ADMIN only, keyed on the
 * ADMIN's own vendor, and a refusal changes nothing.
 */

const requireVendorRole = vi.fn();
const setEnabled = vi.fn(async (_vendorId: string, _enabled: boolean) => 1);

vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: () => requireVendorRole() }));
vi.mock("@/lib/marketing-consent-service", () => ({
  getMarketingConsentRepository: () => ({ setEnabled }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveMarketingConsentSettings } = await import("@/features/admin/marketing-consent");
const { initialMarketingConsentSettingsState, MARKETING_CONSENT_ENABLED_FIELD } =
  await import("@/lib/marketing-consent-settings-form");

function form(on: boolean) {
  const data = new FormData();
  if (on) data.set(MARKETING_CONSENT_ENABLED_FIELD, "on");
  return data;
}

beforeEach(() => {
  requireVendorRole.mockReset();
  setEnabled.mockClear();
});

describe("saveMarketingConsentSettings", () => {
  it("refuses a non-ADMIN and writes nothing", async () => {
    requireVendorRole.mockResolvedValue({ ok: false, status: 403 });
    const state = await saveMarketingConsentSettings(
      initialMarketingConsentSettingsState,
      form(true),
    );
    expect(state.saved).toBe(false);
    expect(state.error).toBeTruthy();
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("saves the switch for the ADMIN's own vendor", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, vendorId: "vendor-a" });
    const on = await saveMarketingConsentSettings(initialMarketingConsentSettingsState, form(true));
    expect(on).toEqual({ error: null, saved: true });
    expect(setEnabled).toHaveBeenLastCalledWith("vendor-a", true);

    await saveMarketingConsentSettings(initialMarketingConsentSettingsState, form(false));
    expect(setEnabled).toHaveBeenLastCalledWith("vendor-a", false);
  });
});
