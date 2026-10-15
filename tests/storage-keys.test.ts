import { describe, expect, it } from "vitest";
import { readCookieWithFallback, type CookieJarReader } from "@/lib/storage-keys";

/**
 * #1080 R2 — the one fallback rule every server-side reader of a renamed cookie uses during the
 * compatibility window: the new name wins, the legacy name is the fallback, neither is `null`.
 */

const jar = (values: Record<string, string>): CookieJarReader => ({
  get: (name) => (name in values ? { value: values[name] } : undefined),
});

describe("readCookieWithFallback (#1080 R2)", () => {
  it("returns the value under the new name", () => {
    expect(readCookieWithFallback(jar({ new_name: "N" }), "new_name", "old_name")).toBe("N");
  });

  it("falls back to the legacy name when the new one is absent", () => {
    expect(readCookieWithFallback(jar({ old_name: "L" }), "new_name", "old_name")).toBe("L");
  });

  it("returns null when neither is present", () => {
    expect(readCookieWithFallback(jar({}), "new_name", "old_name")).toBeNull();
  });

  it("prefers the new name when both are present", () => {
    expect(
      readCookieWithFallback(jar({ new_name: "N", old_name: "L" }), "new_name", "old_name"),
    ).toBe("N");
  });
});
