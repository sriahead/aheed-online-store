import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE_PX,
  buildProductImageKey,
  fitWithinEdge,
  isProductImageKey,
} from "@/lib/product-image";

/**
 * The actions module is imported FOR REAL below — only its dependencies are
 * mocked. `lib/db` imports `@prisma/client/wasm`, which the Workers runtime
 * resolves and plain Node cannot (see CLAUDE.md), so without these the import
 * fails before any assertion runs. Same mocking shape as auth-rbac.test.ts.
 *
 * Nothing here stubs `features/admin/product-image` itself, which is the point:
 * the export-shape assertion has to see the real module's real exports.
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({ api: { getSession: async () => null } }),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));

import * as imageActions from "@/features/admin/product-image";

/**
 * P6b2 (#167) — the product image rules, unit-tested with no database, no
 * storage and no session.
 *
 * Two of these matter more than they look. `isProductImageKey` is the only thing
 * standing between a client-supplied key and a write, so every way of dressing
 * up "a different object" has to be refused rather than normalised. And the
 * export-shape test below is not ceremony: a "use server" file that exports
 * anything other than async functions fails at RUNTIME only, with every
 * build-time check green — the exact defect that reached P6b1's validation
 * stage (#159).
 */

const PRODUCT = "3f2a1b4c-0000-4000-8000-000000000001";
const OTHER = "3f2a1b4c-0000-4000-8000-000000000002";

describe("buildProductImageKey", () => {
  it("produces products/{productId}/{uuid}.webp", () => {
    expect(buildProductImageKey(PRODUCT)).toMatch(
      new RegExp(`^products/${PRODUCT}/[0-9a-f-]{36}\\.webp$`),
    );
  });

  it("never repeats a key for the same product — replacement writes a NEW object", () => {
    expect(buildProductImageKey(PRODUCT)).not.toBe(buildProductImageKey(PRODUCT));
  });

  it("round-trips through its own validator", () => {
    expect(isProductImageKey(buildProductImageKey(PRODUCT), PRODUCT)).toBe(true);
  });
});

describe("isProductImageKey", () => {
  it("refuses a key built for a different product", () => {
    expect(isProductImageKey(buildProductImageKey(OTHER), PRODUCT)).toBe(false);
  });

  it("refuses a traversal segment", () => {
    expect(isProductImageKey(`products/${PRODUCT}/../evil.webp`, PRODUCT)).toBe(false);
  });

  it("refuses any suffix other than .webp", () => {
    const uuid = "0f1e2d3c-4b5a-4988-9776-a1b2c3d4e5f6";
    expect(isProductImageKey(`products/${PRODUCT}/${uuid}.png`, PRODUCT)).toBe(false);
    expect(isProductImageKey(`products/${PRODUCT}/${uuid}.svg`, PRODUCT)).toBe(false);
  });

  it("refuses an extra path segment", () => {
    const uuid = "0f1e2d3c-4b5a-4988-9776-a1b2c3d4e5f6";
    expect(isProductImageKey(`products/${PRODUCT}/nested/${uuid}.webp`, PRODUCT)).toBe(false);
  });

  it("refuses a leading slash", () => {
    expect(isProductImageKey(`/${buildProductImageKey(PRODUCT)}`, PRODUCT)).toBe(false);
  });

  it("refuses a different prefix", () => {
    const uuid = "0f1e2d3c-4b5a-4988-9776-a1b2c3d4e5f6";
    expect(isProductImageKey(`categories/${PRODUCT}/${uuid}.webp`, PRODUCT)).toBe(false);
  });

  it("refuses a filename that is not a uuid", () => {
    expect(isProductImageKey(`products/${PRODUCT}/main.webp`, PRODUCT)).toBe(false);
  });
});

describe("fitWithinEdge", () => {
  it("leaves an image already within the cap untouched", () => {
    expect(fitWithinEdge(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });

  it("never scales up", () => {
    expect(fitWithinEdge(100, 50, 1200)).toEqual({ width: 100, height: 50 });
  });

  it("caps the longest edge, keeping the aspect ratio", () => {
    expect(fitWithinEdge(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithinEdge(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
  });

  it("keeps a square square", () => {
    expect(fitWithinEdge(2400, 2400, 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it("never produces a zero dimension for an extreme ratio", () => {
    const { width, height } = fitWithinEdge(10000, 3, 1200);
    expect(width).toBe(1200);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("defaults to MAX_IMAGE_EDGE_PX", () => {
    expect(fitWithinEdge(2400, 1200)).toEqual({ width: MAX_IMAGE_EDGE_PX, height: 600 });
  });
});

describe("image constants", () => {
  it("pins the values the spec names", () => {
    expect(IMAGE_CONTENT_TYPE).toBe("image/webp");
    expect(MAX_IMAGE_EDGE_PX).toBe(1200);
    expect(IMAGE_QUALITY).toBe(0.82);
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('features/admin/product-image.ts is a valid "use server" module', () => {
  /**
   * Next validates a "use server" file's ENTIRE export set the moment any one
   * action in it is dispatched — so one exported constant 500s every action in
   * the file, for every caller, while `next build`, `tsc --noEmit` and the rest
   * of this suite stay green. Asserted on the imported module rather than by
   * grepping the source, so it holds however the file is written.
   */
  it("exports only async functions", () => {
    const exports = Object.entries(imageActions);
    expect(exports.length).toBeGreaterThan(0);
    for (const [name, value] of exports) {
      expect(typeof value, `${name} must be a function`).toBe("function");
      expect((value as () => unknown).constructor.name, `${name} must be async`).toBe(
        "AsyncFunction",
      );
    }
  });

  it("exports exactly the six actions", () => {
    expect(Object.keys(imageActions).sort()).toEqual([
      "addProductImage",
      "attachProductImage",
      "promoteProductImage",
      "removeProductImage",
      "reorderProductImages",
      "requestImageUpload",
    ]);
  });
});
