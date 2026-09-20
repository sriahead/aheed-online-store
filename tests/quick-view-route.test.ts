import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/products/quick-view/route";

const mockGetBySlug = vi.fn();
const mockListByProduct = vi.fn();
const mockGetByUserAndProduct = vi.fn();
const mockGetSession = vi.fn();
const mockGetCurrentVendorIdOrNull = vi.fn();

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/products-service", () => ({
  getProductRepository: () => ({ getBySlug: mockGetBySlug }),
}));
vi.mock("@/lib/reviews-service", () => ({
  getReviewRepository: () => ({
    listByProduct: mockListByProduct,
    getByUserAndProduct: mockGetByUserAndProduct,
  }),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({ api: { getSession: mockGetSession } }),
}));
vi.mock("@/lib/tenant", () => ({
  getCurrentVendorIdOrNull: () => mockGetCurrentVendorIdOrNull(),
}));
vi.mock("@/lib/config", () => ({
  getEnv: () => ({ CDN_BASE_URL: "https://cdn.example.com" }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

describe("GET /api/products/quick-view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentVendorIdOrNull.mockResolvedValue("vendor-1");
  });

  it("returns 400 when slug parameter is missing", async () => {
    const request = new Request("http://localhost/api/products/quick-view");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, any>;
    expect(body.error).toBe("Missing product slug");
  });

  it("returns 404 when vendor cannot be identified", async () => {
    mockGetCurrentVendorIdOrNull.mockResolvedValue(null);
    const request = new Request("http://localhost/api/products/quick-view?slug=test-prod");
    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, any>;
    expect(body.error).toBe("Vendor not found");
  });

  it("returns 404 when product is not found", async () => {
    mockGetBySlug.mockResolvedValue(null);
    const request = new Request("http://localhost/api/products/quick-view?slug=non-existent");
    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, any>;
    expect(body.error).toBe("Product not found");
  });

  it("returns product, reviews, existingReview, and session when product exists", async () => {
    const mockProduct = {
      id: "prod-1",
      slug: "golden-paneer",
      name: "Golden Paneer",
      basePrice: 450,
    };
    const mockReviews = [
      { id: "rev-1", rating: 5, comment: "Great paneer", reviewerName: "Shopper 1" },
    ];
    const mockExistingReview = { rating: 5, comment: "Great paneer" };

    mockGetBySlug.mockResolvedValue(mockProduct);
    mockListByProduct.mockResolvedValue(mockReviews);
    mockGetByUserAndProduct.mockResolvedValue(mockExistingReview);
    mockGetSession.mockResolvedValue({ user: { id: "user-1", name: "Shopper 1" } });

    const request = new Request("http://localhost/api/products/quick-view?slug=golden-paneer");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.product).toEqual(mockProduct);
    expect(body.reviews).toEqual(mockReviews);
    expect(body.existingReview).toEqual(mockExistingReview);
    expect(body.currentUser).toEqual({ id: "user-1", name: "Shopper 1" });
    expect(body.cdnBaseUrl).toBe("https://cdn.example.com");
  });
});
