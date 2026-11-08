/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { OnboardingReadinessDashboard } from "@/components/staff/OnboardingReadinessDashboard";
import type { VendorReadinessReport } from "@/lib/vendor-readiness-service";
import { computeVatBreakdown, computeTotals } from "@/lib/order-totals";
import { parseProductForm, readForm, PRODUCT_FIELDS } from "@/lib/catalogue-form";
import { STOCK_MODES, purchasableQuantity, MAX_ADD_QUANTITY } from "@/lib/cart-rules";
import { STOCK_MODE_LABELS } from "@/lib/product-restriction";

const mockReport: VendorReadinessReport = {
  vendorId: "v-test-1",
  vendorName: "Aheed Food Centre",
  vendorSlug: "aheed-food-centre",
  canonicalHost: "aheed.merqify.com",
  readinessStatus: "LAUNCH_READY",
  overallCompletion: 100,
  totalRequiredSettings: 18,
  configuredRequiredSettings: 18,
  vendorRequiredCount: 14,
  vendorConfiguredCount: 14,
  platformRequiredCount: 4,
  platformConfiguredCount: 4,
  evaluatedAt: new Date().toISOString(),
  categories: [
    {
      id: "storefront-identity",
      name: "Storefront Identity & Chrome",
      description: "Storefront identity settings",
      completionPercentage: 100,
      totalRequired: 4,
      configuredRequired: 4,
      items: [],
    },
  ],
};

describe("1. Onboarding Page Visibility & Reference Removal", () => {
  it("shows counts, statistics and responsibility breakdown only to Platform Admin", () => {
    const { rerender } = render(
      <OnboardingReadinessDashboard report={mockReport} isPlatformAdmin={true} />,
    );

    // Platform admin sees percentages and counts
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText(/18 of 18 required items complete/i)).toBeDefined();
    expect(screen.getByText(/Store Operator: 14 \/ 14/i)).toBeDefined();
    expect(screen.getByText(/Platform Admin: 4 \/ 4/i)).toBeDefined();
    expect(screen.getByText(/Launch Readiness Checklist \(100%\)/i)).toBeDefined();

    // Re-render as normal store staff / non-platform admin
    rerender(<OnboardingReadinessDashboard report={mockReport} isPlatformAdmin={false} />);

    // Non-platform admin MUST NOT see the counts or statistics
    expect(screen.queryByText("100%")).toBeNull();
    expect(screen.queryByText(/18 of 18 required items complete/i)).toBeNull();
    expect(screen.queryByText(/Store Operator:/i)).toBeNull();
    expect(screen.queryByText(/Platform Admin:/i)).toBeNull();
    expect(screen.queryByText(/Launch Readiness Checklist/i)).toBeNull();
    expect(screen.queryByText(/Switch to Audit Checklist/i)).toBeNull();
    expect(screen.queryByText(/Ready for Storefront Launch/i)).toBeNull();
    expect(screen.queryByText(/\d+\/\d+ required/i)).toBeNull();
    expect(screen.getByText("Staff Onboarding & Operations Guide")).toBeDefined();
    expect(screen.getByText("System Access & Staff Navigation")).toBeDefined();
  });

  it("completely removes the benchmarked against nocaped reference for all users", () => {
    const { container: containerAdmin } = render(
      <OnboardingReadinessDashboard report={mockReport} isPlatformAdmin={true} />,
    );
    expect(containerAdmin.textContent).not.toContain("nocaped.com");
    expect(containerAdmin.textContent).not.toContain(
      "Benchmarked against canonical operational profile",
    );

    const { container: containerStaff } = render(
      <OnboardingReadinessDashboard report={mockReport} isPlatformAdmin={false} />,
    );
    expect(containerStaff.textContent).not.toContain("nocaped.com");
    expect(containerStaff.textContent).not.toContain(
      "Benchmarked against canonical operational profile",
    );
  });
});

describe("2. Quick View naming & Visual Asset Medallion standards", () => {
  it("documents Quick View in Onboarding Guide", () => {
    render(<OnboardingReadinessDashboard report={mockReport} isPlatformAdmin={false} />);
    expect(screen.getAllByText(/Quick View:/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Modal Inspector:/i)).toBeNull();
  });
});

describe("3. Stock Creation, Editing & Attributes (VAT & INFINITE Stock)", () => {
  it("supports INFINITE stock mode in constants and purchasability rules", () => {
    expect(STOCK_MODES).toContain("INFINITE");
    expect(STOCK_MODE_LABELS.INFINITE).toContain("Infinite");

    const infiniteProduct = {
      isActive: true,
      restriction: null,
      inventory: { stockMode: "INFINITE" as const, quantity: 0 },
    };
    expect(purchasableQuantity(infiniteProduct)).toBe(MAX_ADD_QUANTITY);
  });

  it("parses 0% and 20% VAT rates in readProductForm", () => {
    const formData = new FormData();
    formData.append("name", "Basmati Rice 5kg");
    formData.append("slug", "basmati-rice-5kg");
    formData.append("description", "Premium rice");
    formData.append("categoryId", "cat-1");
    formData.append("basePrice", "12.50");
    formData.append("unitLabel", "£2.50 / kg");
    formData.append("stockMode", "INFINITE");
    formData.append("quantity", "0");
    formData.append("lowStockThreshold", "0");
    formData.append("vatRate", "0");

    const raw = readForm(formData, PRODUCT_FIELDS);
    const parsed = parseProductForm(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.vatRate).toBe(0);
      expect(parsed.value.stockMode).toBe("INFINITE");
    }

    const formData20 = new FormData();
    formData20.append("name", "Chocolate Box");
    formData20.append("slug", "chocolate-box");
    formData20.append("description", "Luxury confectionery");
    formData20.append("categoryId", "cat-2");
    formData20.append("basePrice", "6.00");
    formData20.append("unitLabel", "each");
    formData20.append("stockMode", "TRACKED");
    formData20.append("quantity", "25");
    formData20.append("lowStockThreshold", "5");
    formData20.append("vatRate", "20");

    const raw20 = readForm(formData20, PRODUCT_FIELDS);
    const parsed20 = parseProductForm(raw20);
    expect(parsed20.ok).toBe(true);
    if (parsed20.ok) {
      expect(parsed20.value.vatRate).toBe(20);
      expect(parsed20.value.stockMode).toBe("TRACKED");
    }
  });

  it("refuses invalid VAT rates in parseProductForm", () => {
    const formData = new FormData();
    formData.append("name", "Invalid Item");
    formData.append("slug", "invalid-item");
    formData.append("categoryId", "cat-1");
    formData.append("basePrice", "5.00");
    formData.append("unitLabel", "each");
    formData.append("stockMode", "TRACKED");
    formData.append("quantity", "10");
    formData.append("lowStockThreshold", "2");
    formData.append("vatRate", "15"); // Invalid UK grocery VAT rate

    const raw = readForm(formData, PRODUCT_FIELDS);
    const parsed = parseProductForm(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.field).toBe("vatRate");
    }
  });
});

describe("4. VAT Breakdown Calculation During Checkout", () => {
  it("calculates 0% VAT for zero-rated grocery food items", () => {
    const lines = [
      { unitPricePence: 500, quantity: 2, lineTotalPence: 1000, vatRate: 0, available: true }, // Rice: £10
      { unitPricePence: 250, quantity: 4, lineTotalPence: 1000, vatRate: 0, available: true }, // Flour: £10
    ];

    const breakdown = computeVatBreakdown(lines, 0);
    expect(breakdown.vatTotalPence).toBe(0);
    expect(breakdown.vatStandardPence).toBe(0);
    expect(breakdown.vatZeroPence).toBe(0);
    expect(breakdown.zeroRatedNetPence).toBe(2000);
    expect(breakdown.standardRatedNetPence).toBe(0);
  });

  it("calculates 20% UK VAT (20/120 fraction) on standard-rated confectionery & non-food", () => {
    const lines = [
      { unitPricePence: 600, quantity: 1, lineTotalPence: 600, vatRate: 20, available: true }, // Chocolate £6.00 gross -> £1.00 VAT, £5.00 net
    ];

    const breakdown = computeVatBreakdown(lines, 0);
    expect(breakdown.vatTotalPence).toBe(100);
    expect(breakdown.vatStandardPence).toBe(100);
    expect(breakdown.standardRatedNetPence).toBe(500);
    expect(breakdown.zeroRatedNetPence).toBe(0);
  });

  it("calculates mixed-basket VAT with zero-rated food and standard-rated goods", () => {
    const lines = [
      { unitPricePence: 1000, quantity: 1, lineTotalPence: 1000, vatRate: 0, available: true }, // Zero-rated Food: £10.00
      { unitPricePence: 1200, quantity: 1, lineTotalPence: 1200, vatRate: 20, available: true }, // Standard Confectionery: £12.00 (£2.00 VAT)
    ];

    const totals = computeTotals(
      lines,
      { deliveryFeePence: 350, freeDeliveryThresholdPence: 3000 },
      0,
    );
    expect(totals.subtotalPence).toBe(2200);
    expect(totals.deliveryFeePence).toBe(350);
    expect(totals.totalPence).toBe(2550);

    const breakdown = computeVatBreakdown(lines, 0);
    expect(breakdown.vatTotalPence).toBe(200); // 1200 * 20 / 120 = 200
    expect(breakdown.vatStandardPence).toBe(200);
    expect(breakdown.standardRatedNetPence).toBe(1000);
    expect(breakdown.zeroRatedNetPence).toBe(1000);
  });

  it("apportions discounts proportionally across standard-rated and zero-rated items", () => {
    const lines = [
      { unitPricePence: 1000, quantity: 1, lineTotalPence: 1000, vatRate: 0, available: true }, // Food £10
      { unitPricePence: 1000, quantity: 1, lineTotalPence: 1000, vatRate: 20, available: true }, // Non-food £10
    ];
    // £20 subtotal with £4 discount (20% discount on both)
    // Standard gross becomes £8.00; VAT = 800 * 20 / 120 = 133p
    const breakdown = computeVatBreakdown(lines, 400);
    expect(breakdown.vatTotalPence).toBe(133);
    expect(breakdown.vatStandardPence).toBe(133);
    expect(breakdown.standardRatedNetPence).toBe(667);
    expect(breakdown.zeroRatedNetPence).toBe(800);
  });
});
