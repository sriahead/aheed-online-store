// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { CodePreview } from "@/lib/checkout-code-preview";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/checkout",
}));
vi.mock("@/features/checkout/place-order", () => ({ placeOrderAction: vi.fn() }));
vi.mock("@/features/checkout/address-lookup", () => ({ lookupAddressForCheckout: vi.fn() }));
vi.mock("@/features/storefront/delivery", () => ({
  setDeliveryPostcode: vi.fn(),
  setFulfilmentMethod: vi.fn(),
}));
vi.mock("@/features/checkout/preview-code", () => ({ previewDiscountCode: vi.fn() }));

const { CheckoutForm } = await import("@/components/checkout/CheckoutForm");
const { CheckoutPricingProvider } = await import("@/components/checkout/CheckoutPricing");

afterEach(cleanup);

/**
 * #967 (R17, R18, R24), updated for #973 — the total row shows a pre-filled code's discount only
 * while the field still holds that code, and a refused pre-filled code says why under the field.
 * Since #973 the pre-filled preview seeds `CheckoutPricingProvider` rather than a form prop.
 */

const BASIS = { subtotalPence: 2000, deliveryFeePence: 300 }; // £23.00 before any code

function renderForm(prefilledCode: CodePreview | null, initialDiscountCode = "SPEC967A") {
  render(
    <CheckoutPricingProvider
      basis={BASIS}
      initialDiscountCode={initialDiscountCode}
      prefilledCode={prefilledCode}
      redeemable={null}
    >
      <CheckoutForm
        signedInEmail={null}
        redeemable={null}
        offerCollection={false}
        vendorId="v-1"
        bookingWindowDays={14}
        offerDeliverySlots={false}
        timezone="Europe/London"
        method="DELIVERY"
        quotedDeliveryRules=""
      />
    </CheckoutPricingProvider>,
  );
  const input = document.getElementById("discountCode") as HTMLInputElement;
  const totalRow = () => document.querySelector("[data-checkout-total]")!.textContent ?? "";
  const note = () => document.querySelector("[data-discount-code-note]");
  return { input, totalRow, note };
}

describe("CheckoutForm pre-filled code", () => {
  it("shows the discounted total while the field holds the code, and not after an edit", () => {
    const { input, totalRow } = renderForm({ code: "SPEC967A", ok: true, discountPence: 300 });

    expect(input.value).toBe("SPEC967A");
    expect(totalRow()).toContain("£20.00");
    expect(totalRow()).toContain("Includes code SPEC967A (−£3.00).");

    fireEvent.change(input, { target: { value: "OTHER" } });
    expect(totalRow()).toContain("£23.00");
    expect(totalRow()).not.toContain("Includes code");
    expect(totalRow()).toContain("Your code isn't included until you press Apply.");

    // Normalised: the same code in lower case, with spaces, still matches.
    fireEvent.change(input, { target: { value: " spec967a " } });
    expect(totalRow()).toContain("£20.00");
    expect(totalRow()).toContain("Includes code SPEC967A (−£3.00).");
  });

  it("shows a refused code's reason under the field while it is unchanged", () => {
    const { input, totalRow, note } = renderForm(
      { code: "SPEC967B", ok: false, message: "Please sign in to use that discount code." },
      "SPEC967B",
    );

    const shown = note();
    expect(shown?.textContent).toBe("Please sign in to use that discount code.");
    expect(input.getAttribute("aria-describedby")).toBe(shown?.id);
    expect(totalRow()).toContain("£23.00");

    fireEvent.change(input, { target: { value: "" } });
    expect(note()).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("with no pre-filled code shows the pre-code total and no notes", () => {
    const { totalRow, note } = renderForm(null, "");
    expect(totalRow()).toContain("£23.00");
    expect(totalRow()).not.toContain("Includes");
    expect(totalRow()).not.toContain("press Apply");
    expect(note()).toBeNull();
  });
});
