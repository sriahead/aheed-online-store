import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCategoryImageKey, buildCategoryImagePrompt } from "@/lib/category-image";
import { imageExtensionForContentType } from "@/lib/product-image";
import { POST as generateHandler } from "@/app/api/admin/category-images/generate/route";
import { POST as backfillHandler } from "@/app/api/admin/category-images/backfill/route";

const mockRequireVendorRole = vi.fn();
const mockRunCategoryImagePipeline = vi.fn();
const mockListCategoriesForAdmin = vi.fn();

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: (...args: unknown[]) => mockRequireVendorRole(...args),
}));

vi.mock("@/lib/category-image-pipeline", () => ({
  runCategoryImagePipeline: (...args: unknown[]) => mockRunCategoryImagePipeline(...args),
}));

vi.mock("@/lib/categories-service", () => ({
  listCategoriesForAdmin: (...args: unknown[]) => mockListCategoriesForAdmin(...args),
}));

vi.mock("@/lib/ai-meter-service", () => ({
  getVendorAiMeter: vi.fn(() => ({
    check: vi.fn(async () => ({ allowed: true })),
    recordImage: vi.fn(async () => {}),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Category AI image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("lib/category-image key & prompt builders", () => {
    it("parses extensions accurately", () => {
      expect(imageExtensionForContentType("image/png")).toBe(".png");
      expect(imageExtensionForContentType("image/webp")).toBe(".webp");
      expect(imageExtensionForContentType("image/jpeg")).toBe(".jpg");
      expect(imageExtensionForContentType("image/unknown")).toBe(".bin");
    });

    it("builds consistent category image storage keys", () => {
      const key = buildCategoryImageKey("v123", "bakery-bread", "image/png");
      expect(key).toMatch(/^categories\/v123\/bakery-bread-[a-z0-9]+\.png$/);
    });

    it("builds prompt tailored for studio photography", () => {
      const prompt = buildCategoryImagePrompt("Fresh Produce", "photo");
      expect(prompt).toContain("Fresh Produce");
      expect(prompt).toContain("Commercial studio grocery photography");
      expect(prompt).toContain("genuine product photography");
    });

    it("builds prompt tailored for 3D rendered icon", () => {
      const prompt = buildCategoryImagePrompt("Treats & Snacks", "3d-icon");
      expect(prompt).toContain("Treats & Snacks");
      expect(prompt).toContain("3D rendered commercial app icon");
      expect(prompt).toContain("pure white background");
    });
  });

  describe("POST /api/admin/category-images/generate", () => {
    it("refuses unauthorized non-admin calls", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: false,
        status: 403,
        reason: "Forbidden",
      });

      const req = new Request("http://localhost/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: "c1" }),
      });

      const res = await generateHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden");
    });

    it("validates missing categoryId", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      const req = new Request("http://localhost/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await generateHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing categoryId");
    });

    it("handles budget refusal (429)", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      mockRunCategoryImagePipeline.mockResolvedValueOnce({
        budgetRefused: {
          allowed: false,
          scope: "vendor",
          usedNeurons: 3100,
          budgetNeurons: 3000,
        },
      });

      const req = new Request("http://localhost/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: "c1", style: "photo" }),
      });

      const res = await generateHandler(req);
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toContain("used its AI allowance for today");
    });

    it("succeeds and returns generated image key and url", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      mockRunCategoryImagePipeline.mockResolvedValueOnce({
        imageKey: "categories/v1/bakery-123.png",
        imageUrl: "https://assets.example.com/categories/v1/bakery-123.png",
      });

      const req = new Request("http://localhost/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: "c1", style: "3d-icon" }),
      });

      const res = await generateHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.imageKey).toBe("categories/v1/bakery-123.png");
      expect(json.imageUrl).toBe("https://assets.example.com/categories/v1/bakery-123.png");
    });
  });

  describe("POST /api/admin/category-images/backfill", () => {
    it("refuses unauthorized non-admin calls", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: false,
        status: 403,
        reason: "Forbidden",
      });

      const req = new Request("http://localhost/api/admin/category-images/backfill", {
        method: "POST",
      });

      const res = await backfillHandler(req);
      expect(res.status).toBe(403);
    });

    it("notifies when all categories have images", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      mockListCategoriesForAdmin.mockResolvedValueOnce([
        { id: "c1", name: "Bakery", imageKey: "categories/bakery.jpg" },
      ]);

      const req = new Request("http://localhost/api/admin/category-images/backfill", {
        method: "POST",
      });

      const res = await backfillHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.processed).toBe(0);
      expect(json.totalRemaining).toBe(0);
    });

    it("processes missing categories up to batch limit", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      mockListCategoriesForAdmin.mockResolvedValueOnce([
        { id: "c1", name: "Bakery", imageKey: "" },
        { id: "c2", name: "Drinks", imageKey: null },
      ]);

      mockRunCategoryImagePipeline.mockResolvedValue({
        imageKey: "key.png",
        imageUrl: "https://example.com/key.png",
      });

      const req = new Request("http://localhost/api/admin/category-images/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: "photo" }),
      });

      const res = await backfillHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.processed).toBe(2);
      expect(json.totalRemaining).toBe(0);
      expect(mockRunCategoryImagePipeline).toHaveBeenCalledTimes(2);
    });
  });
});
