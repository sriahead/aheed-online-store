import { ATTRIBUTE_NUMBER_ERROR, parseAttributeNumber } from "@/lib/attribute-number";

/**
 * #912 — reads the staff product form's vendor-filter fields.
 *
 * The product form renders one `<select name="attribute_<attributeId>">` per LIST filter and, since
 * #918, one `<input name="attributeNumber_<attributeId>">` per NUMBER filter (the set is vendor
 * data, so it cannot join `PRODUCT_FIELDS`' fixed list). A separate key prefix means an entry's kind
 * is known from its key alone, before any database read.
 *
 * This returns ONLY the keys actually submitted: an attribute absent from the submission — say,
 * created in another tab after this form was loaded — is left untouched by the write, the same
 * "absent means leave alone" posture #905 took for a switched-off label. `""` means clear it.
 *
 * Shape is validated here; OWNERSHIP (that the attribute is this vendor's, that its kind matches the
 * entry's, and that the option is that attribute's) is checked by the repository, which is the only
 * layer that can query it.
 *
 * Pure: no Prisma, no request context.
 */

export type AttributeValueWrite =
  | {
      kind: "LIST";
      attributeId: string;
      /** `null` clears this product's value for the attribute. */
      optionId: string | null;
    }
  | {
      kind: "NUMBER";
      attributeId: string;
      /** A string passing the number rule (lib/attribute-number.ts), or `null` to clear. */
      numericValue: string | null;
    };

export type AttributeValuesResult =
  { ok: true; value: AttributeValueWrite[] } | { ok: false; field: string; error: string };

const ATTRIBUTE_FIELD = /^attribute_([0-9a-f-]{36})$/;
const ATTRIBUTE_NUMBER_FIELD = /^attributeNumber_([0-9a-f-]{36})$/;
const UUID_SHAPED = /^[0-9a-f-]{36}$/;

/** Accepts anything with `FormData`'s iteration shape, so a test can pass a real `FormData`. */
export function readAttributeValues(form: Pick<FormData, "entries">): AttributeValuesResult {
  const values: AttributeValueWrite[] = [];
  for (const [key, raw] of form.entries()) {
    const value = typeof raw === "string" ? raw.trim() : "";

    const list = ATTRIBUTE_FIELD.exec(key);
    if (list) {
      if (value === "") {
        values.push({ kind: "LIST", attributeId: list[1], optionId: null });
      } else if (UUID_SHAPED.test(value)) {
        values.push({ kind: "LIST", attributeId: list[1], optionId: value });
      } else {
        return { ok: false, field: key, error: "Choose a value from the list." };
      }
      continue;
    }

    const number = ATTRIBUTE_NUMBER_FIELD.exec(key);
    if (number) {
      if (value === "") {
        values.push({ kind: "NUMBER", attributeId: number[1], numericValue: null });
        continue;
      }
      const parsed = parseAttributeNumber(value);
      if (parsed === null) return { ok: false, field: key, error: ATTRIBUTE_NUMBER_ERROR };
      values.push({ kind: "NUMBER", attributeId: number[1], numericValue: parsed });
    }
  }
  return { ok: true, value: values };
}
