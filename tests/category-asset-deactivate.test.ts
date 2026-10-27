import { beforeEach, describe, expect, it, vi } from "vitest";
import { deactivateCategoryAsset, selectCategoryAsset } from "@/lib/repositories/category-assets";
import { POST as deactivateHandler } from "@/app/api/admin/category-images/deactivate/route";

/**
 * #1288 R1-R3: an active category or slot asset can be switched back to inactive, and both the
 * select and deactivate writes run inside one interactive transaction.
 */

const mockRequireVendorRole = vi.fn();
const mockDeactivateForVendor = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: (...args: unknown[]) => mockRequireVendorRole(...args),
}));

vi.mock("@/lib/category-assets-service", () => ({
  deactivateCategoryAssetForVendor: (...args: unknown[]) => mockDeactivateForVendor(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

interface AssetRow {
  id: string;
  vendorId: string;
  categoryId: string | null;
  slot: string | null;
  storageKey: string;
  style: string;
  isSelected: boolean;
  createdAt: Date;
}

function row(overrides: Partial<AssetRow>): AssetRow {
  return {
    id: "asset-1",
    vendorId: "v1",
    categoryId: null,
    slot: null,
    storageKey: "icons/v1/storefront-abc.png",
    style: "3d-icon",
    isSelected: true,
    createdAt: new Date("2026-10-27T10:00:00Z"),
    ...overrides,
  };
}

/**
 * A WebSocket-client double whose `$transaction` hands the callback a SEPARATE `tx` object, so a test
 * can prove every write landed on `tx` and none on the outer client (R2).
 */
function makeClient(found: AssetRow | null) {
  const tx = {
    categoryAsset: {
      findFirst: vi.fn(async () => found),
      update: vi.fn(async ({ data }: { data: { isSelected: boolean } }) => ({
        ...(found as AssetRow),
        ...data,
        category: null,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    category: { update: vi.fn(async () => ({})) },
  };
  const outer = {
    $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    categoryAsset: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    category: { update: vi.fn() },
  };
  return { tx, outer };
}

function expectNoOuterWrites(outer: ReturnType<typeof makeClient>["outer"]) {
  expect(outer.categoryAsset.update).not.toHaveBeenCalled();
  expect(outer.categoryAsset.updateMany).not.toHaveBeenCalled();
  expect(outer.category.update).not.toHaveBeenCalled();
}

describe("deactivateCategoryAsset (#1288 R1, R2)", () => {
  it("switches a slot asset to inactive inside one transaction", async () => {
    const { tx, outer } = makeClient(row({ slot: "storefront" }));
    const result = await deactivateCategoryAsset(outer as never, "v1", "asset-1");

    expect(result.ok).toBe(true);
    expect(result.asset?.isSelected).toBe(false);
    expect(outer.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.categoryAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset-1" }, data: { isSelected: false } }),
    );
    expect(tx.category.update).not.toHaveBeenCalled();
    expectNoOuterWrites(outer);
  });

  it("clears the category's imageKey when deactivating a category asset", async () => {
    const { tx, outer } = makeClient(
      row({ categoryId: "cat-1", storageKey: "categories/v1/fruit.png" }),
    );
    const result = await deactivateCategoryAsset(outer as never, "v1", "asset-1");

    expect(result.ok).toBe(true);
    expect(tx.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1", vendorId: "v1" },
      data: { imageKey: null },
    });
    expectNoOuterWrites(outer);
  });

  it("is idempotent for an already-inactive asset", async () => {
    const { outer } = makeClient(row({ slot: "storefront", isSelected: false }));
    const result = await deactivateCategoryAsset(outer as never, "v1", "asset-1");

    expect(result.ok).toBe(true);
    expect(result.asset?.isSelected).toBe(false);
  });

  it("refuses an unknown or other vendor's asset and writes nothing", async () => {
    const { tx, outer } = makeClient(null);
    const result = await deactivateCategoryAsset(outer as never, "v1", "someone-elses");

    expect(result).toEqual({ ok: false, error: "Asset not found" });
    expect(tx.categoryAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "someone-elses", vendorId: "v1" },
    });
    expect(tx.categoryAsset.update).not.toHaveBeenCalled();
    expect(tx.category.update).not.toHaveBeenCalled();
    expectNoOuterWrites(outer);
  });
});

describe("selectCategoryAsset is atomic (#1288 R2)", () => {
  it("clears the previous slot selection and sets the new one on the transaction client", async () => {
    const { tx, outer } = makeClient(row({ slot: "storefront", isSelected: false }));
    const result = await selectCategoryAsset(outer as never, "v1", "asset-1");

    expect(result.ok).toBe(true);
    expect(outer.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.categoryAsset.updateMany).toHaveBeenCalledWith({
      where: { vendorId: "v1", slot: "storefront" },
      data: { isSelected: false },
    });
    expect(tx.categoryAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isSelected: true } }),
    );
    expectNoOuterWrites(outer);
  });

  it("updates the category imageKey on the transaction client", async () => {
    const { tx, outer } = makeClient(
      row({ categoryId: "cat-1", storageKey: "categories/v1/fruit.png", isSelected: false }),
    );
    await selectCategoryAsset(outer as never, "v1", "asset-1");

    expect(tx.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1", vendorId: "v1" },
      data: { imageKey: "categories/v1/fruit.png" },
    });
    expectNoOuterWrites(outer);
  });

  it("propagates a failed write so the transaction rolls back", async () => {
    const { tx, outer } = makeClient(row({ slot: "storefront", isSelected: false }));
    tx.categoryAsset.update.mockRejectedValueOnce(new Error("connection lost"));

    await expect(selectCategoryAsset(outer as never, "v1", "asset-1")).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("POST /api/admin/category-images/deactivate (#1288 R3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function request(body: unknown) {
    return new Request("http://localhost/api/admin/category-images/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("requires ADMIN and returns the refusal status", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({ ok: false, status: 403, reason: "forbidden" });
    const res = await deactivateHandler(request({ assetId: "asset-1" }));

    expect(mockRequireVendorRole).toHaveBeenCalledWith("ADMIN");
    expect(res.status).toBe(403);
    expect(mockDeactivateForVendor).not.toHaveBeenCalled();
  });

  it("returns 400 without an assetId", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({ ok: true, vendorId: "v1" });
    const res = await deactivateHandler(request({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing assetId" });
  });

  it("returns 404 when the repository finds no such asset", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({ ok: true, vendorId: "v1" });
    mockDeactivateForVendor.mockResolvedValueOnce({ ok: false, error: "Asset not found" });
    const res = await deactivateHandler(request({ assetId: "nope" }));

    expect(res.status).toBe(404);
  });

  it("returns 200 and revalidates every surface, including the category page", async () => {
    mockRequireVendorRole.mockResolvedValueOnce({ ok: true, vendorId: "v1" });
    const result = {
      ok: true,
      asset: { id: "asset-1", categoryId: "cat-1", slot: null, isSelected: false },
    };
    mockDeactivateForVendor.mockResolvedValueOnce(result);
    const res = await deactivateHandler(request({ assetId: "asset-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(mockDeactivateForVendor).toHaveBeenCalledWith("v1", "asset-1");
    const paths = mockRevalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/staff/categories",
        "/staff/categories/cat-1",
        "/staff/icons",
        "/categories",
        "/",
      ]),
    );
  });
});
