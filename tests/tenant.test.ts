import { describe, it, expect, vi, beforeEach } from "vitest";

let currentHost = "";
const findUnique = vi.fn(); // vendorDomain.findUnique
const findMany = vi.fn(); // vendor.findMany
const findFirst = vi.fn(); // vendor.findFirst

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(currentHost ? { host: currentHost } : {})),
}));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    vendorDomain: { findUnique },
    vendor: { findMany, findFirst },
  }),
}));

beforeEach(() => {
  currentHost = "";
  findUnique.mockReset();
  findMany.mockReset();
  findFirst.mockReset();
});

describe("getCurrentVendorIdOrNull", () => {
  it("resolves an exact host match (port stripped, lowercased)", async () => {
    currentHost = "SriMart-Staging.nocaped.com:443";
    findUnique.mockResolvedValue({ vendorId: "v-srimart" });
    const { getCurrentVendorIdOrNull } = await import("@/lib/tenant");

    expect(await getCurrentVendorIdOrNull()).toBe("v-srimart");
    expect(findUnique).toHaveBeenCalledWith({
      where: { host: "srimart-staging.nocaped.com" },
      select: { vendorId: true },
    });
  });

  it("falls back to the sole active vendor when the host doesn't match", async () => {
    currentHost = "unknown.example.com";
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: "v-aheed" }]);
    const { getCurrentVendorIdOrNull } = await import("@/lib/tenant");

    expect(await getCurrentVendorIdOrNull()).toBe("v-aheed");
  });

  it("returns null on no match when 2+ active vendors exist", async () => {
    currentHost = "unknown.example.com";
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: "v-aheed" }, { id: "v-srimart" }]);
    const { getCurrentVendorIdOrNull } = await import("@/lib/tenant");

    expect(await getCurrentVendorIdOrNull()).toBeNull();
  });
});

describe("getCurrentVendorId", () => {
  it("throws when the host can't be resolved", async () => {
    currentHost = "unknown.example.com";
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const { getCurrentVendorId } = await import("@/lib/tenant");

    await expect(getCurrentVendorId()).rejects.toThrow(/No vendor resolved/);
  });
});

describe("getDefaultVendorCanonicalHost", () => {
  it("returns the oldest active vendor's canonical host", async () => {
    findFirst.mockResolvedValue({ domains: [{ host: "aheedfoodcentre.nocaped.com" }] });
    const { getDefaultVendorCanonicalHost } = await import("@/lib/tenant");

    expect(await getDefaultVendorCanonicalHost()).toBe("aheedfoodcentre.nocaped.com");
  });

  it("returns null when there is no canonical domain", async () => {
    findFirst.mockResolvedValue(null);
    const { getDefaultVendorCanonicalHost } = await import("@/lib/tenant");

    expect(await getDefaultVendorCanonicalHost()).toBeNull();
  });
});
