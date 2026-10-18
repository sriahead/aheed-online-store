// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * #1145 R7–R9 — the Quick Shop form's copy: the textarea's label, the one-sentence quantity hint
 * (both branches) and the submit button.
 *
 * The two server actions are mocked (the pattern `tests/shop-your-list-save-prompt.test.tsx` uses),
 * because nothing here submits. Hint text is compared whitespace-normalised, since JSX splits it
 * across a span and `{" "}`.
 */

vi.mock("@/features/cart/match-list", () => ({ matchList: vi.fn() }));
vi.mock("@/features/lists/save-list-from-match", () => ({ saveListFromMatch: vi.fn() }));
vi.mock("@/components/cart/ListReview", () => ({ ListReview: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { ShopYourList } = await import("@/components/cart/ShopYourList");

function hintText(container: HTMLElement): string | undefined {
  const hint = [...container.querySelectorAll("p")].find((p) =>
    p.textContent?.includes("Add a number for more than one"),
  );
  return hint?.textContent?.replace(/\s+/g, " ").trim();
}

afterEach(cleanup);

describe("Quick Shop copy (#1145)", () => {
  it("labels the textarea with the whole instruction (R7)", () => {
    const { container } = render(<ShopYourList exampleNames={[]} />);
    const field = screen.getByLabelText("Paste your list, one item per line.");
    expect(field).toBe(container.querySelector("textarea#list"));
  });

  it("names the vendor's example product in the hint (R8)", () => {
    const { container } = render(<ShopYourList exampleNames={["Desk Lamp"]} />);
    expect(hintText(container)).toBe(
      "Add a number for more than one: 2 Desk Lamp (up to 100 items)",
    );
  });

  it("uses the neutral hint when the vendor has no example product (R8)", () => {
    const { container } = render(<ShopYourList exampleNames={[]} />);
    expect(hintText(container)).toBe(
      "Add a number for more than one, like 2 before the item (up to 100 items)",
    );
  });

  it("submits with a Find my items button (R9)", () => {
    render(<ShopYourList exampleNames={[]} />);
    const button = screen.getByRole("button", { name: "Find my items" });
    expect(button.getAttribute("type")).toBe("submit");
  });
});
