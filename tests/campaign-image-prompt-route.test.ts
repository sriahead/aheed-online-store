import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1030 (R16) — the campaign banner route prompts Workers AI with the REQUESTING vendor's own store
 * description, read after the role check, and with no description line when the vendor has none.
 * The prompt's wording itself is pinned in `tests/store-description-prompts.test.ts`.
 */

const getVendorConfig = vi.fn(async (_vendorId: string): Promise<unknown> => null);
const generateImage = vi.fn(async (_prompt: string) => new ArrayBuffer(8));

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: vi.fn(async () => ({ ok: true, vendorId: "v-srimart", via: "VENDOR" })),
}));
vi.mock("@/lib/ai-meter-service", () => ({
  getVendorAiMeter: () => ({
    check: vi.fn(async () => ({
      allowed: true,
      scope: "vendor" as const,
      usedNeurons: 0,
      budgetNeurons: 3000,
    })),
    record: vi.fn(),
    recordImage: vi.fn(async () => {}),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/categories-service", () => ({
  getCategoryForAdmin: vi.fn(async () => ({ name: "Audio" })),
}));
vi.mock("@/lib/campaigns-service", () => ({
  getCampaignForVendorCategory: vi.fn(async () => ({
    headline: "Sound sale",
    subtitle: null,
    altText: null,
  })),
  saveCampaignImageForVendor: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/image-generation", () => ({
  getImageGenerationService: () => ({ generateImage }),
  IMAGE_GENERATION_MODEL: "@cf/black-forest-labs/flux-1-schnell",
}));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ putObject: vi.fn(async () => {}) }) }));
vi.mock("@/lib/vendor-service", () => ({ getVendorConfig }));

const campaign = await import("@/app/api/admin/campaign-images/generate/route");

const post = () =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ categoryId: "c1" }),
  });

const sentPrompt = () => String(generateImage.mock.calls[0]?.[0]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("campaign banner prompt (#1030 R16)", () => {
  it("quotes the requesting vendor's description as the prompt's second line", async () => {
    getVendorConfig.mockResolvedValueOnce({ storeDescription: "Phones & chargers" });

    const response = await campaign.POST(post());

    expect(response.status).toBe(200);
    expect(getVendorConfig).toHaveBeenCalledExactlyOnceWith("v-srimart");
    expect(sentPrompt().split("\n")[1]).toBe('The shop describes itself as: "Phones & chargers"');
  });

  it("adds no description line when the vendor has no config row", async () => {
    getVendorConfig.mockResolvedValueOnce(null);

    const response = await campaign.POST(post());

    expect(response.status).toBe(200);
    expect(getVendorConfig).toHaveBeenCalledExactlyOnceWith("v-srimart");
    expect(sentPrompt()).not.toContain("The shop describes itself as");
    expect(sentPrompt()).toContain("Audio: Sound sale");
  });
});
