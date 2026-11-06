import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findUnsupportedSyntax } from "../scripts/lib/client-syntax";

/**
 * #1445 — iPhone 6s / Safari 15. Next.js 16 compiles for Safari 16.4+ unless `browserslist` says
 * otherwise; without it the App Router chunk shipped a class static block, iOS 15 failed to parse
 * it, and React never hydrated (no Google sign-in, no add to basket). `next build` stayed green.
 *
 * Two halves. This file pins the configuration and proves the detector; the `postbuild` script runs
 * the detector over the real build output, in every `npm run build` including both deploys.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  browserslist?: string[];
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The minimum version a `name >= x.y` entry admits, or null when the entry is absent. */
function minimumFor(browser: string): number | null {
  const entry = (pkg.browserslist ?? []).find((q) => q.startsWith(`${browser} `));
  const match = entry?.match(/>=\s*([\d.]+)$/);
  return match ? Number(match[1]) : null;
}

describe("browser targets (#1445)", () => {
  it("sets browserslist, with Next's defaults for the other engines", () => {
    expect(pkg.browserslist).toEqual([
      "chrome >= 111",
      "edge >= 111",
      "firefox >= 111",
      "safari >= 15.4",
      "ios_saf >= 15.4",
    ]);
  });

  it.each(["safari", "ios_saf"])("targets %s 15.4 or older", (browser) => {
    const min = minimumFor(browser);
    expect(min).not.toBeNull();
    expect(min).toBeLessThanOrEqual(15.4);
  });

  it("runs the client-syntax guard after every build", () => {
    expect(pkg.scripts.postbuild).toBe("tsx scripts/check-client-syntax.ts");
  });

  it("exact-pins acorn, the guard's parser", () => {
    expect(pkg.devDependencies.acorn).toBe("8.18.0");
  });
});

describe("findUnsupportedSyntax", () => {
  it("flags a class static block", () => {
    const [finding] = findUnsupportedSyntax("class A {\n  static { this.x = 1; }\n}");
    expect(finding).toMatchObject({ line: 2, construct: expect.stringContaining("static block") });
  });

  it("flags a lookbehind regex literal", () => {
    expect(findUnsupportedSyntax("const r = /(?<=a)b/;")[0]?.construct).toContain("lookbehind");
    expect(findUnsupportedSyntax("const r = /(?<!a)b/;")[0]?.construct).toContain("lookbehind");
  });

  it("flags a v-flag regex literal", () => {
    expect(findUnsupportedSyntax("const r = /[a]/v;")[0]?.construct).toContain("v flag");
  });

  it("does not flag lookbehind text inside an ordinary string", () => {
    expect(findUnsupportedSyntax('const s = "(?<=a)"; new RegExp(s);')).toEqual([]);
  });

  it("does not flag static fields, public or private", () => {
    expect(findUnsupportedSyntax("class A { static #e = 1; static y = 2; }")).toEqual([]);
  });

  it("returns nothing for a clean snippet, script or module", () => {
    expect(findUnsupportedSyntax("var a = [1, 2].map((x) => x * 2);")).toEqual([]);
    expect(findUnsupportedSyntax("export const a = 1;")).toEqual([]);
  });
});
