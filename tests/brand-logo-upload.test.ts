import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as uploadLogoHandler } from "@/app/api/admin/brands/upload-logo/route";

const mockRequireVendorRole = vi.fn();
const mockIngestBrandLogo = vi.fn();
const mockIngestBrandLogoFromUrl = vi.fn();

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: (...args: unknown[]) => mockRequireVendorRole(...args),
}));

vi.mock("@/lib/category-image-pipeline", () => ({
  ingestBrandLogo: (...args: unknown[]) => mockIngestBrandLogo(...args),
  ingestBrandLogoFromUrl: (...args: unknown[]) => mockIngestBrandLogoFromUrl(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("POST /api/admin/brands/upload-logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated or non-admin callers", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "Forbidden",
    });

    const req = new Request("http://localhost/api/admin/brands/upload-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "b1", url: "https://example.com/logo.png" }),
    });

    const res = await uploadLogoHandler(req);
    expect(res.status).toBe(403);
    const data = (await res.json()) as any;
    expect(data.error).toBe("Forbidden");
  });

  it("rejects JSON requests missing brandId", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({
      ok: true,
      vendorId: "v1",
    });

    const req = new Request("http://localhost/api/admin/brands/upload-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/logo.png" }),
    });

    const res = await uploadLogoHandler(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toBe("Missing brandId");
  });

  it("rejects JSON requests missing url", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({
      ok: true,
      vendorId: "v1",
    });

    const req = new Request("http://localhost/api/admin/brands/upload-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "b1" }),
    });

    const res = await uploadLogoHandler(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toBe("Missing image URL");
  });

  it("handles successful logo import from URL", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({
      ok: true,
      vendorId: "v1",
    });
    mockIngestBrandLogoFromUrl.mockResolvedValueOnce({
      ok: true,
      imageKey: "brands/v1/trs-123.png",
      imageUrl: "https://cdn.example.com/brands/v1/trs-123.png",
      asset: { id: "asset-1" },
    });

    const req = new Request("http://localhost/api/admin/brands/upload-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "b1", url: "https://example.com/trs.png" }),
    });

    const res = await uploadLogoHandler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.imageKey).toBe("brands/v1/trs-123.png");
    expect(mockIngestBrandLogoFromUrl).toHaveBeenCalledWith(
      "b1",
      "v1",
      "https://example.com/trs.png",
    );
  });

  it("returns 400 when ingestBrandLogoFromUrl returns an error", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({
      ok: true,
      vendorId: "v1",
    });
    mockIngestBrandLogoFromUrl.mockResolvedValueOnce({
      error: "Cannot import images from internal or loopback addresses.",
    });

    const req = new Request("http://localhost/api/admin/brands/upload-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "b1", url: "http://127.0.0.1/logo.png" }),
    });

    const res = await uploadLogoHandler(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toBe("Cannot import images from internal or loopback addresses.");
  });

  it("handles successful logo upload via multipart/form-data", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({
      ok: true,
      vendorId: "v1",
    });
    mockIngestBrandLogo.mockResolvedValueOnce({
      ok: true,
      imageKey: "brands/v1/trs-uploaded.png",
      imageUrl: "https://cdn.example.com/brands/v1/trs-uploaded.png",
      asset: { id: "asset-2" },
    });

    const formData = new FormData();
    formData.append("brandId", "b1");
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/png" });
    formData.append("file", fakeBlob, "trs.png");

    const req = new Request("http://localhost/api/admin/brands/upload-logo", {
      method: "POST",
      body: formData,
    });

    const res = await uploadLogoHandler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.imageKey).toBe("brands/v1/trs-uploaded.png");
    expect(mockIngestBrandLogo).toHaveBeenCalledWith(
      "b1",
      "v1",
      expect.any(ArrayBuffer),
      "image/png",
    );
  });
});
