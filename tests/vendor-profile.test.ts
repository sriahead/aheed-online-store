import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchVendorProfile,
  listActiveVendorIds,
  DEFAULT_BRAND_PRIMITIVES,
  DEFAULT_SENDER_NAME,
  DEFAULT_SEARCH_PLACEHOLDER,
  DEFAULT_TIMEZONE,
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

/* ---- Scheduled sweep vendor enumeration (P9.2, #618) --------------------- */

describe("listActiveVendorIds", () => {
  const findMany = vi.fn();
  const client = { vendor: { findMany } } as unknown as Parameters<typeof listActiveVendorIds>[0];

  beforeEach(() => findMany.mockReset());

  it("returns only ACTIVE vendors' ids", async () => {
    findMany.mockResolvedValue([{ id: "v-aheed" }, { id: "v-srimart" }]);

    const ids = await listActiveVendorIds(client);

    // A SUSPENDED store's stranded orders are deliberately left alone: quietly
    // cancelling its customers' orders, or emailing confirmations on its behalf,
    // is a worse default than leaving them for whoever resolves the suspension.
    expect(findMany.mock.calls[0][0].where).toEqual({ status: "ACTIVE" });
    expect(ids).toEqual(["v-aheed", "v-srimart"]);
  });
});

/**
 * #363 — the vendor's timezone on the profile.
 *
 * This is the resolution path every `datetime-local` conversion and the checkout slot picker use,
 * so the fallback matters as much as the happy path: a vendor whose config satellite is unseeded
 * must still convert dates, in the zone every row in the system used before the column existed.
 */
describe("fetchVendorProfile timezone", () => {
  it("returns the configured zone", async () => {
    findUnique.mockResolvedValue({
      name: "SriMart",
      branding: null,
      config: { timezone: "Asia/Karachi" },
      deliveryAreas: [],
      vendorExpressSchedules: [],
    });

    const profile = await fetchVendorProfile(prisma, "v1");
    expect(profile.timezone).toBe("Asia/Karachi");
  });

  it("falls back to the platform default when there is no config row", async () => {
    findUnique.mockResolvedValue({
      name: "SriMart",
      branding: null,
      config: null,
      deliveryAreas: [],
      vendorExpressSchedules: [],
    });

    const profile = await fetchVendorProfile(prisma, "v1");
    expect(profile.timezone).toBe(DEFAULT_TIMEZONE);
    expect(profile.timezone).toBe("Europe/London");
  });
});
