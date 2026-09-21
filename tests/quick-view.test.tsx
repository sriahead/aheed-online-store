// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuickViewDrawer } from "@/components/product/QuickViewDrawer";
import { QuickViewProvider, useQuickView } from "@/components/product/quick-view-context";
import type { ProductSummary, ProductDetail } from "@/lib/repositories/products";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/categories",
}));
vi.mock("@/features/reviews/submit-review", () => ({ submitReview: vi.fn() }));
vi.mock("@/features/reviews/delete-review", () => ({ deleteReview: vi.fn() }));
vi.mock("@/features/cart/add-to-cart", () => ({ addToCart: vi.fn() }));
vi.mock("@/features/cart/update-quantity", () => ({ updateQuantity: vi.fn() }));

afterEach(cleanup);

const mockProductSummary: ProductSummary = {
  id: "prod-1",
  slug: "golden-paneer-500g",
  name: "Golden Paneer 500g",
  basePrice: 450,
  unitLabel: "500g",
  netContentAmount: 500,
  netContentUnit: "GRAM",
  primaryImage: { storageKey: "products/paneer.webp", alt: "Golden Paneer", isPrimary: true },
  origin: "UK",
  originalPrice: 500,
  isHalal: true,
  isFresh: true,
  isOrganic: false,
  isVegetarian: true,
  isGlutenFree: true,
  isHmcCertified: true,
  brand: { id: "b1", name: "Dairy Best", slug: "dairy-best" },
  averageRating: 4.8,
  reviewCount: 15,
  inStock: true,
  stockQuantity: 20,
  lowStockThreshold: 3,
  tier: null,
};

const mockProductDetail: ProductDetail = {
  ...mockProductSummary,
  description: "Fresh and delicious paneer cheese block.",
  images: [
    { storageKey: "products/paneer-1.webp", alt: "Paneer Front", isPrimary: true },
    { storageKey: "products/paneer-2.webp", alt: "Paneer Back", isPrimary: false },
  ],
  hmcReference: "HMC-12345",
};

const mockApiResponse = {
  product: mockProductDetail,
  reviews: [
    {
      id: "rev-1",
      userId: "user-1",
      rating: 5,
      comment: "Super fresh paneer, will buy again!",
      reviewerName: "Amina K.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "rev-2",
      userId: "user-2",
      rating: 4,
      comment: "Good quality.",
      reviewerName: "Bilal S.",
      createdAt: new Date().toISOString(),
    },
  ],
  existingReview: null,
  currentUser: { id: "user-1", name: "Amina K." },
  cdnBaseUrl: "https://cdn.example.com",
};

function TestComponent() {
  const { openQuickView } = useQuickView();
  return (
    <div>
      <button type="button" onClick={() => openQuickView("golden-paneer-500g", mockProductSummary)}>
        Open Quick View
      </button>
      <QuickViewDrawer />
    </div>
  );
}

describe("QuickViewDrawer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => mockApiResponse,
      })),
    );
  });

  it("does not render when drawer is closed", () => {
    const { container } = render(
      <QuickViewProvider>
        <QuickViewDrawer />
      </QuickViewProvider>,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("opens drawer and displays product details upon triggering Quick View", async () => {
    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Quick View" })).toBeTruthy();
    expect(screen.getByText("Golden Paneer 500g")).toBeTruthy();
    expect(screen.getByText("£4.50")).toBeTruthy();
    expect(screen.getByText("In stock")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Fresh and delicious paneer cheese block.")).toBeTruthy();
    });

    expect(screen.getAllByText("Dairy Best").length).toBeGreaterThan(0);
    expect(screen.getByText("HMC certification reference: HMC-12345")).toBeTruthy();
  });

  it("displays existing reviews and ratings in the drawer", async () => {
    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));

    await waitFor(() => {
      expect(screen.getByText("Amina K. — 5/5")).toBeTruthy();
      expect(screen.getByText("Super fresh paneer, will buy again!")).toBeTruthy();
      expect(screen.getByText("Bilal S. — 4/5")).toBeTruthy();
      expect(screen.getByText("Good quality.")).toBeTruthy();
    });
  });

  it("renders review form for logged in user and allows deleting own review", async () => {
    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));

    await waitFor(() => {
      expect(screen.getByText("Leave a review")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Submit review" })).toBeTruthy();
      // Amina K. (user-1) is currentUser, so Delete button exists on rev-1
      expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    });
  });

  it("allows selecting a star rating by clicking stars (1–5)", async () => {
    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));

    await waitFor(() => {
      expect(screen.getByText("Your rating")).toBeTruthy();
      expect(screen.getByText("Select rating")).toBeTruthy();
    });

    const star4 = screen.getByRole("radio", { name: "4 stars" });
    fireEvent.click(star4);

    expect((star4 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("4 stars")).toBeTruthy();

    // Click to update rating to 5 stars
    const star5 = screen.getByRole("radio", { name: "5 stars" });
    fireEvent.click(star5);

    expect((star5 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("5 stars")).toBeTruthy();
  });

  it("shows login link when user is not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...mockApiResponse,
          currentUser: null,
        }),
      })),
    );

    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
      expect(screen.queryByText("Leave a review")).toBeNull();
    });
  });

  it("closes when the close button is clicked", async () => {
    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    const closeButton = screen.getByRole("button", { name: "Close Quick View" });
    fireEvent.click(closeButton);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when Escape key is pressed", async () => {
    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Open Quick View"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
