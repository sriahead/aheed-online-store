// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

/**
 * #1305 — a way back to the shop beside the primary action, on `/cart` (via `CartContents`) and on
 * checkout (via `CheckoutForm`), and NOT in the cart drawer, which shares `CartContents`.
 *
 * WHY IT RENDERS. The requirement is about adjacency and responsive order, which is only visible in
 * the markup: both controls must be siblings in one flex container that stacks below `sm` with the
 * primary action on top (`flex-col-reverse`) and sits in a row from `sm`.
 */

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/reference-db", () => ({ getReferencePrisma: vi.fn() }));
vi.mock("@/features/cart/remove-item", () => ({ removeFromCart: vi.fn() }));
vi.mock("@/features/cart/update-quantity", () => ({ updateQuantity: vi.fn() }));
vi.mock("@/features/cart/set-note", () => ({ setCartItemNote: vi.fn() }));
vi.mock("@/features/checkout/place-order", () => ({ placeOrderAction: vi.fn() }));
vi.mock("@/features/checkout/address-lookup", () => ({ lookupAddressForCheckout: vi.fn() }));
vi.mock("@/features/storefront/delivery", () => ({
  setDeliveryPostcode: vi.fn(),
  setFulfilmentMethod: vi.fn(),
}));
vi.mock("@/features/checkout/preview-code", () => ({ previewDiscountCode: vi.fn() }));
vi.mock("@/features/checkout/slots", () => ({
  getAvailableSlotsForWeek: vi.fn().mockResolvedValue([]),
}));

const { CartContents } = await import("@/components/cart/CartContents");
const { CheckoutForm } = await import("@/components/checkout/CheckoutForm");
const { CheckoutPricingProvider } = await import("@/components/checkout/CheckoutPricing");

afterEach(cleanup);

const summary = {
  lines: [
    {
      productId: "p1",
      slug: "milk",
      name: "Whole Milk 2L",
      unitLabel: "2L",
      unitPricePence: 150,
      quantity: 1,
      lineTotalPence: 150,
      tierSavingPence: 0,
      tier: null,
      imageKey: null,
      stock: 10,
      available: true,
      customNote: null,
      acceptsNote: false,
    },
  ],
  itemCount: 1,
  subtotalPence: 150,
  mergePending: false,
  savedItemCount: 0,
  guestItemCount: 0,
} as unknown as React.ComponentProps<typeof CartContents>["summary"];

function cart(extra: { continueShoppingHref?: string } = {}) {
  return render(
    <CartContents
      summary={summary}
      method="DELIVERY"
      minimumOrderPence={0}
      freeDeliveryThresholdPence={null}
      localityName="Town"
      cdnBaseUrl=""
      {...extra}
    />,
  );
}

const linkByText = (root: Element, text: string) =>
  [...root.querySelectorAll("a")].find((a) => a.textContent?.trim() === text);

describe("#1305 cart footer", () => {
  it("has no Continue shopping link without the prop — the drawer is unchanged (R3)", () => {
    const { container } = cart();
    expect(container.textContent).not.toContain("Continue shopping");
    expect(linkByText(container, "Proceed to checkout")?.getAttribute("href")).toBe("/checkout");
  });

  it("puts Continue shopping and Proceed to checkout side by side with the prop (R4)", () => {
    const { container } = cart({ continueShoppingHref: "/categories" });
    const keep = linkByText(container, "Continue shopping");
    const proceed = linkByText(container, "Proceed to checkout");
    expect(keep?.getAttribute("href")).toBe("/categories");
    expect(proceed?.getAttribute("href")).toBe("/checkout");

    const row = keep!.parentElement!;
    expect(row.className).toContain("flex-col-reverse");
    expect(row.className).toContain("sm:flex-row");
    expect(row.children[0]).toBe(keep);
    expect(row.children[1].contains(proceed!)).toBe(true);
  });
});

describe("#1305 checkout form", () => {
  function checkout() {
    return render(
      <CheckoutPricingProvider
        basis={{ subtotalPence: 2000, deliveryFeePence: 300 }}
        initialDiscountCode={null}
        prefilledCode={null}
        redeemable={null}
      >
        <CheckoutForm
          signedInEmail="test@example.com"
          redeemable={null}
          offerCollection={true}
          vendorId="vendor-1"
          bookingWindowDays={7}
          offerDeliverySlots={false}
          timezone="Europe/London"
          savedAddresses={[]}
          method="DELIVERY"
          quotedDeliveryRules=""
        />
      </CheckoutPricingProvider>,
    );
  }

  it("shows Continue shopping beside Continue to payment (R5)", () => {
    const { container } = checkout();
    const keep = linkByText(container, "Continue shopping");
    const submit = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to payment"),
    );
    expect(keep?.tagName).toBe("A");
    expect(keep?.getAttribute("href")).toBe("/categories");
    expect(submit?.getAttribute("type")).toBe("submit");
    expect(keep!.parentElement).toBe(submit!.parentElement);
    expect(keep!.parentElement!.className).toContain("flex-col-reverse");
    expect(keep!.parentElement!.className).toContain("sm:flex-row");
  });

  it("does not submit the form when Continue shopping is clicked (R6)", () => {
    const { container } = checkout();
    const form = container.querySelector("form")!;
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", onSubmit);

    const keep = linkByText(container, "Continue shopping")!;
    // jsdom does not navigate on an anchor click; what matters is that no submit event fires.
    keep.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(keep);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
