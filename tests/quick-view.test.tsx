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
  stockMode: "TRACKED",
  lowStockThreshold: 3,
  expectedRestockDay: null,
  tier: null,
  cardSpecifications: [],
};

const mockProductDetail: ProductDetail = {
  ...mockProductSummary,
  description: "Fresh and delicious paneer cheese block.",
  acceptsNote: false,
  images: [
    { storageKey: "products/paneer-1.webp", alt: "Paneer Front", isPrimary: true },
    { storageKey: "products/paneer-2.webp", alt: "Paneer Back", isPrimary: false },
  ],
  hmcReference: "HMC-12345",
  specifications: [],
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

  it("uses in-memory cache to avoid duplicate network fetches on reopen", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => mockApiResponse,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QuickViewProvider>
        <TestComponent />
      </QuickViewProvider>,
    );

    // First open
    fireEvent.click(screen.getByText("Open Quick View"));
    await waitFor(() => {
      expect(screen.getByText("Fresh and delicious paneer cheese block.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Close
    fireEvent.click(screen.getByLabelText("Close Quick View"));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Second open — should read from cache
    fireEvent.click(screen.getByText("Open Quick View"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Fresh and delicious paneer cheese block.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("instantly hydrates image with provided cdnBaseUrl before network response", async () => {
    function CustomOpener() {
      const { openQuickView } = useQuickView();
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              openQuickView("golden-paneer-500g", mockProductSummary, "https://images.example.com")
            }
          >
            Instant Open
          </button>
          <QuickViewDrawer />
        </div>
      );
    }

    render(
      <QuickViewProvider>
        <CustomOpener />
      </QuickViewProvider>,
    );

    fireEvent.click(screen.getByText("Instant Open"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const img = screen.getByRole("img", { name: "Golden Paneer" });
    expect(img.getAttribute("src")).toContain("https://images.example.com");
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

    const star4 = screen.getByRole("radio", { name: /4 stars/ });
    fireEvent.click(star4);

    expect((star4 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Very Good")).toBeTruthy();

    // Click to update rating to 5 stars
    const star5 = screen.getByRole("radio", { name: /5 stars/ });
    fireEvent.click(star5);

    expect((star5 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Excellent")).toBeTruthy();
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

  it("never leaks images or descriptions across different products when switching Quick View", async () => {
    const mockNuggetsSummary: ProductSummary = {
      ...mockProductSummary,
      id: "prod-2",
      slug: "frozen-chicken-nuggets",
      name: "Chicken Nuggets 500g",
      basePrice: 349,
      unitLabel: "500g",
      primaryImage: {
        storageKey: "products/nuggets.webp",
        alt: "Chicken Nuggets 500g",
        isPrimary: true,
      },
    };

    const mockNuggetsDetail: ProductDetail = {
      ...mockNuggetsSummary,
      description: "Halal-certified breaded chicken nuggets.",
      acceptsNote: false,
      images: [
        { storageKey: "products/nuggets-1.webp", alt: "Chicken Nuggets Pack", isPrimary: true },
      ],
      hmcReference: null,
      specifications: [],
    };

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("frozen-chicken-nuggets")) {
        return {
          ok: true,
          json: async () => ({
            ...mockApiResponse,
            product: mockNuggetsDetail,
          }),
        };
      }
      return {
        ok: true,
        json: async () => mockApiResponse,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    function MultiProductTest() {
      const { openQuickView } = useQuickView();
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              openQuickView("golden-paneer-500g", mockProductSummary, "https://cdn.example.com")
            }
          >
            Open Paneer
          </button>
          <button
            type="button"
            onClick={() =>
              openQuickView("frozen-chicken-nuggets", mockNuggetsSummary, "https://cdn.example.com")
            }
          >
            Open Nuggets
          </button>
          <QuickViewDrawer />
        </div>
      );
    }

    render(
      <QuickViewProvider>
        <MultiProductTest />
      </QuickViewProvider>,
    );

    // Open first product: Paneer
    fireEvent.click(screen.getByText("Open Paneer"));
    await waitFor(() => {
      expect(screen.getByText("Golden Paneer 500g")).toBeTruthy();
      expect(screen.getByText("Fresh and delicious paneer cheese block.")).toBeTruthy();
    });

    // Switch to second product: Nuggets
    fireEvent.click(screen.getByText("Open Nuggets"));
    await waitFor(() => {
      expect(screen.getByText("Chicken Nuggets 500g")).toBeTruthy();
      expect(screen.getByText("Halal-certified breaded chicken nuggets.")).toBeTruthy();
    });

    // Ensure paneer description and images are NOT present
    expect(screen.queryByText("Fresh and delicious paneer cheese block.")).toBeNull();
    const imgs = screen.getAllByRole("img");
    const nuggetImg = imgs.find(
      (img) =>
        img.getAttribute("alt") === "Chicken Nuggets Pack" ||
        img.getAttribute("alt") === "Chicken Nuggets 500g",
    );
    expect(nuggetImg).toBeTruthy();
    const paneerImg = imgs.find((img) => img.getAttribute("alt") === "Paneer Front");
    expect(paneerImg).toBeFalsy();
  });
});
