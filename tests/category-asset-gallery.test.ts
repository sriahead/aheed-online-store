import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSlotAssetKey, buildSlotAssetPrompt } from "@/lib/category-image";
import {
  listCategoryAssets,
  createCategoryAsset,
  selectCategoryAsset,
  deleteCategoryAsset,
  getActiveSlotAssetsMap,
} from "@/lib/repositories/category-assets";
import {
  GET as getAssetsHandler,
  DELETE as deleteAssetHandler,
} from "@/app/api/admin/category-images/assets/route";
import { POST as selectAssetHandler } from "@/app/api/admin/category-images/select/route";
import { POST as generateHandler } from "@/app/api/admin/category-images/generate/route";

const mockRequireVendorRole = vi.fn();
const mockRunCategoryImagePipeline = vi.fn();
const mockRunSlotAssetPipeline = vi.fn();
const mockStorageDelete = vi.fn();
const mockGetVendorAiMeter = vi.fn(() => ({
  check: vi.fn(async () => ({ allowed: true })),
  recordImage: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai-meter-service", () => ({
  getVendorAiMeter: (...args: unknown[]) => mockGetVendorAiMeter(...(args as [])),
}));

const mockPrismaDb = {
  categoryAsset: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  category: {
    update: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  getPrisma: () => mockPrismaDb,
  getPrismaWs: () => mockPrismaDb,
}));

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: (...args: unknown[]) => mockRequireVendorRole(...args),
}));

vi.mock("@/lib/category-image-pipeline", () => ({
  runCategoryImagePipeline: (...args: unknown[]) => mockRunCategoryImagePipeline(...args),
  runSlotAssetPipeline: (...args: unknown[]) => mockRunSlotAssetPipeline(...args),
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    publicUrl: (key: string) => `https://cdn.example.com/${key}`,
    deleteObject: (...args: unknown[]) => mockStorageDelete(...args),
  }),
  composePublicUrl: (baseUrl: string, key: string) =>
    `${baseUrl.replace(/\/$/, "")}/${key.replace(/^\//, "")}`,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Category & UI System Icon Asset Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("lib/category-image slot helpers", () => {
    it("builds consistent slot asset storage keys", () => {
      const key = buildSlotAssetKey("vendor-1", "delivery-van", "image/png");
      expect(key).toMatch(/^icons\/vendor-1\/delivery-van-[a-z0-9]+\.png$/);
    });

    it("builds custom slot prompts tailored for 3D system icons", () => {
      const prompt = buildSlotAssetPrompt("delivery-van", "3d-icon", {
        primary: "#123456",
        accent: "#abcdef",
      });
      expect(prompt).toContain("delivery van");
      expect(prompt).toContain("3D rendered UI app icon");
      expect(prompt).toContain("pure white background");
    });
  });

  describe("lib/repositories/category-assets", () => {
    it("creates an asset and activates it for a category", async () => {
      const mockPrismaWs = {
        categoryAsset: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({
            id: "asset-1",
            vendorId: "v1",
            categoryId: "cat-1",
            slot: null,
            storageKey: "categories/v1/cat-1.png",
            style: "photo",
            isSelected: true,
            createdAt: new Date(),
            category: { id: "cat-1", name: "Fresh Food", slug: "fresh-food" },
          }),
        },
        category: {
          update: vi.fn().mockResolvedValue({}),
        },
      } as any;

      const created = await createCategoryAsset(mockPrismaWs, "v1", {
        categoryId: "cat-1",
        storageKey: "categories/v1/cat-1.png",
        style: "photo",
        isSelected: true,
      });

      expect(created.id).toBe("asset-1");
      expect(created.isSelected).toBe(true);
      expect(mockPrismaWs.categoryAsset.updateMany).toHaveBeenCalledWith({
        where: { vendorId: "v1", categoryId: "cat-1" },
        data: { isSelected: false },
      });
      expect(mockPrismaWs.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1", vendorId: "v1" },
        data: { imageKey: "categories/v1/cat-1.png" },
      });
    });

    it("lists assets scoped by vendorId, categoryId, and slot", async () => {
      const mockPrisma = {
        categoryAsset: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "asset-1",
              vendorId: "v1",
              categoryId: "cat-1",
              slot: null,
              storageKey: "categories/v1/fresh.png",
              style: "photo",
              isSelected: true,
              createdAt: new Date(),
              category: { id: "cat-1", name: "Fresh Food", slug: "fresh-food" },
            },
          ]),
        },
      } as any;

      const assets = await listCategoryAssets(mockPrisma, "v1", {
        categoryId: "cat-1",
      });

      expect(assets).toHaveLength(1);
      expect(assets[0].id).toBe("asset-1");
      expect(mockPrisma.categoryAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vendorId: "v1", categoryId: "cat-1" },
        }),
      );
    });

    it("selects an asset and updates category imageKey", async () => {
      const mockPrismaWs = {
        categoryAsset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "asset-2",
            vendorId: "v1",
            categoryId: "cat-1",
            slot: null,
            storageKey: "categories/v1/fresh-2.png",
            style: "3d-icon",
            isSelected: false,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({
            id: "asset-2",
            vendorId: "v1",
            categoryId: "cat-1",
            slot: null,
            storageKey: "categories/v1/fresh-2.png",
            style: "3d-icon",
            isSelected: true,
            createdAt: new Date(),
            category: { id: "cat-1", name: "Fresh Food", slug: "fresh-food" },
          }),
        },
        category: {
          update: vi.fn().mockResolvedValue({}),
        },
      } as any;
      // #1288 R2: every write runs inside one interactive transaction.
      mockPrismaWs.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(mockPrismaWs));

      const res = await selectCategoryAsset(mockPrismaWs, "v1", "asset-2");
      expect(mockPrismaWs.$transaction).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(true);
      expect(res.asset?.isSelected).toBe(true);
      expect(mockPrismaWs.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1", vendorId: "v1" },
        data: { imageKey: "categories/v1/fresh-2.png" },
      });
    });

    it("deletes an asset and falls back to previous candidate if active", async () => {
      const mockPrismaWs = {
        categoryAsset: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: "asset-active",
              vendorId: "v1",
              categoryId: "cat-1",
              slot: null,
              storageKey: "categories/v1/active.png",
              isSelected: true,
            })
            .mockResolvedValueOnce({
              id: "asset-fallback",
              vendorId: "v1",
              categoryId: "cat-1",
              slot: null,
              storageKey: "categories/v1/fallback.png",
              isSelected: false,
            }),
          delete: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        category: {
          update: vi.fn().mockResolvedValue({}),
        },
      } as any;

      const res = await deleteCategoryAsset(mockPrismaWs, "v1", "asset-active");
      expect(res.ok).toBe(true);
      expect(res.wasSelected).toBe(true);
      expect(mockPrismaWs.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1", vendorId: "v1" },
        data: { imageKey: "categories/v1/fallback.png" },
      });
    });
  });

  describe("API Endpoints", () => {
    it("GET /api/admin/category-images/assets enforces authentication", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: false,
        status: 401,
        reason: "Unauthorized",
      });

      const req = new Request("http://localhost/api/admin/category-images/assets");
      const res = await getAssetsHandler(req);
      expect(res.status).toBe(401);
    });

    it("DELETE /api/admin/category-images/assets deletes asset and storage object", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      mockPrismaDb.categoryAsset.findFirst.mockResolvedValueOnce({
        id: "asset-del",
        vendorId: "v1",
        categoryId: null,
        slot: "delivery-van",
        storageKey: "icons/v1/delivery-van.png",
        isSelected: false,
      });
      mockPrismaDb.categoryAsset.delete.mockResolvedValueOnce({});

      const req = new Request("http://localhost/api/admin/category-images/assets?id=asset-del", {
        method: "DELETE",
      });

      const res = await deleteAssetHandler(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.deletedId).toBe("asset-del");
      expect(mockStorageDelete).toHaveBeenCalledWith("icons/v1/delivery-van.png");
    });

    it("POST /api/admin/category-images/select validates missing assetId", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      const req = new Request("http://localhost/api/admin/category-images/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await selectAssetHandler(req);
      expect(res.status).toBe(400);
    });

    it("POST /api/admin/category-images/generate rejects an unknown slot before any AI work (#1288 R10)", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({ ok: true, vendorId: "v1" });
      const req = new Request("http://localhost/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: "not-a-slot", style: "3d-icon" }),
      });

      const res = await generateHandler(req);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Unknown slot" });
      expect(mockGetVendorAiMeter).not.toHaveBeenCalled();
      expect(mockRunSlotAssetPipeline).not.toHaveBeenCalled();
    });

    it.each(["icon:package", "postcode-search"])(
      "POST /api/admin/category-images/generate accepts registered slot %s (#1288 R10)",
      async (slot) => {
        mockRequireVendorRole.mockResolvedValueOnce({ ok: true, vendorId: "v1" });
        mockRunSlotAssetPipeline.mockResolvedValueOnce({
          imageKey: "icons/v1/x.png",
          imageUrl: "https://cdn.example.com/icons/v1/x.png",
        });
        const req = new Request("http://localhost/api/admin/category-images/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot, style: "3d-icon" }),
        });

        const res = await generateHandler(req);
        expect(res.status).toBe(200);
        expect(mockRunSlotAssetPipeline).toHaveBeenCalledWith(
          slot,
          "3d-icon",
          "v1",
          expect.anything(),
        );
      },
    );

    it("POST /api/admin/category-images/generate supports slot generation", async () => {
      mockRequireVendorRole.mockResolvedValueOnce({
        ok: true,
        vendorId: "v1",
      });

      mockRunSlotAssetPipeline.mockResolvedValueOnce({
        imageKey: "icons/v1/delivery-van.png",
        imageUrl: "https://cdn.example.com/icons/v1/delivery-van.png",
        asset: {
          id: "slot-asset-1",
          vendorId: "v1",
          slot: "delivery-van",
          storageKey: "icons/v1/delivery-van.png",
          style: "3d-icon",
          isSelected: true,
          createdAt: new Date().toISOString(),
        },
      });

      const req = new Request("http://localhost/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: "delivery-van", style: "3d-icon" }),
      });

      const res = await generateHandler(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.imageKey).toBe("icons/v1/delivery-van.png");
      expect(mockRunSlotAssetPipeline).toHaveBeenCalledWith(
        "delivery-van",
        "3d-icon",
        "v1",
        expect.anything(),
      );
    });

    it("retrieves active slot assets map with public URLs and aliases", async () => {
      mockPrismaDb.categoryAsset.findMany.mockResolvedValueOnce([
        { slot: "storefront", storageKey: "icons/v1/storefront.png" },
        { slot: "cart-floating", storageKey: "icons/v1/cart.png" },
      ]);

      const map = await getActiveSlotAssetsMap(
        mockPrismaDb as any,
        "v1",
        "https://cdn.example.com",
      );

      expect(map["storefront"]).toBe("https://cdn.example.com/icons/v1/storefront.png");
      expect(map["cart-floating"]).toBe("https://cdn.example.com/icons/v1/cart.png");
      // Alias cart-add automatically mirrors cart-floating
      expect(map["cart-add"]).toBe("https://cdn.example.com/icons/v1/cart.png");
    });
  });
});
