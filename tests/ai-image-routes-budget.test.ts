import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1017 (R30, R31) — the three staff image routes charge the session vendor's daily AI budget, and
 * a refusal is never mistaken for a product the pipeline can never fill: the backfill must stop
 * without `recordImageAttemptFailure`, or a spent budget would write off products for good (#523).
 */

const REFUSED = { allowed: false, usedNeurons: 3012.4, budgetNeurons: 3000 };
const REFUSAL_TEXT =
  "This store has used its AI allowance for today (3,013 of 3,000 neurons). It resets at 00:00 UTC.";

const check = vi.fn(async () => ({ allowed: true, usedNeurons: 0, budgetNeurons: 3000 }));
const recordImage = vi.fn(async () => {});
const createAiMeter = vi.fn((_prisma: unknown, _vendorId: string, _feature: string) => ({
  check,
  record: vi.fn(),
  recordImage,
}));
const runProductImagePipeline = vi.fn();
const recordImageAttemptFailure = vi.fn(async () => {});
const saveGeneratedProductImage = vi.fn(async () => {});
const getProductsWithoutImages = vi.fn(async () => [
  { id: "p1", name: "Paneer" },
  { id: "p2", name: "Atta" },
  { id: "p3", name: "Dhania" },
]);
const generateImage = vi.fn(async () => new ArrayBuffer(8));
const putObject = vi.fn(async () => {});

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: vi.fn(async () => ({ ok: true, vendorId: "v1", via: "VENDOR" })),
}));
vi.mock("@/lib/ai-meter-service", () => ({
  getVendorAiMeter: (vendorId: string, feature: string) => createAiMeter({}, vendorId, feature),
}));
vi.mock("@/lib/product-image-pipeline", () => ({ runProductImagePipeline }));
vi.mock("@/lib/products-service", () => ({
  getProductsWithoutImages,
  recordImageAttemptFailure,
  saveGeneratedProductImage,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/categories-service", () => ({
  getCategoryForAdmin: vi.fn(async () => ({ name: "Dairy" })),
}));
vi.mock("@/lib/campaigns-service", () => ({
  getCampaignForVendorCategory: vi.fn(async () => ({
    headline: "Fresh",
    subtitle: null,
    altText: null,
  })),
  saveCampaignImageForVendor: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/image-generation", () => ({
  getImageGenerationService: () => ({ generateImage }),
  IMAGE_GENERATION_MODEL: "@cf/black-forest-labs/flux-1-schnell",
}));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ putObject }) }));

const backfill = await import("@/app/api/admin/jobs/backfill-images/route");
const productImage = await import("@/app/api/admin/product-images/generate/route");
const campaign = await import("@/app/api/admin/campaign-images/generate/route");

const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("image backfill (R30)", () => {
  it("stops at a budget refusal, writes no product off, and reports the allowance", async () => {
    runProductImagePipeline
      .mockResolvedValueOnce({ imageKey: "k1", needsReview: true, source: "AI_GENERATED" })
      .mockResolvedValueOnce({ budgetRefused: REFUSED });

    const response = await backfill.POST(post({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: REFUSAL_TEXT, processed: 1, totalFound: 3 });
    expect(runProductImagePipeline).toHaveBeenCalledTimes(2);
    expect(recordImageAttemptFailure).not.toHaveBeenCalled();
    expect(createAiMeter).toHaveBeenCalledWith({}, "v1", "PRODUCT_IMAGE");
  });

  it("passes the vendor's meter to every pipeline run", async () => {
    runProductImagePipeline.mockResolvedValue(null);
    await backfill.POST(post({}));
    for (const call of runProductImagePipeline.mock.calls) {
      expect(call[3]).toMatchObject({ aiMeter: expect.objectContaining({ check }) });
    }
  });
});

describe("single product image (R30)", () => {
  it("answers 429 with the allowance text when the budget refuses", async () => {
    runProductImagePipeline.mockResolvedValueOnce({ budgetRefused: REFUSED });
    const response = await productImage.POST(post({ productId: "p1", productName: "Paneer" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: REFUSAL_TEXT });
    expect(saveGeneratedProductImage).not.toHaveBeenCalled();
  });
});

describe("campaign image (R31)", () => {
  it("answers 429 with the allowance text and generates nothing when refused", async () => {
    check.mockResolvedValueOnce(REFUSED);
    const response = await campaign.POST(post({ categoryId: "c1" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: REFUSAL_TEXT });
    expect(generateImage).not.toHaveBeenCalled();
    expect(recordImage).not.toHaveBeenCalled();
    expect(createAiMeter).toHaveBeenCalledWith({}, "v1", "CAMPAIGN_IMAGE");
  });

  it("charges one image after the bytes come back", async () => {
    const response = await campaign.POST(post({ categoryId: "c1" }));

    expect(response.status).toBe(200);
    expect(recordImage).toHaveBeenCalledExactlyOnceWith({
      model: "@cf/black-forest-labs/flux-1-schnell",
    });
  });
});
