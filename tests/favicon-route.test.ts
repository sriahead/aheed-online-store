import { beforeEach, describe, expect, it, vi } from "vitest";

const { profileMock, envMock } = vi.hoisted(() => ({
  profileMock: vi.fn(),
  envMock: vi.fn(),
}));
vi.mock("@/lib/vendor-service", () => ({ getCurrentVendorProfile: profileMock }));
vi.mock("@/lib/config", () => ({ getEnv: envMock }));

import { GET } from "@/app/favicon.ico/route";

/** #1069 R15 — `/favicon.ico` redirects to the vendor's 32px PNG, or is a 404. */

const CDN = "https://cdn.example.com";
const VENDOR = "a4ed0000-0000-4000-a000-000000000001";
const KEY = `vendors/${VENDOR}/mark-0b1c2d3e-4f50-4617-8899-aabbccddeeff/512.png`;

describe("GET /favicon.ico", () => {
  beforeEach(() => {
    profileMock.mockReset();
    envMock.mockReset();
    envMock.mockReturnValue({ CDN_BASE_URL: CDN });
  });

  it("302s to the vendor's 32.png with a five-minute public cache", async () => {
    profileMock.mockResolvedValue({ markStorageKey: KEY });
    const res = await GET();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${CDN}/${KEY.replace("512.png", "32.png")}`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("404s for a vendor without a mark", async () => {
    profileMock.mockResolvedValue({ markStorageKey: null });
    expect((await GET()).status).toBe(404);
  });

  it("404s on a host where no vendor resolves", async () => {
    profileMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });

  it("404s when CDN_BASE_URL is unset", async () => {
    profileMock.mockResolvedValue({ markStorageKey: KEY });
    envMock.mockReturnValue({ CDN_BASE_URL: undefined });
    expect((await GET()).status).toBe(404);
  });

  it("degrades to 404 when the profile read throws", async () => {
    profileMock.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(404);
  });
});
