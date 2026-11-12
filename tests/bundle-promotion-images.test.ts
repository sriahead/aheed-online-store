import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBundleImagePrompt,
  buildPromotionBannerPrompt,
  bundleImageAltText,
  describeItems,
  IMAGE_PROMPT_GUARDRAILS,
} from "@/lib/ai-image-prompts";
import { buildGeneratedBundleImageKey, isBundleImageKey } from "@/lib/bundle-image";
import { parsePromotionForm } from "@/lib/promotion-form";

/**
 * #1535 — bundles and promotions get the products' image options: AI generation (metered, flagged
 * for review), a capped "fill missing" run for bundles, and the review flag carried by the form.
 */

const REFUSED = {
  allowed: false,
  scope: "vendor" as const,
  usedNeurons: 3001,
  budgetNeurons: 3000,
};

const role = vi.fn(async (..._roles: string[]) => ({
  ok: true as const,
  vendorId: "v1",
  via: "ADMIN",
}));
const check = vi.fn(async () => ({
  allowed: true,
  scope: "vendor" as const,
  usedNeurons: 0,
  budgetNeurons: 3000,
}));
const recordImage = vi.fn(async () => {});
const getVendorAiMeter = vi.fn((_vendorId: string, _feature: string) => ({
  check,
  record: vi.fn(),
  recordImage,
}));
const generateImage = vi.fn(async (_prompt: string) => new ArrayBuffer(8) as ArrayBuffer | null);
const putObject = vi.fn(async (..._args: unknown[]) => {});
const getBundleForVendor = vi.fn(async (_vendorId: string, _bundleId: string) => ({
  id: "b1",
  name: "4 Medium Chickens",
  altText: null as string | null,
  items: [{ name: "Medium Chicken (1100–1200g)", quantity: 4 }],
}));
const saveBundleImageForVendor = vi.fn(async (..._args: unknown[]) => ({ ok: true, id: "b1" }));
const listBundlesWithoutImagesForVendor = vi.fn(async (_vendorId: string, _limit: number) => [
  { id: "b1", name: "Fish Box", items: [{ name: "Tilapia", quantity: 2 }] },
  { id: "b2", name: "Lamb Pack", items: [{ name: "Lamb Chops", quantity: 1 }] },
  { id: "b3", name: "Veg Box", items: [] },
]);
const describePromotionSubjectForVendor = vi.fn(async (..._args: unknown[]) => "Tilapia");

vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: role }));
vi.mock("@/lib/ai-meter-service", () => ({ getVendorAiMeter }));
vi.mock("@/lib/image-generation", () => ({
  getImageGenerationService: () => ({ generateImage }),
  IMAGE_GENERATION_MODEL: "@cf/black-forest-labs/flux-1-schnell",
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ putObject }),
  composePublicUrl: (base: string, key: string) => `${base}/${key}`,
}));
vi.mock("@/lib/config", () => ({ getEnv: () => ({ CDN_BASE_URL: "https://cdn.test" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/bundles-service", () => ({
  getBundleForVendor,
  saveBundleImageForVendor,
  listBundlesWithoutImagesForVendor,
}));
vi.mock("@/lib/promotions-ai-service", () => ({ describePromotionSubjectForVendor }));

const generate = await import("@/app/api/admin/bundle-images/generate/route");
const backfill = await import("@/app/api/admin/bundle-images/backfill/route");
const banner = await import("@/app/api/admin/promotions/banner-generate/route");

const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prompts", () => {
  it("names the bundle's contents, largest quantity first, and carries the guardrails", () => {
    const prompt = buildBundleImagePrompt("BBQ Pack", [
      { name: "Chicken Wings", quantity: 1 },
      { name: "Lamb Chops", quantity: 3 },
    ]);
    expect(prompt).toContain("3 × Lamb Chops, Chicken Wings");
    expect(prompt).toContain(IMAGE_PROMPT_GUARDRAILS);
    expect(IMAGE_PROMPT_GUARDRAILS).toMatch(/No live animals/);
    expect(IMAGE_PROMPT_GUARDRAILS).toMatch(/No text/);
  });

  it("falls back to the bundle name when it has no items, and caps the list", () => {
    expect(buildBundleImagePrompt("Veg Box", [])).toContain('called "Veg Box": Veg Box,');
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Item ${i}`, quantity: 1 }));
    expect(describeItems(many).split(", ")).toHaveLength(6);
  });

  it("derives alt text from the contents", () => {
    expect(bundleImageAltText("4 Medium Chickens", [{ name: "Medium Chicken", quantity: 4 }])).toBe(
      "4 Medium Chickens: 4 × Medium Chicken",
    );
  });

  it("asks for a banner that never draws the headline", () => {
    const prompt = buildPromotionBannerPrompt("Tilapia", "Fresh Catch Sale");
    expect(prompt).toContain("promotion of Tilapia");
    expect(prompt).toContain("do not write it anywhere");
    expect(buildPromotionBannerPrompt("", "Fresh Catch Sale")).toContain(
      "promotion of Fresh Catch Sale",
    );
  });

  it("gives generated bundle photos a .png key the upload check refuses", () => {
    const key = buildGeneratedBundleImageKey("b1");
    expect(key).toMatch(/^bundles\/b1\/[0-9a-f-]{36}\.png$/);
    expect(isBundleImageKey(key, "b1")).toBe(false);
  });
});

describe("generate a bundle photo", () => {
  it("is admin only", async () => {
    await generate.POST(post({ bundleId: "b1" }));
    expect(role).toHaveBeenCalledWith("ADMIN");
  });

  it("stores the image, meters it as BUNDLE_IMAGE, and saves it flagged for review", async () => {
    const response = await generate.POST(post({ bundleId: "b1" }));
    expect(response.status).toBe(200);

    expect(getVendorAiMeter).toHaveBeenCalledWith("v1", "BUNDLE_IMAGE");
    expect(generateImage.mock.calls[0][0]).toContain("4 × Medium Chicken (1100–1200g)");
    expect(recordImage).toHaveBeenCalledOnce();
    const [key, , contentType] = putObject.mock.calls[0];
    expect(key).toMatch(/^bundles\/b1\/.+\.png$/);
    expect(contentType).toBe("image/png");
    expect(saveBundleImageForVendor).toHaveBeenCalledWith(
      "v1",
      "b1",
      key,
      "4 Medium Chickens: 4 × Medium Chicken (1100–1200g)",
      true,
    );
  });

  it("keeps alt text the admin already wrote", async () => {
    getBundleForVendor.mockResolvedValueOnce({
      id: "b1",
      name: "4 Medium Chickens",
      altText: "Four whole chickens",
      items: [],
    });
    await generate.POST(post({ bundleId: "b1" }));
    expect(saveBundleImageForVendor.mock.calls[0][3]).toBe("Four whole chickens");
  });

  it("refuses with 429 and spends nothing when the budget is used up", async () => {
    check.mockResolvedValueOnce(REFUSED);
    const response = await generate.POST(post({ bundleId: "b1" }));
    expect(response.status).toBe(429);
    expect(generateImage).not.toHaveBeenCalled();
    expect(saveBundleImageForVendor).not.toHaveBeenCalled();
  });

  it("answers 404 for another vendor's or a missing bundle", async () => {
    getBundleForVendor.mockResolvedValueOnce(null as never);
    expect((await generate.POST(post({ bundleId: "nope" }))).status).toBe(404);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("answers 503 when AI is not configured", async () => {
    generateImage.mockResolvedValueOnce(null);
    expect((await generate.POST(post({ bundleId: "b1" }))).status).toBe(503);
    expect(recordImage).not.toHaveBeenCalled();
  });
});

describe("fill missing bundle photos", () => {
  it("asks for a batch of 10 and fills each one, flagged for review", async () => {
    const body = await (await backfill.POST()).json();
    expect(listBundlesWithoutImagesForVendor).toHaveBeenCalledWith("v1", 10);
    expect(body).toEqual({ message: "Bundle photos filled.", processed: 3, totalFound: 3 });
    expect(saveBundleImageForVendor).toHaveBeenCalledTimes(3);
    for (const call of saveBundleImageForVendor.mock.calls) expect(call[4]).toBe(true);
  });

  it("stops at a budget refusal and reports the progress so far", async () => {
    check
      .mockResolvedValueOnce({
        allowed: true,
        scope: "vendor",
        usedNeurons: 0,
        budgetNeurons: 3000,
      })
      .mockResolvedValueOnce(REFUSED);
    const body = await (await backfill.POST()).json();
    expect(body).toMatchObject({ processed: 1, totalFound: 3, budgetRefused: true });
    expect(generateImage).toHaveBeenCalledOnce();
  });

  it("says so when there is nothing to fill", async () => {
    listBundlesWithoutImagesForVendor.mockResolvedValueOnce([]);
    const body = await (await backfill.POST()).json();
    expect(body).toEqual({ message: "Every bundle already has a photo.", processed: 0 });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("carries on past one failure", async () => {
    putObject.mockRejectedValueOnce(new Error("storage down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await backfill.POST()).json();
    expect(body).toMatchObject({ processed: 2, message: "Done, but 1 could not be filled." });
  });
});

describe("generate a promotion banner only", () => {
  it("returns a key and URL without saving the promotion", async () => {
    const response = await banner.POST(post({ headline: "Fresh Catch Sale", productId: "p1" }));
    const body = (await response.json()) as { imageKey: string; imageUrl: string | null };
    expect(response.status).toBe(200);
    expect(body.imageKey).toMatch(/^promotions\/v1\/.+\.png$/);
    expect(body.imageUrl).toBe(`https://cdn.test/${body.imageKey}`);
    expect(describePromotionSubjectForVendor).toHaveBeenCalledWith("v1", {
      productId: "p1",
      bundleId: null,
      categoryId: null,
    });
    expect(generateImage.mock.calls[0][0]).toContain("promotion of Tilapia");
    expect(getVendorAiMeter).toHaveBeenCalledWith("v1", "CAMPAIGN_IMAGE");
  });

  it("refuses when there is neither a target nor a headline", async () => {
    describePromotionSubjectForVendor.mockResolvedValueOnce("");
    expect((await banner.POST(post({}))).status).toBe(400);
    expect(generateImage).not.toHaveBeenCalled();
  });
});

describe("promotion form review flag", () => {
  const base = { headline: "Fresh Catch Sale", targetType: "GENERIC" };

  it("is kept only alongside an image", () => {
    const flagged = parsePromotionForm(
      { ...base, imageKey: "promotions/v1/a.png", imageNeedsReview: "true" },
      "Europe/London",
    );
    expect(flagged.ok && flagged.value.imageNeedsReview).toBe(true);

    const noImage = parsePromotionForm({ ...base, imageNeedsReview: "true" }, "Europe/London");
    expect(noImage.ok && noImage.value.imageNeedsReview).toBe(false);

    const approved = parsePromotionForm(
      { ...base, imageKey: "promotions/v1/a.png", imageNeedsReview: "false" },
      "Europe/London",
    );
    expect(approved.ok && approved.value.imageNeedsReview).toBe(false);
  });
});
