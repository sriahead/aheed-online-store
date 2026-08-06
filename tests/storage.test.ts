import { describe, it, expect } from "vitest";
import { composePublicUrl } from "@/lib/storage";

// Proves the ADR-003 contract: DB stores a RELATIVE key; the URL is composed at read time.
describe("composePublicUrl", () => {
  it("joins base + key with one slash", () => {
    expect(composePublicUrl("https://cdn.example.com", "products/sku-1/main.webp")).toBe(
      "https://cdn.example.com/products/sku-1/main.webp",
    );
  });
  it("tolerates trailing/leading slashes", () => {
    expect(composePublicUrl("https://cdn.example.com/", "/a/b.png")).toBe(
      "https://cdn.example.com/a/b.png",
    );
  });
});
