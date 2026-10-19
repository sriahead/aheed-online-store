// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * #1145 R7–R9 — the Quick Shop form's copy: the textarea's label, the one-sentence quantity hint
 * (both branches) and the submit button. #1169 R15–R16 — the hint shows both quantity forms, and
 * both are proven to parse.
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
const { parseListLine } = await import("@/lib/shopping-list");

function hintParagraph(container: HTMLElement): HTMLParagraphElement | undefined {
  return [...container.querySelectorAll("p")].find((p) =>
    /^(For example:|For more than one)/.test(p.textContent?.trim() ?? ""),
  );
}

function hintText(container: HTMLElement): string | undefined {
  return hintParagraph(container)?.textContent?.replace(/\s+/g, " ").trim();
}

afterEach(cleanup);

describe("Quick Shop copy (#1145)", () => {
  it("labels the textarea with the whole instruction (R7)", () => {
    const { container } = render(<ShopYourList exampleNames={[]} />);
    const field = screen.getByLabelText("Paste your list, one item per line.");
    expect(field).toBe(container.querySelector("textarea#list"));
  });

  it("names the vendor's example product in both quantity forms (R8, #1169 R15)", () => {
    const { container } = render(<ShopYourList exampleNames={["Desk Lamp"]} />);
    expect(hintText(container)).toBe(
      "For example: 2 Desk Lamp or Desk Lamp x2 (up to 100 items, one per line)",
    );
    const bold = [...hintParagraph(container)!.querySelectorAll("span.font-semibold")].map((el) =>
      el.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(bold).toEqual(["2 Desk Lamp", "Desk Lamp x2"]);
  });

  it("uses the neutral hint when the vendor has no example product (R8, #1169 R15)", () => {
    const { container } = render(<ShopYourList exampleNames={[]} />);
    expect(hintText(container)).toBe(
      "For more than one, put 2 before the item or x2 after it (up to 100 items, one per line)",
    );
  });

  it("only shows quantity forms the parser reads as 2 of the same item (#1169 R16)", () => {
    // A name ending in a size is the case that matters: "5kg basmati" must not lose its size.
    for (const name of ["Apple Juice 1L", "Desk Lamp"]) {
      const before = parseListLine(`2 ${name}`);
      const after = parseListLine(`${name} x2`);
      expect(before?.quantity).toBe(2);
      expect(after?.quantity).toBe(2);
      expect(after?.terms).toEqual(before?.terms);
    }
  });

  it("submits with a Find my items button (R9)", () => {
    render(<ShopYourList exampleNames={[]} />);
    const button = screen.getByRole("button", { name: "Find my items" });
    expect(button.getAttribute("type")).toBe("submit");
  });
});
