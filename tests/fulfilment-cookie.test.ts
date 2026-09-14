import { describe, it, expect } from "vitest";
import {
  FULFILMENT_METHOD_COOKIE,
  defaultFulfilmentMethod,
  parseFulfilmentMethod,
} from "@/lib/fulfilment-cookie";

// lib/fulfilment-cookie.ts is deliberately pure — no next/headers, no lib/db —
// so this needs no request context and no @prisma/client/wasm mocking. The
// request-scoped half lives in lib/fulfilment-service.ts, which is exercised
// live under `npm run preview` rather than here.

describe("FULFILMENT_METHOD_COOKIE", () => {
  it("is a stable name the server components can read", () => {
    expect(FULFILMENT_METHOD_COOKIE).toBe("fulfilment-method");
  });
});

describe("parseFulfilmentMethod", () => {
  it("accepts exactly the two real methods", () => {
    expect(parseFulfilmentMethod("DELIVERY")).toBe("DELIVERY");
    expect(parseFulfilmentMethod("COLLECTION")).toBe("COLLECTION");
  });

  it("returns null for an unrecognised value rather than throwing", () => {
    // A cookie is attacker-editable and reaches this on every request of every
    // storefront route. Junk must degrade to "no preference", not to an error
    // page site-wide.
    expect(parseFulfilmentMethod("PIGEON")).toBeNull();
    expect(parseFulfilmentMethod("")).toBeNull();
    expect(parseFulfilmentMethod(null)).toBeNull();
    expect(parseFulfilmentMethod(undefined)).toBeNull();
  });

  it("is case-sensitive — it mirrors the stored enum, not user input", () => {
    expect(parseFulfilmentMethod("delivery")).toBeNull();
    expect(parseFulfilmentMethod("Collection")).toBeNull();
  });

  it("distinguishes 'no preference' from DELIVERY", () => {
    // Collapsing these would silently change the default for every shopper who
    // has never touched the toggle — see defaultFulfilmentMethod below.
    expect(parseFulfilmentMethod(undefined)).not.toBe("DELIVERY");
  });
});

describe("defaultFulfilmentMethod", () => {
  it("prefers DELIVERY when the shopper has a deliverable postcode", () => {
    expect(defaultFulfilmentMethod(true, true)).toBe("DELIVERY");
    expect(defaultFulfilmentMethod(true, false)).toBe("DELIVERY");
  });

  it("falls back to COLLECTION when delivery is not available but collection is", () => {
    expect(defaultFulfilmentMethod(false, true)).toBe("COLLECTION");
  });

  it("is DELIVERY when neither applies, so there is always an answer", () => {
    expect(defaultFulfilmentMethod(false, false)).toBe("DELIVERY");
  });

  it("matches the rule LocationControl computed before #748 moved it here", () => {
    // postcode && deliverable ? DELIVERY : offerCollection ? COLLECTION : DELIVERY
    const legacy = (deliverable: boolean, offerCollection: boolean) =>
      deliverable ? "DELIVERY" : offerCollection ? "COLLECTION" : "DELIVERY";

    for (const deliverable of [true, false]) {
      for (const offerCollection of [true, false]) {
        expect(defaultFulfilmentMethod(deliverable, offerCollection)).toBe(
          legacy(deliverable, offerCollection),
        );
      }
    }
  });
});
