import { describe, it, expect } from "vitest";
import { composePublicUrl, readGetObjectResponse } from "@/lib/storage";

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

/**
 * #518 — the port gained a read primitive so an image can be copied between
 * environments. These build real `Response` objects rather than stubbing the
 * network: no credentials are read and no request is made, so the assertion is
 * about the decision itself, not about aws4fetch.
 */
describe("readGetObjectResponse", () => {
  it("returns the bytes for a 200", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await readGetObjectResponse(new Response(bytes, { status: 200 }));
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result!)).toEqual(bytes);
  });

  it("returns null for a 404 rather than throwing", async () => {
    await expect(readGetObjectResponse(new Response(null, { status: 404 }))).resolves.toBeNull();
  });

  it("throws on any other failure, so a 403 is never mistaken for a missing object", async () => {
    await expect(readGetObjectResponse(new Response(null, { status: 403 }))).rejects.toThrow(
      "storage getObject failed: 403",
    );
  });
});
