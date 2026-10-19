// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CartLine } from "@/lib/repositories/cart";

/**
 * #1135 (R8, R9) — a basket line's note control. A line that takes notes gets a labelled input;
 * a line carrying a note its product no longer takes says the note will not be sent; a line with
 * neither renders nothing at all.
 */

vi.mock("@/features/cart/set-note", () => ({ setCartItemNote: vi.fn(async () => ({ ok: true })) }));

const { CartLineNote } = await import("@/components/cart/CartLineNote");

const line = (over: Partial<CartLine>): CartLine => ({
  productId: "p1",
  slug: "goat",
  name: "Goat",
  unitLabel: "per kg",
  unitPricePence: 1000,
  quantity: 1,
  lineTotalPence: 1000,
  tierSavingPence: 0,
  tier: null,
  imageKey: null,
  stock: 5,
  available: true,
  customNote: null,
  acceptsNote: false,
  ...over,
});

afterEach(cleanup);

describe("CartLineNote", () => {
  it("renders a labelled input holding the note when the product takes notes", () => {
    render(<CartLineNote line={line({ acceptsNote: true, customNote: "curry cut" })} />);
    const input = screen.getByLabelText(/note for this item/i) as HTMLInputElement;
    expect(input.value).toBe("curry cut");
    expect(input.maxLength).toBe(200);
    expect(screen.getByRole("button", { name: /save note/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /clear/i })).toBeTruthy();
  });

  it("offers no Clear button when there is no note yet", () => {
    render(<CartLineNote line={line({ acceptsNote: true })} />);
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("says a note the product no longer takes will not be sent (R9)", () => {
    const { container } = render(
      <CartLineNote line={line({ acceptsNote: false, customNote: "curry cut" })} />,
    );
    expect(container.textContent).toContain("curry cut");
    expect(container.textContent).toContain("no longer takes notes");
    expect(container.textContent).toContain("will not be sent with the order");
    expect(screen.queryByLabelText(/note for this item/i)).toBeNull();
  });

  it("renders nothing for a line with no note that takes none (R9)", () => {
    const { container } = render(<CartLineNote line={line({})} />);
    expect(container.innerHTML).toBe("");
  });
});
