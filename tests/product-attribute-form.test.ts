import { describe, expect, it } from "vitest";
import { readAttributeValues } from "@/lib/product-attribute-form";

/** #912, R13 — the product form's vendor-filter selects. */
const ATTRIBUTE = "11111111-1111-4111-8111-111111111111";
const OTHER_ATTRIBUTE = "22222222-2222-4222-8222-222222222222";
const OPTION = "33333333-3333-4333-8333-333333333333";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("readAttributeValues", () => {
  it("returns nothing for an attribute that was not submitted", () => {
    expect(readAttributeValues(form({ name: "Cable" }))).toEqual({ ok: true, value: [] });
  });

  it("reads an empty value as a clear", () => {
    expect(readAttributeValues(form({ [`attribute_${ATTRIBUTE}`]: "" }))).toEqual({
      ok: true,
      value: [{ attributeId: ATTRIBUTE, optionId: null }],
    });
  });

  it("reads a chosen value", () => {
    expect(
      readAttributeValues(
        form({ [`attribute_${ATTRIBUTE}`]: OPTION, [`attribute_${OTHER_ATTRIBUTE}`]: "" }),
      ),
    ).toEqual({
      ok: true,
      value: [
        { attributeId: ATTRIBUTE, optionId: OPTION },
        { attributeId: OTHER_ATTRIBUTE, optionId: null },
      ],
    });
  });

  it("refuses a malformed value on that field", () => {
    expect(readAttributeValues(form({ [`attribute_${ATTRIBUTE}`]: "black" }))).toEqual({
      ok: false,
      field: `attribute_${ATTRIBUTE}`,
      error: "Choose a value from the list.",
    });
  });

  it("ignores keys that are not attribute keys", () => {
    expect(
      readAttributeValues(
        form({ attribute_colour: OPTION, attributeId: ATTRIBUTE, isHalal: "on" }),
      ),
    ).toEqual({ ok: true, value: [] });
  });
});
