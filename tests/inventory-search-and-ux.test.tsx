/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InventoryTable } from "@/app/(admin)/staff/inventory/InventoryTable";
import type { StaffInventoryRow } from "@/lib/repositories/products";

// Mock router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/staff/inventory",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock action
vi.mock("@/app/(admin)/staff/inventory/actions", () => ({
  updateInventoryAction: vi.fn().mockResolvedValue({ ok: true }),
}));

afterEach(() => {
  cleanup();
});

const mockItems: StaffInventoryRow[] = [
  {
    id: "prod-1",
    slug: "coca-cola-can-330ml",
    name: "Coca Cola Original",
    sku: "PLU-1001",
    brandName: "Coca-Cola",
    categoryName: "Drinks",
    netContentLabel: "330ml",
    basePrice: 120,
    unitLabel: "each",
    quantity: 24,
    previousQuantity: 24,
    stockStatus: "IN_STOCK",
    isRestockNeeded: false,
    isActive: true,
    stockMode: "TRACKED",
    restriction: null,
    primaryImage: null,
  },
  {
    id: "prod-2",
    slug: "basmati-rice-5kg",
    name: "Royal Basmati Rice",
    sku: "PLU-2002",
    brandName: "Royal",
    categoryName: "Grocery",
    netContentLabel: "5kg",
    basePrice: 850,
    unitLabel: "each",
    quantity: 0,
    previousQuantity: 15,
    stockStatus: "OUT_OF_STOCK",
    isRestockNeeded: true,
    isActive: true,
    stockMode: "TRACKED",
    restriction: null,
    primaryImage: null,
  },
  {
    id: "prod-3",
    slug: "fresh-coriander",
    name: "Fresh Coriander Bunch",
    sku: "PLU-3003",
    brandName: null,
    categoryName: "Fresh Produce",
    netContentLabel: "100g",
    basePrice: 75,
    unitLabel: "each",
    quantity: 3,
    previousQuantity: 10,
    stockStatus: "LOW_STOCK",
    isRestockNeeded: false,
    isActive: true,
    stockMode: "TRACKED",
    restriction: null,
    primaryImage: null,
  },
];

describe("InventoryTable — 9 Essential Columns & Stock Management", () => {
  it("renders all 9 required columns in the table header", () => {
    render(<InventoryTable initialItems={mockItems} cdnBaseUrl="https://cdn.example.com" />);

    expect(screen.getByText("Product Name")).toBeDefined();
    expect(screen.getByText("SKU / Product ID")).toBeDefined();
    expect(screen.getByText("Brand")).toBeDefined();
    expect(screen.getByText("Category")).toBeDefined();
    expect(screen.getByText("Net Content")).toBeDefined();
    expect(screen.getByText("Selling Price")).toBeDefined();
    expect(screen.getByText("Current Stock")).toBeDefined();
    expect(screen.getByText("Previous Stock")).toBeDefined();
    expect(screen.getByText("Stock Status")).toBeDefined();
  });

  it("displays product data matching the 9 columns", () => {
    render(<InventoryTable initialItems={mockItems} cdnBaseUrl="https://cdn.example.com" />);

    // Product Name
    expect(screen.getByText("Coca Cola Original")).toBeDefined();
    // SKU
    expect(screen.getByText("PLU-1001")).toBeDefined();
    // Brand
    expect(screen.getByText("Coca-Cola")).toBeDefined();
    // Category
    expect(screen.getByText("Drinks")).toBeDefined();
    // Net Content
    expect(screen.getByText("330ml")).toBeDefined();
    // Selling Price
    expect(screen.getByText("£1.20")).toBeDefined();
    // Current Stock & Previous Stock
    expect(screen.getAllByText("24").length).toBeGreaterThanOrEqual(1);
  });

  it("identifies and highlights products that previously had stock but currently show zero", () => {
    render(<InventoryTable initialItems={mockItems} cdnBaseUrl="https://cdn.example.com" />);

    // Restock banner
    expect(
      screen.getByText(/previously had stock but are now depleted and need restocking/i),
    ).toBeDefined();

    // Restock badge on item
    expect(screen.getByText("Restock Needed")).toBeDefined();
  });

  it("filters items by status filter", () => {
    render(<InventoryTable initialItems={mockItems} cdnBaseUrl="https://cdn.example.com" />);

    const select = screen.getByLabelText(/Status:/i);
    fireEvent.change(select, { target: { value: "RESTOCK_NEEDED" } });

    // Only Basmati Rice should show
    expect(screen.getByText("Royal Basmati Rice")).toBeDefined();
    expect(screen.queryByText("Coca Cola Original")).toBeNull();
  });
});
