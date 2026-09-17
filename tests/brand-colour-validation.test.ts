import { describe, expect, test } from "vitest";
import {
  parseBrandColourForm,
  parseBrandPrimitives,
  initialBrandColourState,
} from "../lib/brand-colour-form";
import type { BrandPrimitives } from "../lib/repositories/vendor";

describe("brand colour validation", () => {
  test("accepts valid hex codes and passes banner/subtitle", () => {
    const formData = new FormData();
    formData.append("brandGreen", "#2e4d26");
    formData.append("brandOrangeTint", "#ffeedd");
    formData.append("bannerNote", "Test banner");

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.brandGreen).toBe("#2e4d26");
      expect(result.value.brandOrangeTint).toBe("#ffeedd");
      expect(result.value.bannerNote).toBe("Test banner");
      expect(result.value.heroSubtitle).toBe(null);
    }
  });

  test("rejects malformed hex codes and never throws", () => {
    const formData = new FormData();
    formData.append("brandGreen", "green");

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("brandGreen");
      expect(result.error.message).toContain("6-digit hex");
    }
  });

  test("rejects 5 digit hex", () => {
    const formData = new FormData();
    formData.append("brandRed", "#ff000");

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(false);
  });

  test("accepts empty strings as undefined/null", () => {
    const formData = new FormData();
    formData.append("brandGreen", "");
    formData.append("bannerNote", "");

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.brandGreen).toBeUndefined();
      expect(result.value.bannerNote).toBeNull();
    }
  });

  test("exports initial state", () => {
    expect(initialBrandColourState).toEqual({ error: null, field: null, saved: false });
  });
});

describe("parseBrandPrimitives (#782 — the theme write path)", () => {
  const valid: BrandPrimitives = {
    "green-dark": "#1b3a17",
    green: "#2e4d26",
    orange: "#e07b39",
    red: "#c62828",
    cream: "#f5f5f0",
    "green-tint": "#e8f5e9",
    "orange-tint": "#fff3e0",
    "red-tint": "#ffebee",
  };

  test("accepts a complete, well-formed set and returns the trimmed values", () => {
    const result = parseBrandPrimitives({ ...valid, green: "  #2e4d26  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.green).toBe("#2e4d26");
      expect(Object.keys(result.value)).toHaveLength(8);
    }
  });

  test.each([
    ["missing the hash", "2e4d26"],
    ["five digits", "#2e4d2"],
    ["seven digits", "#2e4d266"],
    ["non-hex characters", "#gggggg"],
    ["a named colour", "green"],
    ["a functional notation", "rgb(0,0,0)"],
  ])("rejects %s", (_label, bad) => {
    const result = parseBrandPrimitives({ ...valid, green: bad });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("green");
      expect(result.error.message).toContain("6-digit hex");
    }
  });

  test("rejects an empty string rather than treating it as absent", () => {
    const result = parseBrandPrimitives({ ...valid, cream: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("cream");
      expect(result.error.message).toContain("required");
    }
  });

  test("rejects a missing key — a theme row stores all eight as non-null", () => {
    const { red, ...incomplete } = valid;
    const result = parseBrandPrimitives(incomplete as BrandPrimitives);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("red");
  });

  test("reports the FIRST invalid field, so the error names a real cause", () => {
    const result = parseBrandPrimitives({ ...valid, "green-dark": "nope", orange: "alsonope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("green-dark");
  });

  test("accepts uppercase hex", () => {
    const result = parseBrandPrimitives({ ...valid, green: "#2E4D26" });
    expect(result.ok).toBe(true);
  });
});
