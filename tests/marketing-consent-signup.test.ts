import { describe, expect, it, vi } from "vitest";
import { recordSignUpMarketingConsent } from "@/lib/marketing-consent-signup";
import {
  marketingConsentStatement,
  MARKETING_OPT_IN_FIELD,
  SIGN_UP_EMAIL_PATH,
} from "@/lib/marketing-consent";

/**
 * #1134 — the Better Auth user-create hook body: writes one REGISTRATION grant only when the
 * decision says so, never fails the sign-up, and reports a failed write as an ErrorEvent.
 */

const VENDOR = { id: "vendor-a", name: "Test Store", marketingConsentEnabled: true };
const OPTED_IN = { path: SIGN_UP_EMAIL_PATH, body: { [MARKETING_OPT_IN_FIELD]: true } };

function deps(overrides: Partial<Parameters<typeof recordSignUpMarketingConsent>[2]> = {}) {
  return {
    resolveVendor: vi.fn(async () => VENDOR),
    record: vi.fn(async () => {}),
    reportError: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("recordSignUpMarketingConsent", () => {
  it("records one grant for the resolved vendor with the server-built statement", async () => {
    const d = deps();
    await recordSignUpMarketingConsent("user-1", OPTED_IN, d);
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(d.record).toHaveBeenCalledWith(
      "vendor-a",
      "user-1",
      marketingConsentStatement("Test Store"),
    );
    expect(d.reportError).not.toHaveBeenCalled();
  });

  it("writes nothing, and reads no vendor, for a sign-up without the flag or a null context", async () => {
    for (const context of [{ path: SIGN_UP_EMAIL_PATH, body: {} }, null, undefined]) {
      const d = deps();
      await recordSignUpMarketingConsent("user-1", context, d);
      expect(d.record).not.toHaveBeenCalled();
      expect(d.resolveVendor).not.toHaveBeenCalled();
    }
  });

  it("writes nothing when the store's switch is off", async () => {
    const d = deps({
      resolveVendor: vi.fn(async () => ({ ...VENDOR, marketingConsentEnabled: false })),
    });
    await recordSignUpMarketingConsent("user-1", OPTED_IN, d);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("does not throw when the write fails, and records the failure once", async () => {
    const d = deps({
      record: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(recordSignUpMarketingConsent("user-1", OPTED_IN, d)).resolves.toBeUndefined();
    expect(d.reportError).toHaveBeenCalledTimes(1);
    expect(d.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("db down") }),
    );
  });

  it("does not throw even when reporting the failure also fails", async () => {
    const d = deps({
      record: vi.fn(async () => {
        throw new Error("db down");
      }),
      reportError: vi.fn(async () => {
        throw new Error("still down");
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordSignUpMarketingConsent("user-1", OPTED_IN, d)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
