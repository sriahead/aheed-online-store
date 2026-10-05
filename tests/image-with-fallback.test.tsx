// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

/**
 * #655 — every storefront image of a stored object renders through `ImageWithFallback`, so a
 * missing object shows that surface's own no-image look instead of a broken-image icon.
 *
 * jsdom reports `complete === false` for an image it never fetches, so the component's on-mount
 * check (an image that failed before hydration) never fires here; `fireEvent.error` stands in for
 * the browser's own error event. The pre-hydration case is proven live by
 * `scripts/verify-mobile-layout.ts --block-urls` (specs/2026-10-04-p979-655-storefront-finish).
 */

afterEach(cleanup);

describe("ImageWithFallback", () => {
  it("renders the image with the attributes it was given", () => {
    render(
      <ImageWithFallback
        src="https://cdn.example/products/p1/a.webp"
        alt="A product photo"
        width={800}
        height={600}
        loading="eager"
        fetchPriority="high"
        draggable={false}
        className="h-full w-full"
        fallback={<div data-testid="fallback" />}
      />,
    );

    const img = screen.getByAltText("A product photo");
    expect(img.getAttribute("src")).toBe("https://cdn.example/products/p1/a.webp");
    expect(img.getAttribute("width")).toBe("800");
    expect(img.getAttribute("height")).toBe("600");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.getAttribute("class")).toBe("h-full w-full");
    expect(screen.queryByTestId("fallback")).toBeNull();
  });

  it("swaps to the fallback when the object is missing", () => {
    const { container } = render(
      <ImageWithFallback
        src="https://cdn.example/products/gone/main.svg"
        alt="A product photo"
        fallback={<div data-testid="fallback" className="bg-surface-muted" />}
      />,
    );

    fireEvent.error(screen.getByAltText("A product photo"));

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("fallback")).toBeTruthy();
  });

  it("renders nothing after an error when the fallback is null", () => {
    const { container } = render(
      <ImageWithFallback
        src="https://cdn.example/campaigns/gone.webp"
        alt=""
        className="absolute inset-0"
        fallback={null}
      />,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(container.innerHTML).toBe("");
  });
});
