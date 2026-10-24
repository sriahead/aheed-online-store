// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";
import { FloatingContact } from "@/components/layout/FloatingContact";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

afterEach(cleanup);

describe("Floating checkout and contact buttons icons (#1242)", () => {
  it("CartDrawerShell renders the supermarket trolley icon (shopping-cart)", () => {
    render(
      <CartDrawerShell itemCount={2} subtotalPence={1500}>
        <div>Cart content</div>
      </CartDrawerShell>,
    );

    const button = screen.getByRole("button", { name: /cart/i });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("data-icon")).toBe("shopping-cart");
  });

  it("FloatingContact renders the community group icon (users)", () => {
    render(
      <FloatingContact
        vendorName="Aheed Food Centre"
        facebookUrl="https://facebook.com/aheed"
        instagramUrl="https://instagram.com/aheed"
        whatsappNumber="447123456789"
        assistantAvailable={false}
      />,
    );

    const button = screen.getByRole("button", { name: /contact and follow/i });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("data-icon")).toBe("users");
  });
});
