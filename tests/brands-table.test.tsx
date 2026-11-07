// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrandTable } from "@/components/staff/BrandTable";
import type { AdminBrandRow } from "@/lib/repositories/brands";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/features/admin/brands", () => ({
  createBrand: vi.fn(async () => ({ saved: true, error: null })),
  deleteBrand: vi.fn(async () => ({ saved: true, error: null })),
  renameBrand: vi.fn(async () => ({ saved: true, error: null })),
  setBrandImage: vi.fn(async () => ({ saved: true, error: null })),
  getBrandProducts: vi.fn(async () => ({
    ok: true,
    products: [
      {
        id: "prod-1",
        name: "Shan Karahi Masala 50g",
        slug: "shan-karahi-masala-50g",
        plu: "1001",
        basePrice: 149,
        unitLabel: "£1.49 each",
        netContentAmount: 50,
        netContentUnit: "GRAM",
        isActive: true,
        categoryName: "Spices",
        stockQuantity: 25,
        stockMode: "TRACKED",
      },
    ],
  })),
  unassignProductFromBrandAction: vi.fn(async () => ({ ok: true })),
}));

const SAMPLE_BRANDS: AdminBrandRow[] = [
  {
    id: "brand-1",
    name: "Shan",
    slug: "shan",
    imageKey: "brands/shan/logo.webp",
    productCount: 25,
  },
  {
    id: "brand-2",
    name: "TRS",
    slug: "trs",
    imageKey: null,
    productCount: 47,
  },
  {
    id: "brand-3",
    name: "Empty Brand",
    slug: "empty-brand",
    imageKey: null,
    productCount: 0,
  },
];

afterEach(() => {
  cleanup();
});

describe("BrandTable UI & Behavioural Features", () => {
  it("renders neuromarketing metric anchors correctly", () => {
    render(<BrandTable initialBrands={SAMPLE_BRANDS} />);

    // Total Brands anchor (3)
    expect(screen.getByText("3")).not.toBeNull();
    // Branded products anchor: 25 + 47 = 72
    expect(screen.getByText("72")).not.toBeNull();
    // Top brand anchor (TRS appears in top card and table)
    expect(screen.getAllByText("TRS").length).toBeGreaterThanOrEqual(1);
    // Empty brands anchor (1)
    expect(screen.getByText("1")).not.toBeNull();
  });

  it("filters brands by search term instantly", () => {
    render(<BrandTable initialBrands={SAMPLE_BRANDS} />);

    const searchInput = screen.getByPlaceholderText("Search by brand name or slug...");
    fireEvent.change(searchInput, { target: { value: "Shan" } });

    expect(screen.getByText("Shan")).not.toBeNull();
    // TRS table row is removed
    const trsRows = screen.queryAllByRole("row").filter((r) => r.textContent?.includes("TRS"));
    expect(trsRows.length).toBe(0);
    // Empty Brand table row is removed
    const emptyRows = screen.queryAllByRole("row").filter((r) => r.textContent?.includes("Empty Brand"));
    expect(emptyRows.length).toBe(0);
  });

  it("filters by status tabs (With Products vs Empty)", () => {
    render(<BrandTable initialBrands={SAMPLE_BRANDS} />);

    // Click Empty tab
    const emptyTab = screen.getByRole("button", { name: /Empty \(1\)/i });
    fireEvent.click(emptyTab);

    expect(screen.getByText("Empty Brand")).not.toBeNull();
    const shanRows = screen.queryAllByRole("row").filter((r) => r.textContent?.includes("Shan"));
    expect(shanRows.length).toBe(0);

    // Click With Products tab
    const withProductsTab = screen.getByRole("button", { name: /With Products \(2\)/i });
    fireEvent.click(withProductsTab);

    expect(screen.getByText("Shan")).not.toBeNull();
    const emptyBrandRows = screen.queryAllByRole("row").filter((r) => r.textContent?.includes("Empty Brand"));
    expect(emptyBrandRows.length).toBe(0);
  });

  it("opens Add Brand modal when clicking '+ Add Brand'", () => {
    render(<BrandTable initialBrands={SAMPLE_BRANDS} />);

    const addBtn = screen.getByRole("button", { name: /Add Brand/i });
    fireEvent.click(addBtn);

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Add a Brand" })).not.toBeNull();
  });

  it("opens Quick View drawer and displays brand products with pricing psychology", async () => {
    render(<BrandTable initialBrands={SAMPLE_BRANDS} />);

    const quickViewButtons = screen.getAllByTitle(/quick view brand products/i);
    fireEvent.click(quickViewButtons[0]);

    // Drawer opens
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(await screen.findByText("Shan Karahi Masala 50g")).not.toBeNull();
    expect(screen.getAllByText("£1.49").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("25 in stock")).not.toBeNull();
  });
});
