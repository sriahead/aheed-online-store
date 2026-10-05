import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `SEO_INDEXABLE` is read through its own schema, not `getEnv()`'s (#955), R19.
 *
 * WHY THIS NEEDS A TEST OF ITS OWN. `getEnv()`'s schema requires `DATABASE_URL` and
 * `BETTER_AUTH_SECRET`. `app/robots.ts` touches neither, so had the new key joined that schema, an
 * unrelated missing secret would have turned `/robots.txt` into an uncaught `ZodError` — a bare
 * 500 on the one route whose entire job is to answer a crawler. The first case below is the one
 * that fails if someone later moves the key into the main schema for tidiness.
 *
 * `lib/config.ts` reads through `readEnv`, which tries the Cloudflare request context first and
 * falls back to `process.env`. There is no Worker context in Vitest, so setting `process.env` here
 * is the supported path.
 */

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker request context");
  },
}));

const SAVED = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.SEO_INDEXABLE;
});

afterEach(() => {
  process.env = { ...SAVED };
});

describe("getSeoEnv / isIndexable (#955)", () => {
  it("does not throw when DATABASE_URL and BETTER_AUTH_SECRET are absent (R19)", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    const { getSeoEnv, isIndexable } = await import("@/lib/config");

    expect(() => getSeoEnv()).not.toThrow();
    expect(isIndexable()).toBe(false);
  });

  it("is false when the variable is absent — the safe default", async () => {
    const { isIndexable } = await import("@/lib/config");

    expect(isIndexable()).toBe(false);
  });

  it('is true only for the exact string "true"', async () => {
    const { isIndexable } = await import("@/lib/config");

    process.env.SEO_INDEXABLE = "true";
    expect(isIndexable()).toBe(true);

    for (const value of ["false", "TRUE", "1", "yes", ""]) {
      process.env.SEO_INDEXABLE = value;
      expect(isIndexable(), `${JSON.stringify(value)} must not opt an environment in`).toBe(false);
    }
  });
});
