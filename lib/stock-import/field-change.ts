/**
 * #1578 R8 — a product field an import changed, stored as text (`StockImportFieldChange`) so undo
 * can put it back. Undo restores a field only while it still holds the import's value: anything
 * staff changed since is theirs. Pure.
 */

export const INT_FIELDS = [
  "basePrice",
  "originalPrice",
  "vatRate",
  "unitPricePencePerBaseUnit",
] as const;
export const NUMBER_FIELDS = ["netContentAmount"] as const;
export const BOOLEAN_FIELDS = [
  "isHalal",
  "isVegetarian",
  "isOrganic",
  "isGlutenFree",
  "isFresh",
] as const;
export const TEXT_FIELDS = [
  "name",
  "unitLabel",
  "netContentUnit",
  "brandId",
  "categoryId",
  "plu",
  "barcode",
  "description",
  "origin",
] as const;

export type TrackedField =
  | (typeof INT_FIELDS)[number]
  | (typeof NUMBER_FIELDS)[number]
  | (typeof BOOLEAN_FIELDS)[number]
  | (typeof TEXT_FIELDS)[number];

export const TRACKED_FIELDS: readonly TrackedField[] = [
  ...TEXT_FIELDS,
  ...INT_FIELDS,
  ...NUMBER_FIELDS,
  ...BOOLEAN_FIELDS,
];

export type FieldValue = string | number | boolean | null;

export function isTrackedField(field: string): field is TrackedField {
  return (TRACKED_FIELDS as readonly string[]).includes(field);
}

export function encodeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "toString" in value) return String(value); // Decimal
  return String(value);
}

export function decodeValue(field: TrackedField, text: string | null): FieldValue {
  if (text === null) return null;
  if ((INT_FIELDS as readonly string[]).includes(field)) return Number.parseInt(text, 10);
  if ((NUMBER_FIELDS as readonly string[]).includes(field)) return Number(text);
  if ((BOOLEAN_FIELDS as readonly string[]).includes(field)) return text === "true";
  return text;
}

export interface FieldChangeRecord {
  field: TrackedField;
  previousValue: string | null;
  newValue: string | null;
}

/** The tracked fields an update writes, with the product's values before it. */
export function changesFor(
  before: Partial<Record<TrackedField, unknown>>,
  data: Partial<Record<string, unknown>>,
): FieldChangeRecord[] {
  const out: FieldChangeRecord[] = [];
  for (const [field, value] of Object.entries(data)) {
    if (!isTrackedField(field)) continue;
    const previousValue = encodeValue(before[field]);
    const newValue = encodeValue(value);
    if (previousValue !== newValue) out.push({ field, previousValue, newValue });
  }
  return out;
}

export interface RestorePlan {
  /** Fields to write back, decoded. */
  data: Partial<Record<TrackedField, FieldValue>>;
  restored: TrackedField[];
  /** Fields left alone because someone changed them after the import. */
  kept: TrackedField[];
}

/**
 * Which of an import's changes to one product can be undone: those whose field still holds the
 * import's value. `current` is the product as it is now.
 */
export function planRestore(
  current: Partial<Record<TrackedField, unknown>>,
  changes: readonly FieldChangeRecord[],
): RestorePlan {
  const plan: RestorePlan = { data: {}, restored: [], kept: [] };
  for (const c of changes) {
    if (encodeValue(current[c.field]) === c.newValue) {
      plan.data[c.field] = decodeValue(c.field, c.previousValue);
      plan.restored.push(c.field);
    } else {
      plan.kept.push(c.field);
    }
  }
  return plan;
}
