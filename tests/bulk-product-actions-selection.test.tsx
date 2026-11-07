/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BulkProductActions } from "@/components/staff/BulkProductActions";
import { BULK_PRODUCTS_FORM_ID } from "@/lib/product-restriction-form";

// Mock server action
vi.mock("@/features/admin/product-restrictions", () => ({
  bulkProductAction: vi.fn().mockImplementation((_state, formData: FormData) => {
    const intent = formData.get("intent");
    const productIds = formData.getAll("productId") as string[];
    if (intent === "reset") {
      return { phase: "idle", error: null };
    }
    return {
      phase: "preview",
      action: "ENABLE",
      productIds,
      plan: productIds.map((id) => ({
        productId: id,
        name: `Product ${id}`,
        restriction: null,
        outcome: { kind: "ENABLE" },
      })),
      offersConfirmation: false,
      error: null,
    };
  }),
}));

afterEach(() => {
  cleanup();
});

describe("BulkProductActions — Product Selection Retention", () => {
  it("maintains selection count and persists selected items", () => {
    const { container } = render(
      <div>
        <BulkProductActions />
        <div>
          <input
            type="checkbox"
            name="productId"
            value="prod-1"
            form={BULK_PRODUCTS_FORM_ID}
            data-testid="cb-1"
          />
          <input
            type="checkbox"
            name="productId"
            value="prod-2"
            form={BULK_PRODUCTS_FORM_ID}
            data-testid="cb-2"
          />
        </div>
      </div>,
    );

    const cb1 = screen.getByTestId("cb-1") as HTMLInputElement;
    const cb2 = screen.getByTestId("cb-2") as HTMLInputElement;

    fireEvent.click(cb1);
    expect(cb1.checked).toBe(true);

    // Should display 1 selected badge
    expect(screen.getByText("1 selected")).toBeDefined();

    fireEvent.click(cb2);
    expect(screen.getByText("2 selected")).toBeDefined();

    // Clear selection
    const clearBtn = screen.getByText("Clear selection");
    fireEvent.click(clearBtn);

    expect(cb1.checked).toBe(false);
    expect(cb2.checked).toBe(false);
    expect(screen.queryByText(/\d+ selected/)).toBeNull();
  });
});
