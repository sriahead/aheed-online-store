import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn(); // vendor.findUnique

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({ vendor: { findUnique } }),
}));

beforeEach(() => findUnique.mockReset());

describe("fetchVendorProfile", () => {
  it("maps the branding primitives, config and delivery prefixes", async () => {
    findUnique.mockResolvedValue({
      name: "SriMart",
      branding: {
        name: "SriMart",
        tagline: "Everyday tech",
        logoStorageKey: null,
        brandGreenDark: "#0d47a1",
        brandGreen: "#1e88e5",
        brandOrange: "#8e24aa",
        brandRed: "#c62828",
        brandCream: "#eef2f8",
        brandGreenTint: "#e3f2fd",
        brandOrangeTint: "#f3e5f5",
        brandRedTint: "#ffebee",
      },
      config: {
        localityName: "Reading",
        senderName: "SriMart",
        senderEmail: "orders@srimart.test",
        searchPlaceholder: "Search chargers, earbuds, lamps…",
      },
      deliveryAreas: [{ prefix: "RG" }],
    });
    const { fetchVendorProfile } = await import("@/lib/repositories/vendor");

    const p = await fetchVendorProfile("v-srimart");
    expect(p.name).toBe("SriMart");
    expect(p.tagline).toBe("Everyday tech");
    expect(p.logoStorageKey).toBeNull();
    expect(p.primitives["green-dark"]).toBe("#0d47a1");
    expect(p.primitives["orange-tint"]).toBe("#f3e5f5");
    expect(p.localityName).toBe("Reading");
    expect(p.senderName).toBe("SriMart");
    expect(p.searchPlaceholder).toBe("Search chargers, earbuds, lamps…");
    expect(p.deliveryPrefixes).toEqual(["RG"]);
  });

  it("falls back to the Aheed default primitives/sender when satellites are missing", async () => {
    findUnique.mockResolvedValue({
      name: "New Vendor",
      branding: null,
      config: null,
      deliveryAreas: [],
    });
    const {
      fetchVendorProfile,
      DEFAULT_BRAND_PRIMITIVES,
      DEFAULT_SENDER_NAME,
      DEFAULT_SEARCH_PLACEHOLDER,
    } = await import("@/lib/repositories/vendor");

    const p = await fetchVendorProfile("v-new");
    expect(p.name).toBe("New Vendor"); // vendor.name when no branding row
    expect(p.tagline).toBeNull();
    expect(p.primitives).toEqual(DEFAULT_BRAND_PRIMITIVES);
    expect(p.senderName).toBe(DEFAULT_SENDER_NAME);
    expect(p.searchPlaceholder).toBe(DEFAULT_SEARCH_PLACEHOLDER);
    expect(p.deliveryPrefixes).toEqual([]);
  });
});
