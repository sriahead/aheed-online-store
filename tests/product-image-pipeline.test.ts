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
  IMAGE_GENERATION_MODEL: "@cf/black-forest-labs/flux-1-schnell",
}));
vi.mock("@/lib/product-metadata", () => ({
  getProductMetadataService: () => ({ fetchImageUrl }),
}));

const { runProductImagePipeline } = await import("@/lib/product-image-pipeline");
type Pipeline = typeof runProductImagePipeline;
type Outcome = Awaited<ReturnType<Pipeline>>;
type Generated = Exclude<Outcome, null | { budgetRefused: unknown }>;

/** #1017 — a vendor meter for the pipeline's required option; allows unless told otherwise. */
function meter(allowed = true) {
  return {
    check: vi.fn(async () => ({ allowed, usedNeurons: allowed ? 0 : 3000, budgetNeurons: 3000 })),
    record: vi.fn(async () => {}),
    recordImage: vi.fn(async () => {}),
  };
}

/** The pre-#1017 call shape, with an allowing meter: most cases here are about sourcing. */
async function run(name: string, options: { useOpenFoodFacts?: boolean } = {}) {
  return (await runProductImagePipeline("p1", name, null, {
    ...options,
    aiMeter: meter(),
  })) as Generated | null;
}

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

    const result = await run("Golden Paneer 500g");

    expect(result).not.toBeNull();
    expect(result!.needsReview).toBe(true);
    expect(generateImage).not.toHaveBeenCalled();
    // #900 (R5) — provenance travels with the result, so the row records where it came from.
    expect(result!.source).toBe("OPEN_FOOD_FACTS");
  });

  it("flags an AI-generated image as needing review", async () => {
    const result = await run("Golden Paneer 500g");

    expect(result).not.toBeNull();
    expect(result!.needsReview).toBe(true);
    expect(generateImage).toHaveBeenCalledOnce();
    expect(result!.source).toBe("AI_GENERATED");
  });

  it("reports AI_GENERATED when Open Food Facts matched but its image could not be fetched", async () => {
    fetchImageUrl.mockResolvedValue("https://images.openfoodfacts.org/paneer.jpg");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, headers: new Headers() })),
    );

    const result = await run("Golden Paneer 500g");

    expect(generateImage).toHaveBeenCalledOnce();
    expect(result!.source).toBe("AI_GENERATED");
  });

  it("consults Open Food Facts by default", async () => {
    await run("Golden Paneer 500g");
    expect(fetchImageUrl).toHaveBeenCalledOnce();
  });

  it("skips Open Food Facts entirely when the operator switches it off", async () => {
    const result = await run("Golden Paneer 500g", { useOpenFoodFacts: false });

    expect(fetchImageUrl).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
  });

  it("writes the generated image to a per-product key", async () => {
    const result = await run("Golden Paneer 500g");

    expect(putObject).toHaveBeenCalledOnce();
    expect(putObject.mock.calls[0][0]).toBe(result!.imageKey);
    expect(result!.imageKey.startsWith("products/p1/")).toBe(true);
  });

  it("returns null when neither source produces an image", async () => {
    generateImage.mockResolvedValueOnce(null as unknown as ArrayBuffer);
    const result = await run("Golden Paneer 500g");

    expect(result).toBeNull();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("does not generate, store or charge anything when the vendor's AI budget refuses (#1017 R30)", async () => {
    const aiMeter = meter(false);
    const result = await runProductImagePipeline("p1", "Golden Paneer 500g", null, { aiMeter });

    expect(result).toEqual({
      budgetRefused: { allowed: false, usedNeurons: 3000, budgetNeurons: 3000 },
    });
    expect(generateImage).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(aiMeter.recordImage).not.toHaveBeenCalled();
  });

  it("charges one image to the vendor meter after the AI generates one", async () => {
    const aiMeter = meter();
    await runProductImagePipeline("p1", "Golden Paneer 500g", null, { aiMeter });

    expect(aiMeter.check).toHaveBeenCalledOnce();
    expect(aiMeter.recordImage).toHaveBeenCalledExactlyOnceWith({
      model: "@cf/black-forest-labs/flux-1-schnell",
    });
  });

  it("neither checks nor charges the meter when Open Food Facts supplies the image", async () => {
    fetchImageUrl.mockResolvedValue("https://images.openfoodfacts.org/paneer.jpg");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
    const aiMeter = meter(false);
    const result = await runProductImagePipeline("p1", "Golden Paneer 500g", null, { aiMeter });

    expect(result).toMatchObject({ source: "OPEN_FOOD_FACTS" });
    expect(aiMeter.check).not.toHaveBeenCalled();
    expect(aiMeter.recordImage).not.toHaveBeenCalled();
  });
});
