// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
import type { ProductImageSummary } from "@/lib/repositories/products";

afterEach(cleanup);

const mockImages: ProductImageSummary[] = [
  { storageKey: "products/item-1.webp", alt: "Product View 1", isPrimary: true },
  { storageKey: "products/item-2.webp", alt: "Product View 2", isPrimary: false },
  { storageKey: "products/item-3.webp", alt: "Product View 3", isPrimary: false },
];

describe("ProductImageGallery — Carousel Mode (R1–R9)", () => {
  it("renders empty state placeholder when images array is empty", () => {
    const { container } = render(
      <ProductImageGallery images={[]} cdnBaseUrl="https://cdn.example.com" variant="carousel" />,
    );
    expect(container.querySelector(".bg-surface-muted")).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("renders single image without arrow controls or pagination indicators (R6)", () => {
    render(
      <ProductImageGallery
        images={[mockImages[0]]}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    const img = screen.getByAltText("Product View 1") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain("products/item-1.webp");

    // Arrows and indicators should not be rendered
    expect(screen.queryByLabelText("Previous product image")).toBeNull();
    expect(screen.queryByLabelText("Next product image")).toBeNull();
    expect(screen.queryByText(/1 \/ 1/)).toBeNull();
  });

  it("renders multiple images with navigation arrows, dots, and counter (R1, R2, R5)", () => {
    render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    expect(screen.getByLabelText("Previous product image")).toBeTruthy();
    expect(screen.getByLabelText("Next product image")).toBeTruthy();
    expect(screen.getByText("1 / 3")).toBeTruthy();

    // 3 indicator dots
    expect(screen.getByLabelText("Go to image 1 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Go to image 2 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Go to image 3 of 3")).toBeTruthy();
  });

  it("navigates forward and backward with arrow buttons, wrapping around (R3)", () => {
    render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    const nextBtn = screen.getByLabelText("Next product image");
    const prevBtn = screen.getByLabelText("Previous product image");

    expect(screen.getByText("1 / 3")).toBeTruthy();

    // Next -> 2
    fireEvent.click(nextBtn);
    expect(screen.getByText("2 / 3")).toBeTruthy();

    // Next -> 3
    fireEvent.click(nextBtn);
    expect(screen.getByText("3 / 3")).toBeTruthy();

    // Next wraps to 1
    fireEvent.click(nextBtn);
    expect(screen.getByText("1 / 3")).toBeTruthy();

    // Prev wraps to 3
    fireEvent.click(prevBtn);
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("navigates directly when clicking pagination dot (R5)", () => {
    render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    expect(screen.getByText("1 / 3")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Go to image 2 of 3"));
    expect(screen.getByText("2 / 3")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Go to image 3 of 3"));
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("supports touch swipe gestures on touch devices (R4)", () => {
    render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    const carousel = screen.getByRole("region", { name: "Product images" });

    // Swipe left (advance to next image)
    fireEvent.touchStart(carousel, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(carousel, {
      changedTouches: [{ clientX: 120, clientY: 105 }], // deltaX = -80
    });

    expect(screen.getByText("2 / 3")).toBeTruthy();

    // Swipe right (go back to previous image)
    fireEvent.touchStart(carousel, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(carousel, {
      changedTouches: [{ clientX: 180, clientY: 102 }], // deltaX = +80
    });

    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("supports keyboard navigation with ArrowLeft and ArrowRight (R8)", () => {
    render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    const nextBtn = screen.getByLabelText("Next product image");

    fireEvent.keyDown(nextBtn, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeTruthy();

    fireEvent.keyDown(nextBtn, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("uses smooth horizontal sliding transitions with motion-reduce override (R7)", () => {
    const { container } = render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="carousel"
      />,
    );

    const slidingTrack = container.querySelector(".transition-transform");
    expect(slidingTrack).toBeTruthy();
    expect(slidingTrack?.className).toContain("duration-300");
    expect(slidingTrack?.className).toContain("motion-reduce:transition-none");
  });

  it("preserves backward-compatible stacked layout when variant is 'stacked'", () => {
    const { container } = render(
      <ProductImageGallery
        images={mockImages}
        cdnBaseUrl="https://cdn.example.com"
        variant="stacked"
      />,
    );

    expect(container.querySelector(".flex-col")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Product images" })).toBeNull();
    expect(screen.queryByLabelText("Next product image")).toBeNull();
  });
});
