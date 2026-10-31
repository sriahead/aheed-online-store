import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCategoryImageKey, buildCategoryImagePrompt } from "@/lib/category-image";
import { imageExtensionForContentType } from "@/lib/product-image";
import { POST as generateHandler } from "@/app/api/admin/category-images/generate/route";
import { POST as backfillHandler } from "@/app/api/admin/category-images/backfill/route";

const PALETTE = { primary: "#123456", accent: "#abcdef" };

const mockRequireVendorRole = vi.fn();
const mockGenerateImage = vi.fn();
const mockFetchVendorProfile = vi.fn();
const mockGetCategoryForAdmin = vi.fn();
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
  getCategoryForAdmin: (...args: unknown[]) => mockGetCategoryForAdmin(...args),
}));

// The real pipeline's collaborators, for the #1288 R23 cases below (which load the actual module
// with vi.importActual, since the route cases above mock it).
vi.mock("@/lib/vendor-service", () => ({
  fetchVendorProfile: (...args: unknown[]) => mockFetchVendorProfile(...args),
}));
vi.mock("@/lib/image-generation", () => ({
  IMAGE_GENERATION_MODEL: "test-model",
  getImageGenerationService: () => ({ generateImage: mockGenerateImage }),
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    putObject: vi.fn(async () => {}),
    publicUrl: (key: string) => `https://cdn.example.com/${key}`,
  }),
}));
vi.mock("@/lib/db", () => ({ getPrismaWs: () => ({}) }));
vi.mock("@/lib/repositories/category-assets", () => ({
  createCategoryAsset: vi.fn(async () => ({ id: "asset-1" })),
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
      const prompt = buildCategoryImagePrompt("Fresh Produce", "photo", PALETTE);
      expect(prompt).toContain("Fresh Produce");
      expect(prompt).toContain("Commercial studio grocery photography");
      expect(prompt).toContain("genuine product photography");
    });

    it("builds prompt tailored for 3D rendered icon", () => {
      const prompt = buildCategoryImagePrompt("Treats & Snacks", "3d-icon", PALETTE);
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
      const json = (await res.json()) as any;
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
      const json = (await res.json()) as any;
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
      const json = (await res.json()) as any;
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
      const json = (await res.json()) as any;
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
      const json = (await res.json()) as any;
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
      const json = (await res.json()) as any;
      expect(json.processed).toBe(2);
      expect(json.totalRemaining).toBe(0);
      expect(mockRunCategoryImagePipeline).toHaveBeenCalledTimes(2);
    });
  });

  describe("pipelines prompt with the vendor's own palette (#1288 R23)", () => {
    const SRIMART_LIKE = { green: "#1d4ed8", orange: "#f97316" };
    const meter = {
      check: vi.fn(async () => ({ allowed: true })),
      recordImage: vi.fn(async () => {}),
    };

    beforeEach(() => {
      mockFetchVendorProfile.mockResolvedValue({ primitives: SRIMART_LIKE });
      mockGenerateImage.mockResolvedValue(new Uint8Array([1, 2, 3]));
      mockGetCategoryForAdmin.mockResolvedValue({
        id: "cat-1",
        name: "Chargers",
        slug: "chargers",
      });
    });

    it("runSlotAssetPipeline builds its prompt from fetchVendorProfile's primitives", async () => {
      const actual = await vi.importActual<typeof import("@/lib/category-image-pipeline")>(
        "@/lib/category-image-pipeline",
      );
      await actual.runSlotAssetPipeline("storefront", "3d-icon", "v-srimart", {
        aiMeter: meter as never,
      });
      expect(mockFetchVendorProfile).toHaveBeenCalledWith("v-srimart");
      const prompt = mockGenerateImage.mock.calls[0][0] as string;
      expect(prompt).toContain("#1d4ed8");
      expect(prompt).toContain("#f97316");
    });

    it("runCategoryImagePipeline builds its prompt from fetchVendorProfile's primitives", async () => {
      const actual = await vi.importActual<typeof import("@/lib/category-image-pipeline")>(
        "@/lib/category-image-pipeline",
      );
      await actual.runCategoryImagePipeline("cat-1", "photo", "v-srimart", {
        aiMeter: meter as never,
      });
      const prompt = mockGenerateImage.mock.calls[0][0] as string;
      expect(prompt).toContain("#1d4ed8");
      expect(prompt).toContain("#f97316");
    });
  });
});
