// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { ShoppingListLink } from "@/components/layout/ShoppingListLink";
import { OrderAddressCard, type OrderAddress } from "@/components/orders/OrderAddressCard";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { PAYMENT_BADGE_DETAILS } from "@/lib/payment-badges";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/reference-db", () => ({ getReferencePrisma: vi.fn() }));
vi.mock("@/features/checkout/place-order", () => ({ placeOrderAction: vi.fn() }));
vi.mock("@/features/checkout/address-lookup", () => ({ lookupAddressForCheckout: vi.fn() }));
vi.mock("@/features/storefront/delivery", () => ({
  setDeliveryPostcode: vi.fn(),
  setFulfilmentMethod: vi.fn(),
}));
vi.mock("@/features/checkout/preview-code", () => ({ previewDiscountCode: vi.fn() }));
vi.mock("@/features/checkout/slots", () => ({
  getAvailableSlotsForDate: vi.fn().mockResolvedValue([]),
}));

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

const { CheckoutForm } = await import("@/components/checkout/CheckoutForm");
const { CheckoutPricingProvider } = await import("@/components/checkout/CheckoutPricing");

describe("UI and Checkout Improvements (#1254)", () => {
  it("R1: Cart trigger tooltip displays 'My Cart' consistently", () => {
    const { container } = render(
      <CartDrawerShell itemCount={3} subtotalPence={1500}>
        <div>Drawer body</div>
      </CartDrawerShell>,
    );
    const cartButton = container.querySelector("button");
    expect(cartButton).not.toBeNull();
    expect(cartButton?.getAttribute("title")).toBe("My Cart");
  });

  it("R2: Contact & Follow Hub omits '3D' and displays clean name and tooltip", () => {
    const def = ICON_3D_DEFINITIONS["contact-follow"];
    expect(def).toBeDefined();
    expect(def.name).toBe("Contact & Follow Hub");
    expect(def.name).not.toContain("3D");

    const { container } = render(
      <FloatingContact
        vendorName="Aheed Food Centre"
        facebookUrl="https://facebook.com/aheed"
        instagramUrl={null}
        whatsappNumber="07424242422"
        assistantAvailable={false}
      />,
    );
    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("title")).toBe("Contact & Follow Hub");

    const svg = trigger?.querySelector("svg");
    expect(svg?.querySelector("title")?.textContent).toBe("Contact & Follow Hub");
  });

  it("R3: Official payment logos are valid 48x30 SVGs with brand colors", () => {
    for (const [method, { label, src }] of Object.entries(PAYMENT_BADGE_DETAILS)) {
      const svg = readFileSync(join(process.cwd(), "public", src), "utf8");
      expect(svg).toContain('viewBox="0 0 48 30"');
      expect(svg).toContain('aria-label="' + label + '"');
      expect(svg).not.toMatch(/<text\b/);
      expect(svg).toMatch(/<path\b/);
      expect(svg).not.toMatch(/placeholder/i);

      if (method === "MASTERCARD") {
        expect(svg).toContain("#EB001B"); // Red
        expect(svg).toContain("#F79E1B"); // Yellow/Orange
        expect(svg).toContain("#FF5F00"); // Interlocking center
      } else if (method === "GOOGLE_PAY") {
        expect(svg).toContain("#4285F4"); // Google Blue
        expect(svg).toContain("#34A853"); // Google Green
        expect(svg).toContain("#FBBC04"); // Google Yellow
        expect(svg).toContain("#EA4335"); // Google Red
        expect(svg).toContain("#5F6368"); // Pay dark gray
      } else if (method === "VISA") {
        expect(svg).toContain("#1434CB");
      }
    }
  });

  it("R4: UK Address Layout moves Flat/Building (line2) before Street Address (line1)", () => {
    const { container } = render(
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

    const inputs = Array.from(container.querySelectorAll("input"));
    const line2Index = inputs.findIndex((input) => input.getAttribute("name") === "line2");
    const line1Index = inputs.findIndex((input) => input.getAttribute("name") === "line1");

    expect(line2Index).toBeGreaterThan(-1);
    expect(line1Index).toBeGreaterThan(-1);
    expect(line2Index).toBeLessThan(line1Index);
  });

  it("R5: Click & Collect order details card displays customer details and order reference without store address as delivery", () => {
    const testAddress: OrderAddress = {
      recipientName: "Fatima Khan",
      phone: "07424242422",
      line1: "Unit 23 Lloyds Court",
      line2: null,
      city: "Milton Keynes",
      postcode: "MK9 3EL",
      notes: "Picking up at 3pm",
    };

    // 1. COLLECTION mode
    const { container: collectContainer } = render(
      <OrderAddressCard
        address={testAddress}
        fulfilmentMethod="COLLECTION"
        orderNumber="ORD-2026-999"
      />,
    );

    expect(collectContainer.textContent).toContain("Click & Collect");
    expect(collectContainer.textContent).toContain("Customer Collection");
    expect(collectContainer.textContent).toContain("Fatima Khan");
    expect(collectContainer.textContent).toContain("ORD-2026-999");
    expect(collectContainer.textContent).toContain("07424242422");
    expect(collectContainer.textContent).toContain("Picking up at 3pm");
    expect(collectContainer.textContent).not.toContain("Delivering to");
    expect(collectContainer.textContent).not.toContain("Unit 23 Lloyds Court");

    // 2. DELIVERY mode
    const { container: deliveryContainer } = render(
      <OrderAddressCard
        address={testAddress}
        fulfilmentMethod="DELIVERY"
        orderNumber="ORD-2026-999"
      />,
    );

    expect(deliveryContainer.textContent).toContain("Delivering to");
    expect(deliveryContainer.textContent).toContain("Fatima Khan");
    expect(deliveryContainer.textContent).toContain("Unit 23 Lloyds Court");
    expect(deliveryContainer.textContent).toContain("MK9 3EL");
    expect(deliveryContainer.textContent).not.toContain("Click & Collect");
  });

  it("R6: ShoppingListLink renders Quick Shop icon with keyframe animation enabled", () => {
    const { container } = render(<ShoppingListLink />);
    const animatedIcon = container.querySelector(".animate-icon-pop");
    expect(animatedIcon).not.toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
