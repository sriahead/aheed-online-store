/**
 * #912 — reads the staff product form's vendor-filter selects.
 *
 * The product form renders one `<select name="attribute_<attributeId>">` per vendor filter (the
 * set is vendor data, so it cannot join `PRODUCT_FIELDS`' fixed list). This returns ONLY the keys
 * actually submitted: an attribute absent from the submission — say, created in another tab after
 * this form was loaded — is left untouched by the write, the same "absent means leave alone"
 * posture #905 took for a switched-off label. `""` ("Not set") means clear it.
 *
 * Shape is validated here; OWNERSHIP (that the attribute is this vendor's and the option is that
 * attribute's) is checked by the repository, which is the only layer that can query it.
 *
 * Pure: no Prisma, no request context.
 */

export interface AttributeValueWrite {
  attributeId: string;
  /** `null` clears this product's value for the attribute. */
  optionId: string | null;
}

export type AttributeValuesResult =
  { ok: true; value: AttributeValueWrite[] } | { ok: false; field: string; error: string };

const ATTRIBUTE_FIELD = /^attribute_([0-9a-f-]{36})$/;
const UUID_SHAPED = /^[0-9a-f-]{36}$/;

/** Accepts anything with `FormData`'s iteration shape, so a test can pass a real `FormData`. */
export function readAttributeValues(form: Pick<FormData, "entries">): AttributeValuesResult {
  const values: AttributeValueWrite[] = [];
  for (const [key, raw] of form.entries()) {
    const match = ATTRIBUTE_FIELD.exec(key);
    if (!match) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "") {
      values.push({ attributeId: match[1], optionId: null });
    } else if (UUID_SHAPED.test(value)) {
      values.push({ attributeId: match[1], optionId: value });
    } else {
      return { ok: false, field: key, error: "Choose a value from the list." };
    }
  }
  return { ok: true, value: values };
}
