import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchVendorProfile,
  DEFAULT_BRAND_PRIMITIVES,
  DEFAULT_SENDER_NAME,
  DEFAULT_SEARCH_PLACEHOLDER,
} from "@/lib/repositories/vendor";

const findUnique = vi.fn(); // vendor.findUnique

/**
 * The stub client, passed in as an argument (#411).
 *
 * This test used to `vi.mock("@/lib/db")` and load the module under test with a
 * dynamic `await import()` so the mock was registered first — the only way to
 * substitute a client for a function that resolved its own. Now that
 * `fetchVendorProfile` takes one as a parameter, the module mock and the dynamic
 * import are both unnecessary: the stub goes in through the front door.
 *
 * The cast is because the stub implements only the one method this function
 * calls, which is the point of a stub. #390 tracks branding the client types.
 */
const prisma = { vendor: { findUnique } } as unknown as Parameters<typeof fetchVendorProfile>[0];

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

    const p = await fetchVendorProfile(prisma, "v-srimart");
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

    const p = await fetchVendorProfile(prisma, "v-new");
    expect(p.name).toBe("New Vendor"); // vendor.name when no branding row
    expect(p.tagline).toBeNull();
    expect(p.primitives).toEqual(DEFAULT_BRAND_PRIMITIVES);
    expect(p.senderName).toBe(DEFAULT_SENDER_NAME);
    expect(p.searchPlaceholder).toBe(DEFAULT_SEARCH_PLACEHOLDER);
    expect(p.deliveryPrefixes).toEqual([]);
  });
});
