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
      value: [{ kind: "LIST", attributeId: ATTRIBUTE, optionId: null }],
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
        { kind: "LIST", attributeId: ATTRIBUTE, optionId: OPTION },
        { kind: "LIST", attributeId: OTHER_ATTRIBUTE, optionId: null },
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

/** #918, R16 — a NUMBER filter's input, `attributeNumber_<uuid>`. */
describe("readAttributeValues — number filters", () => {
  const key = `attributeNumber_${ATTRIBUTE}`;
  const MESSAGE = "Enter a number from 0 to 99999999.99, with at most 2 decimal places.";

  it("reads a valid number as its trimmed string", () => {
    expect(readAttributeValues(form({ [key]: " 13.3 " }))).toEqual({
      ok: true,
      value: [{ kind: "NUMBER", attributeId: ATTRIBUTE, numericValue: "13.3" }],
    });
  });

  it("reads an empty number as a clear", () => {
    expect(readAttributeValues(form({ [key]: "" }))).toEqual({
      ok: true,
      value: [{ kind: "NUMBER", attributeId: ATTRIBUTE, numericValue: null }],
    });
  });

  it.each([["abc"], ["-1"], ["1.234"], ["123456789"]])("refuses %s on that field", (raw) => {
    expect(readAttributeValues(form({ [key]: raw }))).toEqual({
      ok: false,
      field: key,
      error: MESSAGE,
    });
  });
});
