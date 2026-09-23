// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickViewDrawer } from "@/components/product/QuickViewDrawer";
import { QuickViewProvider, useQuickView } from "@/components/product/quick-view-context";
import { formatRestockDay } from "@/lib/restock";
import type { ProductDetail, ProductSummary } from "@/lib/repositories/products";

// Same mocks as tests/product-card-stretched-link.test.tsx and tests/quick-view.test.tsx: the cart
// and review server actions transitively import @prisma/client/wasm, which Vitest cannot resolve.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/categories",
}));
vi.mock("@/features/reviews/submit-review", () => ({ submitReview: vi.fn() }));
vi.mock("@/features/reviews/delete-review", () => ({ deleteReview: vi.fn() }));
vi.mock("@/features/cart/add-to-cart", () => ({ addToCart: vi.fn() }));
vi.mock("@/features/cart/update-quantity", () => ({ updateQuantity: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DAY = "2026-09-28";
const NOTICE = `Back in stock ${formatRestockDay(DAY)}`;

function product(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: "prod-1",
    slug: "golden-paneer-500g",
    name: "Golden Paneer 500g",
    basePrice: 450,
    unitLabel: "500g",
    netContentAmount: null,
    netContentUnit: null,
    primaryImage: null,
    origin: null,
    originalPrice: null,
    isHalal: false,
    isFresh: false,
    isOrganic: false,
    isVegetarian: false,
    isGlutenFree: false,
    isHmcCertified: false,
    brand: null,
    averageRating: 4.5,
    reviewCount: 12,
    inStock: false,
    stockQuantity: 0,
    lowStockThreshold: 3,
    expectedRestockDay: DAY,
    tier: null,
    ...overrides,
  };
}

function renderCard(p: ProductSummary) {
  return render(<ProductCard product={p} cdnBaseUrl="https://cdn.example" cartQuantity={0} />);
}

describe("#876 — ProductCard restock notice (R12)", () => {
  it("shows the notice for an out-of-stock product with a restock day", () => {
    const { container } = renderCard(product());
    expect(container.textContent).toContain(NOTICE);
  });

  it("hides it for an in-stock product even when a day is set", () => {
    const { container } = renderCard(product({ inStock: true, stockQuantity: 12 }));
    expect(container.textContent).not.toContain("Back in stock");
  });

  it("hides it for an out-of-stock product with no day", () => {
    const { container } = renderCard(product({ expectedRestockDay: null }));
    expect(container.textContent).not.toContain("Back in stock");
  });
});

describe("#876 — QuickViewDrawer restock notice (R13)", () => {
  function openDrawerFor(summary: ProductSummary) {
    const detail: ProductDetail = {
      ...summary,
      description: "Fresh paneer.",
      images: [],
      hmcReference: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          product: detail,
          reviews: [],
          existingReview: null,
          currentUser: null,
          cdnBaseUrl: "https://cdn.example.com",
        }),
      })),
    );

    function Trigger() {
      const { openQuickView } = useQuickView();
      return (
        <div>
          <button type="button" onClick={() => openQuickView(summary.slug, summary)}>
            Open Quick View
          </button>
          <QuickViewDrawer />
        </div>
      );
    }

    render(
      <QuickViewProvider>
        <Trigger />
      </QuickViewProvider>,
    );
    fireEvent.click(screen.getByText("Open Quick View"));
  }

  it("shows the notice beside 'Out of stock' when a day is set", async () => {
    openDrawerFor(product());
    await waitFor(() => expect(screen.getByText("Fresh paneer.")).toBeTruthy());
    // The status line and the disabled add-to-cart button both say it.
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(0);
    expect(screen.getByRole("dialog").textContent).toContain(NOTICE);
  });

  it("shows no notice when the day is null", async () => {
    openDrawerFor(product({ expectedRestockDay: null }));
    await waitFor(() => expect(screen.getByText("Fresh paneer.")).toBeTruthy());
    expect(screen.getByRole("dialog").textContent).not.toContain("Back in stock");
  });
});
