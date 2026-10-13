import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireVendorRoleMock, updateMarkMock, revalidatePathMock, storage } = vi.hoisted(() => ({
  requireVendorRoleMock: vi.fn(),
  updateMarkMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  storage: {
    headObject: vi.fn(),
    deleteObject: vi.fn(),
    presignPut: vi.fn(),
  },
}));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: requireVendorRoleMock }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock, revalidateTag: vi.fn() }));
vi.mock("@/lib/storage", () => ({ getStorage: () => storage }));
vi.mock("@/lib/vendor-service", () => ({
  updateVendorStorefrontConfig: vi.fn(),
  applyVendorTheme: vi.fn(),
  updateVendorLogoKey: vi.fn(),
  updateVendorMarkKey: updateMarkMock,
}));

import { attachVendorMark, requestMarkUpload } from "@/features/admin/storefront";
import { MAX_IMAGE_BYTES } from "@/lib/product-image";

/** #1069 R3, R4 — the five files are attached together, or none of them is. */

const A = "a4ed0000-0000-4000-a000-000000000001";
const B = "5e1a0000-0000-4000-a000-000000000002";
const FOLDER = `vendors/${A}/mark-0b1c2d3e-4f50-4617-8899-aabbccddeeff`;
const KEY = `${FOLDER}/512.png`;
const NAMES = ["32.png", "180.png", "192.png", "512.png", "og.png"];
const PNG = { contentType: "image/png", contentLength: 1000 };

function heads(overrides: Record<string, { contentType: string; contentLength: number } | null>) {
  storage.headObject.mockImplementation(async (key: string) => {
    const name = key.split("/").pop()!;
    return name in overrides ? overrides[name] : PNG;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireVendorRoleMock.mockResolvedValue({ ok: true, vendorId: A });
});

describe("attachVendorMark", () => {
  it("refuses another vendor's key without touching storage", async () => {
    const result = await attachVendorMark(KEY.replace(A, B));
    expect(result).toEqual({ ok: false, error: "Invalid upload key." });
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(updateMarkMock).not.toHaveBeenCalled();
  });

  it("deletes exactly the four present files when og.png is missing, and writes nothing", async () => {
    heads({ "og.png": null });
    const result = await attachVendorMark(KEY);
    expect(result.ok).toBe(false);
    expect(storage.deleteObject.mock.calls.map(([k]) => k).sort()).toEqual(
      ["32.png", "180.png", "192.png", "512.png"].map((n) => `${FOLDER}/${n}`).sort(),
    );
    expect(updateMarkMock).not.toHaveBeenCalled();
  });

  it("deletes all five when one is not a PNG, and writes nothing", async () => {
    heads({ "192.png": { contentType: "image/webp", contentLength: 1000 } });
    const result = await attachVendorMark(KEY);
    expect(result).toEqual({ ok: false, error: "Images must be uploaded as PNG." });
    expect(storage.deleteObject).toHaveBeenCalledTimes(5);
    expect(updateMarkMock).not.toHaveBeenCalled();
  });

  it("deletes all five when one is over the size limit", async () => {
    heads({ "og.png": { contentType: "image/png", contentLength: MAX_IMAGE_BYTES + 1 } });
    const result = await attachVendorMark(KEY);
    expect(result.ok).toBe(false);
    expect(storage.deleteObject).toHaveBeenCalledTimes(5);
    expect(updateMarkMock).not.toHaveBeenCalled();
  });

  it("writes the key for the session's vendor and revalidates both paths", async () => {
    heads({});
    const result = await attachVendorMark(KEY);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(storage.headObject.mock.calls.map(([k]) => k).sort()).toEqual(
      NAMES.map((n) => `${FOLDER}/${n}`).sort(),
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(updateMarkMock).toHaveBeenCalledWith(A, KEY);
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff/storefront");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses a signed-out caller", async () => {
    requireVendorRoleMock.mockResolvedValue({ ok: false, status: 401 });
    const result = await attachVendorMark(KEY);
    expect(result.ok).toBe(false);
    expect(storage.headObject).not.toHaveBeenCalled();
  });
});

describe("requestMarkUpload", () => {
  const sizes = { icon32: 10, apple180: 10, icon192: 10, icon512: 10, og: 10 };

  it("presigns five PNG PUTs in one fresh folder and returns its 512.png key", async () => {
    storage.presignPut.mockImplementation(async (key: string) => `https://signed/${key}`);
    const result = await requestMarkUpload(sizes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.markStorageKey).toMatch(
      new RegExp(`^vendors/${A}/mark-[0-9a-f-]{36}/512\\.png$`),
    );
    const folder = result.value.markStorageKey.replace(/\/512\.png$/, "");
    expect(storage.presignPut).toHaveBeenCalledTimes(5);
    for (const [key, type] of storage.presignPut.mock.calls) {
      expect(key.startsWith(`${folder}/`)).toBe(true);
      expect(type).toBe("image/png");
    }
    expect(result.value.uploads.og).toBe(`https://signed/${folder}/og.png`);
  });

  it.each([
    ["zero", { ...sizes, og: 0 }],
    ["over the limit", { ...sizes, icon512: MAX_IMAGE_BYTES + 1 }],
    ["a fraction", { ...sizes, icon32: 1.5 }],
  ])("refuses a %s length and presigns nothing", async (_label, bad) => {
    const result = await requestMarkUpload(bad);
    expect(result.ok).toBe(false);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });
});
