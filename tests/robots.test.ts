import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * robots.txt is decided by environment, and served for whichever host asked (#955), R18-R22.
 *
 * THE DEFECT THESE CASES ENCODE. `app/robots.ts` compared the request host against a hardcoded
 * `PRODUCTION_HOST = "aheedfoodcentre.nocaped.com"`, so "is this production?" and "is this the
 * first vendor?" were the same question. In production, `https://srimart.nocaped.com/robots.txt`
 * answered `Disallow: /` — every vendor but one was de-indexed, against ADR-004. The second case
 * below is the one that would have caught it.
 */

const mockHost = vi.fn<() => string | null>(() => "aheed.example");
const mockIndexable = vi.fn<() => boolean>(() => true);

vi.mock("next/headers", () => ({
  headers: async () => new Headers(mockHost() ? { host: mockHost() as string } : {}),
}));
vi.mock("@/lib/config", () => ({ isIndexable: () => mockIndexable() }));

type RobotsResult = {
  rules: { userAgent: string; allow?: string; disallow?: string | string[] };
  sitemap?: string;
};

async function run(): Promise<RobotsResult> {
  const robots = (await import("@/app/robots")).default;
  return (await robots()) as RobotsResult;
}

beforeEach(() => {
  mockHost.mockReturnValue("aheed.example");
  mockIndexable.mockReturnValue(true);
});

afterEach(() => {
  vi.resetModules();
});

describe("app/robots.ts (#955)", () => {
  it("allows crawling and points at the requesting host's sitemap when indexable (R20)", async () => {
    const result = await run();

    expect(result.rules.allow).toBe("/");
    expect(result.rules.disallow).not.toBe("/");
    expect(result.sitemap).toBe("https://aheed.example/sitemap.xml");
  });

  it("allows crawling on a SECOND vendor's host, with that host's sitemap (R20)", async () => {
    mockHost.mockReturnValue("srimart.example");

    const result = await run();

    // Pre-#955 this returned `Disallow: /` for any host that was not the first vendor's.
    expect(result.rules.allow).toBe("/");
    expect(result.sitemap).toBe("https://srimart.example/sitemap.xml");
  });

  it("disallows everything and publishes no sitemap when not indexable (R21)", async () => {
    mockIndexable.mockReturnValue(false);

    const result = await run();

    expect(result.rules.disallow).toBe("/");
    expect(result.rules.allow).toBeUndefined();
    expect(result.sitemap).toBeUndefined();
  });

  it("disallows everything when the request carries no Host header", async () => {
    mockHost.mockReturnValue(null);

    const result = await run();

    // There is no host to publish a Sitemap: line for, and app/sitemap.ts returns an empty
    // document in the same situation.
    expect(result.rules.disallow).toBe("/");
    expect(result.sitemap).toBeUndefined();
  });

  it("keeps crawlers out of signed-in, transactional and developer paths (R22)", async () => {
    const result = await run();

    const disallowed = result.rules.disallow;
    expect(Array.isArray(disallowed)).toBe(true);
    for (const path of ["/account", "/cart", "/checkout", "/orders/lookup", "/dev"]) {
      expect(disallowed as string[]).toContain(path);
    }
  });
});
