import { describe, expect, it } from "vitest";
import {
  DELIVERY_FEE_FIELD,
  FREE_DELIVERY_THRESHOLD_FIELD,
  MINIMUM_ORDER_FIELD,
  parseDeliveryRules,
  parseOptionalPoundsToPence,
  parsePoundsToPence,
  penceToPoundsValue,
} from "@/lib/delivery-rules-form";

/**
 * #634 — delivery fee, free-delivery threshold and minimum order became
 * admin-writable. `lib/order-totals.ts` reads all three on the checkout path,
 * so until this slice their only writer was `prisma/seed.ts` and a malformed
 * value could not exist. These are the rules that keep that true.
 */

const VALID = {
  deliveryFee: "3.49",
  freeDeliveryThreshold: "30",
  minimumOrder: "0",
  offerCollection: false,
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
};

describe("parsePoundsToPence", () => {
  it.each([
    ["0", 0],
    ["3", 300],
    ["3.4", 340],
    ["3.49", 349],
    ["30.00", 3000],
    ["  2.50  ", 250],
    ["1999.99", 199999],
  ])("parses %s to %i pence", (input, expected) => {
    const result = parsePoundsToPence(input, DELIVERY_FEE_FIELD, "Delivery fee");
    expect(result.ok && result.value).toBe(expected);
  });

  it("converts without floating-point error", () => {
    // 8.20 * 100 is 819.9999999999999 in binary floating point; Math.round()
    // hides it, integer arithmetic on the digit strings avoids it entirely.
    const result = parsePoundsToPence("8.20", DELIVERY_FEE_FIELD, "Delivery fee");
    expect(result.ok && result.value).toBe(820);
  });

  it.each([
    ["", "blank"],
    ["-1", "negative"],
    ["abc", "non-numeric"],
    ["1.234", "three decimal places"],
    ["£3.49", "currency symbol"],
    ["1,000", "thousands separator"],
    ["1e3", "exponent"],
    ["3.", "trailing point"],
    [" ", "whitespace only"],
  ])("refuses %s (%s) and names the field", (input) => {
    const result = parsePoundsToPence(input, DELIVERY_FEE_FIELD, "Delivery fee");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe(DELIVERY_FEE_FIELD);
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0);
  });

  it("rejects a third decimal rather than silently rounding it", () => {
    // parsePriceInput() would return 300 here. An operator typing 2.999 should
    // be told, not quietly charged £3.00.
    expect(parsePoundsToPence("2.999", DELIVERY_FEE_FIELD, "Delivery fee").ok).toBe(false);
  });
});

describe("parseOptionalPoundsToPence", () => {
  it("treats blank as null — free delivery never offered", () => {
    const result = parseOptionalPoundsToPence(
      "",
      FREE_DELIVERY_THRESHOLD_FIELD,
      "Free delivery threshold",
    );
    expect(result.ok && result.value).toBeNull();
  });

  it("keeps zero distinct from blank", () => {
    // null hides the "spend more for free delivery" prompt; 0 would make every
    // order qualify. Collapsing them would be a real pricing change.
    const zero = parseOptionalPoundsToPence(
      "0",
      FREE_DELIVERY_THRESHOLD_FIELD,
      "Free delivery threshold",
    );
    expect(zero.ok && zero.value).toBe(0);
  });

  it("still refuses a malformed value", () => {
    const result = parseOptionalPoundsToPence(
      "-5",
      FREE_DELIVERY_THRESHOLD_FIELD,
      "Free delivery threshold",
    );
    expect(result.ok).toBe(false);
  });
});

describe("parseDeliveryRules", () => {
  it("accepts a well-formed set", () => {
    const result = parseDeliveryRules(VALID);
    expect(result.ok && result.value).toEqual({
      deliveryFeePence: 349,
      freeDeliveryThresholdPence: 3000,
      minimumOrderPence: 0,
      offerCollection: false,
      location: null,
    });
  });

  it("accepts a blank threshold as null", () => {
    const result = parseDeliveryRules({ ...VALID, freeDeliveryThreshold: "" });
    expect(result.ok && result.value.freeDeliveryThresholdPence).toBeNull();
  });

  it.each([
    ["deliveryFee", DELIVERY_FEE_FIELD],
    ["freeDeliveryThreshold", FREE_DELIVERY_THRESHOLD_FIELD],
    ["minimumOrder", MINIMUM_ORDER_FIELD],
  ])("refuses the whole submission when %s is invalid", (key, field) => {
    const result = parseDeliveryRules({ ...VALID, [key]: "nope" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe(field);
  });

  it("is all-or-nothing: one bad field yields no partial value", () => {
    const result = parseDeliveryRules({ ...VALID, minimumOrder: "-1" });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("value");
  });
});

describe("penceToPoundsValue", () => {
  it.each([
    [349, "3.49"],
    [0, "0.00"],
    [3000, "30.00"],
  ])("renders %i pence as %s", (pence, expected) => {
    expect(penceToPoundsValue(pence)).toBe(expected);
  });

  it("renders an absent threshold as an empty input, not '0.00'", () => {
    expect(penceToPoundsValue(null)).toBe("");
    expect(penceToPoundsValue(undefined)).toBe("");
  });

  it("round-trips through the parser", () => {
    const parsed = parsePoundsToPence(penceToPoundsValue(349), DELIVERY_FEE_FIELD, "Delivery fee");
    expect(parsed.ok && parsed.value).toBe(349);
  });
});
