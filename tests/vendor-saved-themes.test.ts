import { describe, expect, it, vi } from "vitest";
import {
  listVendorThemes,
  saveVendorTheme,
  applyThemeToVendor,
  listThemes,
} from "@/lib/repositories/vendor";
import { DEFAULT_BRAND_PRIMITIVES } from "@/lib/repositories/vendor";

function makeStub() {
  const themeFindMany = vi.fn(async () => [{ id: "global-1", brandGreen: "#111" }]);
  const themeFindUnique = vi.fn(async ({ where }: any) => {
    if (where.id === "global-1") return { id: "global-1", brandGreen: "#111" };
    return null;
  });

  const vendorThemeFindMany = vi.fn(async () => [
    { id: "vendor-1", name: "Custom", brandGreen: "#222" },
  ]);
  const vendorThemeCreate = vi.fn(async ({ data }: any) => ({ ...data, id: "vendor-new" }));

  const vendorBrandingUpdate = vi.fn(async () => ({}));

  const client = {
    theme: { findMany: themeFindMany, findUnique: themeFindUnique },
    vendorTheme: { findMany: vendorThemeFindMany, create: vendorThemeCreate },
    vendorBranding: { update: vendorBrandingUpdate },
  } as never;

  return {
    client,
    themeFindMany,
    themeFindUnique,
    vendorThemeFindMany,
    vendorThemeCreate,
    vendorBrandingUpdate,
  };
}

describe("Vendor saved themes", () => {
  const vendorAId = "v-A";

  it("global themes remain available as global presets", async () => {
    const { client, themeFindMany } = makeStub();
    const globals = await listThemes(client);
    expect(themeFindMany).toHaveBeenCalled();
    expect(globals.length).toBe(1);
    expect(globals[0].id).toBe("global-1");
  });

  it("vendor themes are visible only to their owning vendor", async () => {
    const { client, vendorThemeFindMany } = makeStub();
    await listVendorThemes(client, vendorAId);
    expect(vendorThemeFindMany).toHaveBeenCalledWith({
      where: { vendorId: vendorAId },
      orderBy: { name: "asc" },
    });
  });

  it("Vendor A applying global theme updates VendorBranding correctly", async () => {
    const { client, vendorBrandingUpdate, themeFindUnique } = makeStub();
    const result = await applyThemeToVendor(client, vendorAId, "global:global-1");

    expect(result.ok).toBe(true);
    expect(themeFindUnique).toHaveBeenCalledWith({ where: { id: "global-1" } });
    expect(vendorBrandingUpdate).toHaveBeenCalledWith({
      where: { vendorId: vendorAId },
      data: expect.objectContaining({ themeId: "global-1", brandGreen: "#111" }),
    });
  });

  it("Vendor A applying vendor theme updates VendorBranding correctly and clears themeId", async () => {
    const { client, vendorBrandingUpdate, vendorThemeFindMany } = makeStub();
    const result = await applyThemeToVendor(client, vendorAId, "vendor:vendor-1");

    expect(result.ok).toBe(true);
    expect(vendorThemeFindMany).toHaveBeenCalledWith({
      where: { id: "vendor-1", vendorId: vendorAId },
      take: 1,
    });
    // For vendor themes, themeId tracking should be cleared since it's not a global theme
    expect(vendorBrandingUpdate).toHaveBeenCalledWith({
      where: { vendorId: vendorAId },
      data: expect.objectContaining({ themeId: null, brandGreen: "#222" }),
    });
  });

  it("duplicate names are handled by Prisma (bubble up P2002 constraint error to frontend)", async () => {
    const { client, vendorThemeCreate } = makeStub();
    vendorThemeCreate.mockRejectedValue(Object.assign(new Error(), { code: "P2002" }));

    await expect(
      saveVendorTheme(client, vendorAId, "My Theme", DEFAULT_BRAND_PRIMITIVES),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("Vendor A cannot apply Vendor B's theme (enforced by vendorId filter on VendorTheme)", async () => {
    const { client, vendorThemeFindMany } = makeStub();
    // Simulate finding nothing when querying another vendor's theme
    vendorThemeFindMany.mockResolvedValueOnce([]);

    const result = await applyThemeToVendor(client, vendorAId, "vendor:foreign-id");

    expect(result.ok).toBe(false);
    expect(vendorThemeFindMany).toHaveBeenCalledWith({
      where: { id: "foreign-id", vendorId: vendorAId },
      take: 1,
    });
  });
});
