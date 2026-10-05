// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { CodePreview } from "@/lib/checkout-code-preview";
import type { PricingBasis, RedeemableConfig } from "@/components/checkout/CheckoutPricing";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/checkout",
}));
const placeOrderAction = vi.fn();
vi.mock("@/features/checkout/place-order", () => ({ placeOrderAction }));
vi.mock("@/features/checkout/address-lookup", () => ({ lookupAddressForCheckout: vi.fn() }));
vi.mock("@/features/storefront/delivery", () => ({
  setDeliveryPostcode: vi.fn(),
  setFulfilmentMethod: vi.fn(),
}));
const previewDiscountCode = vi.fn<(code: string) => Promise<CodePreview | null>>();
vi.mock("@/features/checkout/preview-code", () => ({ previewDiscountCode }));

const { CheckoutForm } = await import("@/components/checkout/CheckoutForm");
const { CheckoutSummary } = await import("@/components/checkout/CheckoutSummary");
const { CheckoutPricingProvider } = await import("@/components/checkout/CheckoutPricing");

/**
 * #973 (R8–R14) — the Apply control, the points preview, and the summary following both. The
 * provider wraps the form and the summary exactly as the checkout page does.
 */

const BASIS: PricingBasis = { subtotalPence: 2000, deliveryFeePence: 300 }; // £23.00 before any discount
const REDEEMABLE: RedeemableConfig = {
  balancePoints: 500,
  pencePerPointRedeemed: 1,
  minRedeemPoints: 100,
};
const LINES = [{ productId: "p-1", name: "Thing", quantity: 2, lineTotalPence: 2000 }];

function tree(basis: PricingBasis, redeemable: RedeemableConfig | null) {
  return (
    <CheckoutPricingProvider
      basis={basis}
      initialDiscountCode={null}
      prefilledCode={null}
      redeemable={redeemable}
    >
      <CheckoutForm
        signedInEmail="shopper@example.com"
        redeemable={redeemable ? { ...redeemable, valueLabel: "£5.00" } : null}
        offerCollection={false}
        vendorId="v-1"
        bookingWindowDays={14}
        offerDeliverySlots={false}
        timezone="Europe/London"
        method="DELIVERY"
        quotedDeliveryRules=""
      />
      <CheckoutSummary lines={LINES} method="DELIVERY" />
    </CheckoutPricingProvider>
  );
}

function setup(redeemable: RedeemableConfig | null = null) {
  const view = render(tree(BASIS, redeemable));
  const q = (selector: string) => document.querySelector(selector);
  return {
    rerender: (basis: PricingBasis) => view.rerender(tree(basis, redeemable)),
    input: document.getElementById("discountCode") as HTMLInputElement,
    points: () => document.getElementById("redeemPoints") as HTMLInputElement,
    apply: q("[data-discount-code-apply]") as HTMLButtonElement,
    note: () => q("[data-discount-code-note]"),
    pointsNote: () => q("[data-points-note]")?.textContent ?? null,
    totalRow: () => q("[data-checkout-total]")!.textContent ?? "",
    summaryTotal: () => q("[data-checkout-summary-total]")!.textContent ?? "",
    summary: () => q("[data-checkout-summary]")!.textContent ?? "",
  };
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  previewDiscountCode.mockReset();
  placeOrderAction.mockReset();
});
afterEach(cleanup);

describe("Apply (R8, R9, R11, R12)", () => {
  it("applies an ok answer to the note, the summary row and both totals", async () => {
    previewDiscountCode.mockResolvedValue({ code: "SPEC973A", ok: true, discountPence: 300 });
    const ui = setup();
    expect(ui.apply.textContent).toBe("Apply");
    expect(ui.apply.getAttribute("aria-label")).toBe("Apply discount code");
    expect(ui.apply.getAttribute("type")).toBe("button");

    await type(ui.input, "spec973a");
    await click(ui.apply);

    expect(previewDiscountCode).toHaveBeenCalledTimes(1);
    expect(previewDiscountCode).toHaveBeenCalledWith("spec973a");
    expect(ui.note()?.textContent).toBe("Code SPEC973A applied: −£3.00.");
    expect(ui.note()?.className).toContain("text-action");
    expect(ui.note()?.className).not.toContain("text-danger");
    expect(ui.input.getAttribute("aria-describedby")).toBe("discountCode-note");
    expect(ui.summary()).toContain("Discount (SPEC973A)");
    expect(ui.summary()).toContain("−£3.00");
    expect(ui.summaryTotal()).toBe("£20.00");
    expect(ui.totalRow()).toContain("£20.00");
    expect(ui.totalRow()).toContain("Includes code SPEC973A (−£3.00).");
  });

  it("shows a refused answer's message in text-danger", async () => {
    previewDiscountCode.mockResolvedValue({
      code: "NOPE",
      ok: false,
      message: "That discount code isn't recognised.",
    });
    const ui = setup();
    await type(ui.input, "nope");
    await click(ui.apply);

    expect(ui.note()?.textContent).toBe("That discount code isn't recognised.");
    expect(ui.note()?.className).toContain("text-danger");
    expect(ui.input.getAttribute("aria-describedby")).toBe("discountCode-note");
    expect(ui.summaryTotal()).toBe("£23.00");
    expect(ui.summary()).not.toContain("Discount (");
  });

  it("drops the discount once the field is edited after an ok answer", async () => {
    previewDiscountCode.mockResolvedValue({ code: "SPEC973A", ok: true, discountPence: 300 });
    const ui = setup();
    await type(ui.input, "SPEC973A");
    await click(ui.apply);
    await type(ui.input, "SPEC973");

    expect(ui.note()?.textContent).toBe("Press Apply to check this code.");
    expect(ui.summary()).not.toContain("Discount (");
    expect(ui.summaryTotal()).toBe("£23.00");
    expect(ui.totalRow()).toContain("£23.00");
    expect(ui.totalRow()).toContain("Your code isn't included until you press Apply.");
    expect(ui.totalRow()).not.toContain("Includes code");
  });

  it("checks the code on Enter instead of submitting the form", async () => {
    previewDiscountCode.mockResolvedValue({ code: "SPEC973A", ok: true, discountPence: 300 });
    const ui = setup();
    await type(ui.input, "SPEC973A");
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.keyDown(ui.input, { key: "Enter" });
    });

    expect(notPrevented).toBe(false); // preventDefault() ran, so no implicit submission
    expect(previewDiscountCode).toHaveBeenCalledTimes(1);
    expect(placeOrderAction).not.toHaveBeenCalled();
  });

  it("does nothing for a blank field", async () => {
    const ui = setup();
    await type(ui.input, "   ");
    await click(ui.apply);
    expect(previewDiscountCode).not.toHaveBeenCalled();
    expect(ui.note()).toBeNull();
    expect(ui.input.getAttribute("aria-describedby")).toBeNull();
  });

  it("disables the button and shows Checking… while a check is pending", async () => {
    let resolve: (value: CodePreview) => void = () => {};
    previewDiscountCode.mockReturnValue(new Promise((r) => (resolve = r)));
    const ui = setup();
    await type(ui.input, "SPEC973A");
    await click(ui.apply);

    expect(ui.apply.disabled).toBe(true);
    expect(ui.apply.textContent).toBe("Checking…");
    expect(ui.note()).toBeNull();

    await act(async () => resolve({ code: "SPEC973A", ok: true, discountPence: 300 }));
    expect(ui.apply.disabled).toBe(false);
    expect(ui.apply.textContent).toBe("Apply");
  });

  it("always renders the polite live container around the note", () => {
    setup();
    const field = document.getElementById("discountCode")!.closest("div.max-w-sm")!;
    expect(field.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe("points (R10, R11, R12)", () => {
  it("shows each note state and follows it in both totals", async () => {
    const ui = setup(REDEEMABLE);
    expect(ui.pointsNote()).toBeNull();

    await type(ui.points(), "200");
    expect(ui.pointsNote()).toBe("200 points: −£2.00");
    expect(ui.summary()).toContain("Points (200)");
    expect(ui.summaryTotal()).toBe("£21.00");
    expect(ui.totalRow()).toContain("£21.00");
    expect(ui.totalRow()).toContain("Includes 200 points (−£2.00).");

    await type(ui.points(), "5000");
    expect(ui.pointsNote()).toBe("500 of 5000 points can be used on this order: −£5.00");
    expect(ui.summaryTotal()).toBe("£18.00");

    await type(ui.points(), "50"); // below the vendor's minimum of 100
    expect(ui.pointsNote()).toBe("Those points can't be used on this order.");
    expect(ui.summary()).not.toContain("Points (");
    expect(ui.summaryTotal()).toBe("£23.00");

    await type(ui.points(), "1.5"); // not a positive integer: requested 0, as on submit
    expect(ui.pointsNote()).toBeNull();
  });

  it("passes the code's discount to the points clamp as existingDiscountPence", async () => {
    previewDiscountCode.mockResolvedValue({ code: "BIG", ok: true, discountPence: 1800 });
    const ui = setup(REDEEMABLE);
    await type(ui.input, "BIG");
    await click(ui.apply);
    await type(ui.points(), "500");

    // Goods £20.00 − code £18.00 leaves £2.00 the points can take.
    expect(ui.pointsNote()).toBe("200 of 500 points can be used on this order: −£2.00");
    expect(ui.summaryTotal()).toBe("£3.00"); // 2000 − 1800 − 200 + 300
    expect(ui.totalRow()).toContain("£3.00");
  });
});

describe("re-check when the basis changes (R14)", () => {
  it("checks the applied code again and shows the second answer", async () => {
    previewDiscountCode
      .mockResolvedValueOnce({ code: "TENPC", ok: true, discountPence: 200 })
      .mockResolvedValueOnce({ code: "TENPC", ok: true, discountPence: 250 });
    const ui = setup();
    await type(ui.input, "TENPC");
    await click(ui.apply);
    expect(ui.summaryTotal()).toBe("£21.00");

    await act(async () => {
      ui.rerender({ subtotalPence: 2500, deliveryFeePence: 0 });
    });

    expect(previewDiscountCode).toHaveBeenCalledTimes(2);
    expect(previewDiscountCode).toHaveBeenLastCalledWith("TENPC");
    expect(ui.summaryTotal()).toBe("£22.50"); // 2500 − 250 + 0
    expect(ui.summary()).toContain("Discount (TENPC)");
  });
});
