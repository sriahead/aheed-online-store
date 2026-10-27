// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconGalleryClient } from "@/components/staff/IconGalleryClient";
import {
  CategoryImageManager,
  type CategoryAssetItem,
} from "@/components/staff/CategoryImageManager";
import { FLAT_ICON_SLOTS, ICON_3D_SLOTS } from "@/lib/icon-slots";

/** #1288 R4, R5, R7, R9: deactivate in the gallery and category manager; STAFF read-only; slot picker. */

afterEach(cleanup);

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function asset(overrides: Partial<CategoryAssetItem>): CategoryAssetItem {
  return {
    id: "a1",
    vendorId: "v1",
    categoryId: null,
    slot: "storefront",
    storageKey: "icons/v1/storefront-abc.png",
    style: "3d-icon",
    isSelected: true,
    createdAt: "2026-10-27T10:00:00.000Z",
    imageUrl: "https://cdn.example.com/icons/v1/storefront-abc.png",
    ...overrides,
  } as CategoryAssetItem;
}

function ok(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const CATEGORIES = [{ id: "cat-1", name: "Bakery", slug: "bakery" }];

describe("IconGalleryClient (#1288 R4, R7, R9)", () => {
  it("R4: deactivates the active asset from its card without a reload", async () => {
    fetchMock.mockImplementation(() => ok({ ok: true, asset: { id: "a1", isSelected: false } }));
    render(<IconGalleryClient initialAssets={[asset({})]} categories={CATEGORIES} canManage />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/category-images/deactivate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ assetId: "a1" }) }),
    );
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
    expect(screen.getByRole("button", { name: "Activate" })).not.toBeNull();
    expect(screen.queryByText("Active", { selector: "span" })).toBeNull();
  });

  it("R4: deactivates from the preview modal", async () => {
    fetchMock.mockImplementation(() => ok({ ok: true }));
    render(<IconGalleryClient initialAssets={[asset({})]} categories={CATEGORIES} canManage />);

    fireEvent.click(screen.getByTitle("Click to preview full asset"));
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate Asset" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/category-images/deactivate",
      expect.objectContaining({ body: JSON.stringify({ assetId: "a1" }) }),
    );
    expect(within(screen.getByRole("dialog")).getByText("Candidate")).not.toBeNull();
  });

  it("R7: STAFF sees the library read-only", () => {
    render(
      <IconGalleryClient
        initialAssets={[asset({}), asset({ id: "a2", isSelected: false })]}
        categories={CATEGORIES}
        canManage={false}
      />,
    );
    expect(screen.getByText("Only an admin can generate or change visual assets.")).not.toBeNull();
    for (const name of [/Generate/, /^Activate/, /^Deactivate/, /Delete/]) {
      expect(screen.queryByRole("button", { name }), String(name)).toBeNull();
    }
  });

  it("R7: ADMIN sees generate, activate, deactivate and delete", () => {
    render(
      <IconGalleryClient
        initialAssets={[asset({}), asset({ id: "a2", isSelected: false })]}
        categories={CATEGORIES}
        canManage
      />,
    );
    expect(screen.getByRole("button", { name: /Generate/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Activate" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Deactivate" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Delete asset" }).length).toBe(2);
    expect(screen.queryByText("Only an admin can generate or change visual assets.")).toBeNull();
  });

  it("R9: the slot picker lists every registry slot in two groups", () => {
    render(<IconGalleryClient initialAssets={[]} categories={CATEGORIES} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "System Icon" }));

    const select = document.getElementById("quick-gen-target-select")!;
    const groups = [...select.querySelectorAll("optgroup")];
    expect(groups.map((group) => group.getAttribute("label"))).toEqual(["3D icons", "Flat icons"]);
    expect(groups[0].querySelectorAll("option")).toHaveLength(ICON_3D_SLOTS.length);
    expect(groups[1].querySelectorAll("option")).toHaveLength(FLAT_ICON_SLOTS.length);
  });

  it("R9: the Flat icons tab shows only icon: assets", () => {
    render(
      <IconGalleryClient
        initialAssets={[
          asset({ id: "flat", slot: "icon:package", storageKey: "icons/v1/icon-package-1.png" }),
          asset({ id: "3d", slot: "storefront", storageKey: "icons/v1/storefront-1.png" }),
        ]}
        categories={CATEGORIES}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Flat icons/ }));

    expect(screen.getByText("icon-package-1.png")).not.toBeNull();
    expect(screen.queryByText("storefront-1.png")).toBeNull();
  });
});

describe("CategoryImageManager (#1288 R5)", () => {
  it("deactivates the active candidate and shows the built-in artwork", async () => {
    const candidate = asset({
      id: "c1",
      slot: null,
      categoryId: "cat-1",
      storageKey: "categories/v1/bakery-1.png",
      imageUrl: "https://cdn.example.com/categories/v1/bakery-1.png",
    });
    fetchMock.mockImplementation((url: string) =>
      url.startsWith("/api/admin/category-images/assets")
        ? ok({ assets: [candidate] })
        : ok({ ok: true }),
    );
    const onImageKeyChange = vi.fn();

    await act(async () => {
      render(
        <CategoryImageManager
          categoryId="cat-1"
          categoryName="Bakery"
          slug="bakery"
          imageKey="categories/v1/bakery-1.png"
          imageUrl="https://cdn.example.com/categories/v1/bakery-1.png"
          onImageKeyChange={onImageKeyChange}
        />,
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/category-images/deactivate",
      expect.objectContaining({ body: JSON.stringify({ assetId: "c1" }) }),
    );
    expect(onImageKeyChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
    expect(screen.getByText("Built-in artwork")).not.toBeNull();
  });
});
