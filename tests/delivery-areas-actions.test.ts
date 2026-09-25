import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #613 R10/R11 and #890 R26 — the delivery-area server actions' routing, with the repository and
 * auth mocked. What matters here is WHICH write path a submission takes (one value keeps the
 * original single-row create; two or more use the WebSocket-backed bulk insert), and that nothing
 * reaches the repository before the ADMIN check.
 */

const { requireVendorRoleMock, repo } = vi.hoisted(() => ({
  requireVendorRoleMock: vi.fn(),
  repo: {
    list: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    updateCharges: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: requireVendorRoleMock }));
vi.mock("@/lib/delivery-areas-service", () => ({ getDeliveryAreaRepository: () => repo }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { addDeliveryArea, updateDeliveryAreaCharges } from "@/features/admin/delivery-areas";
import { initialDeliveryAreaState } from "@/lib/delivery-area-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const NO_CHARGES = {
  deliveryFeePence: null,
  minimumOrderPence: null,
  freeDeliveryThresholdPence: null,
};

describe("addDeliveryArea (#613 R10/R11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorRoleMock.mockResolvedValue({ ok: true, vendorId: "vendor-1" });
    repo.create.mockResolvedValue({ ok: true, id: "a1" });
    repo.createMany.mockResolvedValue({ added: 10, alreadyListed: 0 });
  });

  it("one value uses the single-row create, not the bulk insert", async () => {
    const state = await addDeliveryArea(initialDeliveryAreaState, form({ prefix: "mk9" }));
    expect(repo.create).toHaveBeenCalledWith("MK9", NO_CHARGES);
    expect(repo.createMany).not.toHaveBeenCalled();
    expect(state).toEqual({ error: null, field: null, saved: true, message: null });
  });

  it("keeps the single-row duplicate error unchanged", async () => {
    repo.create.mockResolvedValue({
      ok: false,
      error: "That postcode area is already on the delivery list.",
      field: "prefix",
    });
    const state = await addDeliveryArea(initialDeliveryAreaState, form({ prefix: "MK1" }));
    expect(state.error).toBe("That postcode area is already on the delivery list.");
  });

  it("two or more values use the bulk insert and report counts", async () => {
    const state = await addDeliveryArea(initialDeliveryAreaState, form({ prefix: "MK1-MK10" }));
    expect(repo.createMany).toHaveBeenCalledWith(
      Array.from({ length: 10 }, (_, i) => `MK${i + 1}`),
      NO_CHARGES,
    );
    expect(repo.create).not.toHaveBeenCalled();
    expect(state.message).toBe("Added 10 delivery areas.");
  });

  it("applies the submitted charges to every district", async () => {
    await addDeliveryArea(
      initialDeliveryAreaState,
      form({ prefix: "MK1, MK2", deliveryFeePence: "5.99", minimumOrderPence: "30" }),
    );
    expect(repo.createMany).toHaveBeenCalledWith(["MK1", "MK2"], {
      deliveryFeePence: 599,
      minimumOrderPence: 3000,
      freeDeliveryThresholdPence: null,
    });
  });

  it("a malformed charge writes nothing", async () => {
    const state = await addDeliveryArea(
      initialDeliveryAreaState,
      form({ prefix: "MK1", deliveryFeePence: "-1" }),
    );
    expect(state.field).toBe("deliveryFeePence");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("an unauthorised caller reaches no repository call", async () => {
    requireVendorRoleMock.mockResolvedValue({ ok: false, status: 403 });
    const state = await addDeliveryArea(initialDeliveryAreaState, form({ prefix: "MK1-MK10" }));
    expect(state.error).toMatch(/permission/i);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createMany).not.toHaveBeenCalled();
  });
});

describe("updateDeliveryAreaCharges (#890 R26)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorRoleMock.mockResolvedValue({ ok: true, vendorId: "vendor-1" });
    repo.updateCharges.mockResolvedValue({ ok: true, id: "a1" });
  });

  it("saves the three values, blank meaning the store default", async () => {
    const state = await updateDeliveryAreaCharges(
      initialDeliveryAreaState,
      form({
        areaId: "a1",
        deliveryFeePence: "5.99",
        minimumOrderPence: "",
        freeDeliveryThresholdPence: "0",
      }),
    );
    expect(repo.updateCharges).toHaveBeenCalledWith("a1", {
      deliveryFeePence: 599,
      minimumOrderPence: null,
      freeDeliveryThresholdPence: 0,
    });
    expect(state.saved).toBe(true);
  });

  it("checks ADMIN before anything else", async () => {
    requireVendorRoleMock.mockResolvedValue({ ok: false, status: 403 });
    const state = await updateDeliveryAreaCharges(
      initialDeliveryAreaState,
      form({ areaId: "a1", deliveryFeePence: "abc" }),
    );
    expect(state.error).toMatch(/permission/i);
    expect(repo.updateCharges).not.toHaveBeenCalled();
  });
});
