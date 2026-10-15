import { describe, expect, it } from "vitest";
import { readCheckoutDetails, writeCheckoutDetails } from "@/lib/checkout-details-storage";

/**
 * #1080 R19 — the checkout form's remembered details move from the legacy `localStorage` key to
 * the vendor-neutral one, without losing what a returning shopper had saved.
 */

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

describe("readCheckoutDetails (#1080 R19)", () => {
  it("returns the new key's blob and leaves a legacy blob alone", () => {
    const storage = memoryStorage({
      store_checkout_details: '{"a":"new"}',
      aheed_checkout_details: '{"a":"old"}',
    });
    expect(readCheckoutDetails(storage)).toBe('{"a":"new"}');
    expect(storage.getItem("aheed_checkout_details")).toBe('{"a":"old"}');
  });

  it("moves a legacy-only blob to the new key and removes the legacy key", () => {
    const storage = memoryStorage({ aheed_checkout_details: '{"a":"old"}' });
    expect(readCheckoutDetails(storage)).toBe('{"a":"old"}');
    expect(storage.getItem("store_checkout_details")).toBe('{"a":"old"}');
    expect(storage.getItem("aheed_checkout_details")).toBeNull();
  });

  it("returns null when nothing is saved", () => {
    const storage = memoryStorage();
    expect(readCheckoutDetails(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });
});

describe("writeCheckoutDetails (#1080 R19)", () => {
  it("writes the new key and removes the legacy one", () => {
    const storage = memoryStorage({ aheed_checkout_details: '{"a":"old"}' });
    writeCheckoutDetails(storage, '{"a":"typed"}');
    expect(storage.getItem("store_checkout_details")).toBe('{"a":"typed"}');
    expect(storage.getItem("aheed_checkout_details")).toBeNull();
  });
});
