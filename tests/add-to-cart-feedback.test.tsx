// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AddOutcome } from "@/lib/cart-rules";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
const addToCart = vi.fn<(productId: string, delta?: number) => Promise<AddOutcome>>();
vi.mock("@/features/cart/add-to-cart", () => ({ addToCart }));

const { AddToCartButton } = await import("@/components/cart/AddToCartButton");
const { CartFeedbackProvider } = await import("@/components/cart/CartFeedback");

afterEach(() => {
  cleanup();
  addToCart.mockReset();
});

/**
 * #956 (R6–R10, R22) — the button reports what the server actually did, into
 * the shared region (`data-cart-feedback`) for every variant and on the button
 * itself for `full`/`drawer`. A rejected call is caught, not thrown into the
 * route error boundary.
 */

const NAME = "Test Product";

function renderButton(variant: "full" | "card" | "drawer") {
  render(
    <CartFeedbackProvider>
      <AddToCartButton
        productId="p-1"
        productName={NAME}
        label={`Add ${NAME} to cart`}
        variant={variant}
      />
    </CartFeedbackProvider>,
  );
  const region = document.querySelector("[data-cart-feedback]") as HTMLElement;
  return { region };
}

const rows: { name: string; outcome: AddOutcome; message: string; buttonText: string }[] = [
  {
    name: "added",
    outcome: { kind: "added", added: 1, inCart: 1 },
    message: `Added ${NAME} to your cart (1 in cart).`,
    buttonText: "Added",
  },
  {
    name: "partial",
    outcome: { kind: "partial", added: 2, requested: 5, inCart: 2 },
    message: `Only 2 of 5 ${NAME} added. That's all we have in stock (2 in cart).`,
    buttonText: "Only 2 added",
  },
  {
    name: "SOLD_OUT",
    outcome: { kind: "none", reason: "SOLD_OUT" },
    message: `${NAME} is sold out. Nothing was added.`,
    buttonText: "Sold out",
  },
  {
    name: "AT_STOCK_LIMIT",
    outcome: { kind: "none", reason: "AT_STOCK_LIMIT", inCart: 2 },
    message: `Your cart already has all the ${NAME} we have in stock (2). Nothing was added.`,
    buttonText: "All in cart",
  },
  {
    name: "INVALID_QUANTITY",
    outcome: { kind: "none", reason: "INVALID_QUANTITY" },
    message: `${NAME} couldn't be added. Please try again.`,
    buttonText: "Try again",
  },
];

describe("AddToCartButton outcome feedback", () => {
  it.each(rows)("$name: region message and full-variant button text", async (row) => {
    addToCart.mockResolvedValue(row.outcome);
    const { region } = renderButton("full");
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(region.textContent).toBe(row.message));
    expect(screen.getByRole("button").textContent).toBe(row.buttonText);
  });

  it("a rejected call is caught: retry message, 'Try again', button enabled", async () => {
    addToCart.mockRejectedValue(new Error("network"));
    const { region } = renderButton("full");
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(region.textContent).toBe(`${NAME} couldn't be added. Please try again.`),
    );
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Try again");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  // #1185 — the card's control is now a bare `+` with no text at all, so there is no "Added" for
  // it to say wrongly. The assertion that still matters is the one this case was really about: a
  // non-added outcome is reported in the SHARED region, which is the card's only channel because
  // the button is unmounted by the revalidation before any flash on it could be read (#956).
  it("the card variant reports a non-added outcome in the shared region, and carries no text", async () => {
    addToCart.mockResolvedValue({ kind: "none", reason: "SOLD_OUT" });
    const { region } = renderButton("card");
    const add = screen.getByRole("button", { name: `Add ${NAME} to cart` });
    fireEvent.click(add);
    await waitFor(() => expect(region.textContent).toBe(`${NAME} is sold out. Nothing was added.`));
    expect(add.textContent).toBe("");
  });
});

describe("AddToCartButton accessible names", () => {
  // #1185 removed the card's pre-add minus/plus picker, reversing #956's Gate 1 decision by owner
  // instruction on 2026-10-20. The product-naming obligation #956 established is unchanged and is
  // what this case now covers: with no visible text left, `label` is the control's ONLY accessible
  // name, so dropping it would recreate #956's "every card's button is named Add" defect in a worse
  // form. The absence of the picker is asserted in tests/product-card-controls.test.tsx.
  it("card: the single add control is named for the product", () => {
    renderButton("card");
    expect(screen.getByRole("button", { name: `Add ${NAME} to cart` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Decrease quantity of ${NAME}` })).toBeNull();
    expect(screen.queryByRole("button", { name: `Increase quantity of ${NAME}` })).toBeNull();
  });

  it.each(["card", "drawer", "full"] as const)(
    "%s: the out-of-stock button is named for the product",
    (variant) => {
      render(<AddToCartButton productId="p-1" productName={NAME} variant={variant} disabled />);
      const button = screen.getByRole("button", { name: `${NAME} is out of stock` });
      expect(button.textContent).toContain("Out of stock");
    },
  );
});

describe("CartFeedbackProvider region", () => {
  it("is a single status region, present and empty before any add", () => {
    const { region } = renderButton("card");
    expect(document.querySelectorAll("[data-cart-feedback]")).toHaveLength(1);
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");
  });
});
