/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ProductRating } from "@/components/product/ProductRating";

describe("ProductRating component", () => {
  it("returns null and renders nothing when reviewCount is 0", () => {
    const { container } = render(<ProductRating averageRating={0} reviewCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders rating and count when reviewCount is >= 1", () => {
    const { getByText } = render(<ProductRating averageRating={4.2} reviewCount={5} />);
    expect(getByText("4.2")).toBeDefined();
    expect(getByText("(5)")).toBeDefined();
  });
});

