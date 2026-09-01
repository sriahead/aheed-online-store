import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #502 — what the image pipeline sources from, and what it admits about it.
 *
 * Two properties, both of which were wrong before this slice:
 *
 * 1. `needsReview` was set ONLY for an AI-generated image. That had the rule
 *    backwards — a third-party photo matched on a keyword search is the result
 *    most likely to be the wrong product, and it was the one written WITHOUT
 *    the "Image Needs Review" flag the admin list already renders.
 * 2. There was no way to skip Open Food Facts. An operator watching it return
 *    the same wrong image repeatedly had nothing to turn off.
 *
 * The service ports are mocked rather than the network, because that is the
 * seam the pipeline actually depends on; `tests/product-metadata.test.ts` covers
 * the Open Food Facts request and its relevance rule directly.
 */

const putObject = vi.fn(async (_key: string, _body: unknown, _contentType?: string) => {});
const generateImage = vi.fn(async () => new ArrayBuffer(8));
const fetchImageUrl = vi.fn(async () => null as string | null);

vi.mock("@/lib/storage", () => ({ getStorage: () => ({ putObject }) }));
vi.mock("@/lib/image-generation", () => ({
  getImageGenerationService: () => ({ generateImage }),
}));
vi.mock("@/lib/product-metadata", () => ({
  getProductMetadataService: () => ({ fetchImageUrl }),
}));

const { runProductImagePipeline } = await import("@/lib/product-image-pipeline");

beforeEach(() => {
  putObject.mockClear();
  generateImage.mockClear();
  fetchImageUrl.mockClear();
  fetchImageUrl.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runProductImagePipeline", () => {
  it("flags an Open Food Facts image as needing review", async () => {
    fetchImageUrl.mockResolvedValue("https://images.openfoodfacts.org/paneer.jpg");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );

    const result = await runProductImagePipeline("p1", "Golden Paneer 500g");

    expect(result).not.toBeNull();
    expect(result!.needsReview).toBe(true);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("flags an AI-generated image as needing review", async () => {
    const result = await runProductImagePipeline("p1", "Golden Paneer 500g");

    expect(result).not.toBeNull();
    expect(result!.needsReview).toBe(true);
    expect(generateImage).toHaveBeenCalledOnce();
  });

  it("consults Open Food Facts by default", async () => {
    await runProductImagePipeline("p1", "Golden Paneer 500g");
    expect(fetchImageUrl).toHaveBeenCalledOnce();
  });

  it("skips Open Food Facts entirely when the operator switches it off", async () => {
    const result = await runProductImagePipeline("p1", "Golden Paneer 500g", null, {
      useOpenFoodFacts: false,
    });

    expect(fetchImageUrl).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
  });

  it("writes the generated image to a per-product key", async () => {
    const result = await runProductImagePipeline("p1", "Golden Paneer 500g");

    expect(putObject).toHaveBeenCalledOnce();
    expect(putObject.mock.calls[0][0]).toBe(result!.imageKey);
    expect(result!.imageKey.startsWith("products/p1/")).toBe(true);
  });

  it("returns null when neither source produces an image", async () => {
    generateImage.mockResolvedValueOnce(null as unknown as ArrayBuffer);
    const result = await runProductImagePipeline("p1", "Golden Paneer 500g");

    expect(result).toBeNull();
    expect(putObject).not.toHaveBeenCalled();
  });
});
