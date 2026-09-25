import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #889 R31/R32 at the header postcode control and the service: a failed count — whether the write
 * or the eligibility lookup fails — never changes what the shopper gets. `setDeliveryPostcode`
 * still sets the cookie and re-renders the layout.
 */

const m = vi.hoisted(() => ({
  record: vi.fn(),
  eligibility: vi.fn(),
  jarSet: vi.fn(),
  jarDelete: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/repositories/delivery-refusals", () => ({
  recordDeliveryRefusal: (...a: unknown[]) => m.record(...a),
}));
vi.mock("@/lib/delivery-eligibility-service", () => ({
  getDeliveryEligibility: (...a: unknown[]) => m.eligibility(...a),
}));
vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: async () => ({ id: "vendor-1", timezone: "Europe/London" }),
}));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})), getPrismaWs: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: m.jarSet, delete: m.jarDelete, get: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => m.revalidatePath(...a) }));

import { recordRefusalForPostcode, recordRefusalIfOutside } from "@/lib/delivery-refusals-service";
import { setDeliveryPostcode } from "@/features/storefront/delivery";

const OUTSIDE = {
  status: "OUTSIDE_DELIVERY_AREA" as const,
  postcode: "MK17 8NL",
  deliverable: false,
  verified: true,
  areaCovered: true,
};

function postcodeForm(postcode: string): FormData {
  const form = new FormData();
  form.set("postcode", postcode);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.eligibility.mockResolvedValue(OUTSIDE);
});

describe("the service swallows its own failures (R32)", () => {
  it("a failing write resolves and is logged", async () => {
    m.record.mockRejectedValue(new Error("db down"));
    await expect(recordRefusalIfOutside(OUTSIDE, "CHECKOUT")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("a failing eligibility lookup resolves and writes nothing", async () => {
    m.eligibility.mockRejectedValue(new Error("reference down"));
    await expect(recordRefusalForPostcode("MK17 8NL", "HEADER")).resolves.toBeUndefined();
    expect(m.record).not.toHaveBeenCalled();
  });

  it("a deliverable postcode records nothing", async () => {
    m.eligibility.mockResolvedValue({ ...OUTSIDE, status: "DELIVERABLE", deliverable: true });
    await recordRefusalForPostcode("MK9 2EA", "HEADER");
    expect(m.record).not.toHaveBeenCalled();
  });
});

describe("setDeliveryPostcode counts HEADER refusals (R31/R32)", () => {
  it("records HEADER for an out-of-area postcode", async () => {
    m.record.mockResolvedValue(undefined);
    await setDeliveryPostcode(postcodeForm("MK17 8NL"));
    expect(m.record).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "MK17",
      expect.any(Date),
      "HEADER",
    );
  });

  it("sets the cookie and re-renders exactly as before when the count fails", async () => {
    m.record.mockRejectedValue(new Error("db down"));
    await expect(setDeliveryPostcode(postcodeForm("MK17 8NL"))).resolves.toBeUndefined();
    expect(m.jarSet).toHaveBeenCalledTimes(1);
    expect(m.jarSet.mock.calls[0][0]).toBe("delivery-postcode");
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("clearing the postcode records nothing", async () => {
    await setDeliveryPostcode(postcodeForm(""));
    expect(m.jarDelete).toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });
});
