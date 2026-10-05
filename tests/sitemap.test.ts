import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The per-vendor sitemap (#955), R7-R16.
 *
 * WHAT THIS CAN AND CANNOT PROVE. These cases drive `app/sitemap.ts`'s default export directly
 * with a stubbed host, vendor and repository layer, so they prove the URL SET it builds: which
 * paths, on which host, with no `lastmod`, and empty for an unresolvable host. They do NOT prove
 * the route is served dynamically rather than cached at build time — a sitemap is a Route Handler
 * that Next caches by default unless it reads a request-time API, and a unit test cannot observe
 * that. `validation.md` R12 covers it the only way it can be covered: fetching the live route on
 * two different vendor hosts and asserting the documents differ.
 */

const mockHost = vi.fn<() => string | null>(() => "aheed.example");
const mockVendorId = vi.fn<() => Promise<string | null>>(async () => "vendor-1");
const mockProductSlugs = vi.fn<() => Promise<string[]>>(async () => []);
const mockCategories = vi.fn<() => Promise<{ slug: string }[]>>(async () => []);

vi.mock("next/headers", () => ({
  headers: async () => new Headers(mockHost() ? { host: mockHost() as string } : {}),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}), getPrismaWs: () => ({}) }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorIdOrNull: () => mockVendorId() }));
// The route reads through the request-scoped service facades, not the repositories directly —
// an ESLint rule forbids `@/lib/db` in the app layer (ADR-004 slice 2).
vi.mock("@/lib/products-service", () => ({
  getProductRepository: () => ({ listActiveSlugs: () => mockProductSlugs() }),
}));
vi.mock("@/lib/categories-service", () => ({
  getCategoryRepository: () => ({ listTree: () => mockCategories() }),
}));

const STATIC_PATHS = ["/", "/categories", "/bundles", "/help", "/privacy", "/terms"];

async function run(): Promise<{ url: string }[]> {
  const sitemap = (await import("@/app/sitemap")).default;
  return (await sitemap()) as { url: string }[];
}

beforeEach(() => {
  mockHost.mockReturnValue("aheed.example");
  mockVendorId.mockResolvedValue("vendor-1");
  mockProductSlugs.mockResolvedValue([]);
  mockCategories.mockResolvedValue([]);
});

afterEach(() => {
  vi.resetModules();
});

describe("app/sitemap.ts (#955)", () => {
  it("lists exactly the six static public paths when the vendor has no catalogue (R10)", async () => {
    const urls = (await run()).map((entry) => entry.url);

    expect(urls).toEqual(STATIC_PATHS.map((path) => `https://aheed.example${path}`));
  });

  it("lists every active product and category on the requesting host (R8, R9)", async () => {
    mockProductSlugs.mockResolvedValue(["item-a", "item-b"]);
    mockCategories.mockResolvedValue([{ slug: "dept-one" }, { slug: "dept-two" }]);

    const urls = (await run()).map((entry) => entry.url);

    expect(urls).toContain("https://aheed.example/products/item-a");
    expect(urls).toContain("https://aheed.example/products/item-b");
    expect(urls).toContain("https://aheed.example/categories/dept-one");
    expect(urls).toContain("https://aheed.example/categories/dept-two");
    // One entry per record and no duplicates: 6 static + 2 categories + 2 products.
    expect(urls).toHaveLength(10);
    expect(new Set(urls).size).toBe(10);
  });

  it("builds every URL on the host that asked, not a baked-in one (R12)", async () => {
    mockProductSlugs.mockResolvedValue(["item-a"]);
    mockHost.mockReturnValue("srimart.example");

    const urls = (await run()).map((entry) => entry.url);

    expect(urls.every((url) => url.startsWith("https://srimart.example/"))).toBe(true);
    // The pre-#955 code carried `?? "aheedfoodcentre.nocaped.com"`, so one vendor's host could
    // appear in another's document.
    expect(urls.some((url) => url.includes("nocaped.com"))).toBe(false);
  });

  it("excludes signed-in, transactional and developer paths (R11)", async () => {
    mockProductSlugs.mockResolvedValue(["item-a"]);
    mockCategories.mockResolvedValue([{ slug: "dept-one" }]);

    const paths = (await run()).map((entry) => new URL(entry.url).pathname);

    for (const excluded of [
      "/account",
      "/cart",
      "/checkout",
      "/login",
      "/register",
      "/search",
      "/dev",
      "/orders",
      "/feedback",
      "/shop-your-list",
      "/forgot-password",
      "/reset-password",
    ]) {
      expect(
        paths.filter((path) => path.startsWith(excluded)),
        `${excluded} must not be in the sitemap`,
      ).toEqual([]);
    }
  });

  it("publishes no lastModified for any entry (R13)", async () => {
    mockProductSlugs.mockResolvedValue(["item-a"]);
    mockCategories.mockResolvedValue([{ slug: "dept-one" }]);

    const entries = await run();

    // `Product` has no `updatedAt` and `Category` has neither timestamp, so there is no truthful
    // value to publish; `createdAt` would assert a false date after any edit.
    expect(entries.every((entry) => !("lastModified" in entry))).toBe(true);
  });

  it("returns an empty document for a host that resolves to no vendor (R16)", async () => {
    mockVendorId.mockResolvedValue(null);
    mockProductSlugs.mockResolvedValue(["item-a"]);

    expect(await run()).toEqual([]);
  });

  it("returns an empty document when the request carries no Host header", async () => {
    mockHost.mockReturnValue(null);

    expect(await run()).toEqual([]);
  });
});
