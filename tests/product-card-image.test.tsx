// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductImage } from "@/components/product/ProductImage";

/**
 * #502 — a product image whose object is missing must look like a product
 * without a photo, not like a broken page.
 *
 * WHY THIS IS WORTH A TEST. The `ProductImage` row and the stored object are
 * written by different systems, so a row can outlive its object. Staging spent
 * this slice's lifetime referencing placeholder keys that returned 404 from its
 * bucket, and every card rendered the browser's broken-image icon with alt text
 * sitting where the photo should be. Repairing the bucket fixes that instance;
 * this fallback is what removes the failure MODE, in any environment and
 * whatever the bucket state.
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock at
 * the top is what gives this file a DOM — same opt-in as
 * `tests/order-items-card.test.tsx`.
 */

afterEach(cleanup);

describe("ProductImage", () => {
  it("renders the image while it loads successfully", () => {
    render(<ProductImage src="https://cdn.example/products/p1/a.webp" alt="Golden Paneer 500g" />);

    const img = screen.getByAltText("Golden Paneer 500g");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://cdn.example/products/p1/a.webp");
  });

  it("swaps to the no-image box when the object is missing", () => {
    const { container } = render(
      <ProductImage src="https://cdn.example/products/gone/main.svg" alt="Golden Paneer 500g" />,
    );

    fireEvent.error(screen.getByAltText("Golden Paneer 500g"));

    expect(screen.queryByAltText("Golden Paneer 500g")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // The same grey box ProductCard renders for a product with no image at all,
    // so a shopper cannot tell a missing object from an absent photo.
    expect(container.querySelector(".bg-surface-muted")).toBeTruthy();
  });

  it("carries intrinsic dimensions so the box is reserved before the bytes land", () => {
    render(<ProductImage src="https://cdn.example/products/p1/a.webp" alt="Golden Paneer 500g" />);

    const img = screen.getByAltText("Golden Paneer 500g");
    expect(img.getAttribute("width")).toBe("400");
    expect(img.getAttribute("height")).toBe("300");
    expect(img.getAttribute("loading")).toBe("lazy");
  });
});
