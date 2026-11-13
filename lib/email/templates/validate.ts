import { COPY_FIELD_LIMITS, COPY_FIELDS, placeholdersIn, type CopyField } from "./copy";
import { templateDefinition, TEMPLATE_KEYS, type TemplateKey } from "./registry";

/**
 * #1564 R12 — what a store admin may save for one template. Pure, so the page, the Server Action
 * and the tests share one rule. Only the template's editable fields are read; a blank field means
 * "use the default" and is stored as null.
 */

export type OverrideFields = Record<CopyField, string | null>;

export type OverrideValidation =
  { ok: true; fields: OverrideFields } | { ok: false; errors: Partial<Record<CopyField, string>> };

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}

const LABEL: Record<CopyField, string> = {
  subject: "Subject",
  preheader: "Preview line",
  heading: "Heading",
  intro: "Introduction",
  ctaLabel: "Button label",
  reassurance: "Reassurance line",
  signOff: "Sign-off",
};

export function fieldLabel(field: CopyField): string {
  return LABEL[field];
}

export function validateOverride(
  key: TemplateKey,
  raw: Partial<Record<CopyField, unknown>>,
): OverrideValidation {
  const def = templateDefinition(key);
  const fields = Object.fromEntries(COPY_FIELDS.map((f) => [f, null])) as OverrideFields;
  const errors: Partial<Record<CopyField, string>> = {};

  for (const field of def.editable) {
    const value = typeof raw[field] === "string" ? (raw[field] as string).trim() : "";
    if (value === "") continue;
    if (value.length > COPY_FIELD_LIMITS[field]) {
      errors[field] = `${LABEL[field]} can be at most ${COPY_FIELD_LIMITS[field]} characters.`;
      continue;
    }
    if (
      field === "subject" ||
      field === "preheader" ||
      field === "ctaLabel" ||
      field === "heading"
    ) {
      if (/[\r\n]/.test(value)) {
        errors[field] = `${LABEL[field]} must be on one line.`;
        continue;
      }
    }
    const opens = (value.match(/\{\{/g) ?? []).length;
    const closes = (value.match(/\}\}/g) ?? []).length;
    if (opens !== closes) {
      errors[field] = "Check the placeholders: each {{ needs a matching }}.";
      continue;
    }
    const unknown = placeholdersIn(value).filter((name) => !def.placeholders.includes(name));
    const malformed = value.replace(/\{\{\s*[a-zA-Z][a-zA-Z0-9]*\s*\}\}/g, "").includes("{{");
    if (unknown.length > 0 || malformed) {
      const allowed = def.placeholders.map((p) => `{{${p}}}`).join(", ");
      errors[field] = unknown.length
        ? `${unknown.map((n) => `{{${n}}}`).join(", ")} isn't available here. You can use ${allowed}.`
        : `That placeholder isn't recognised. You can use ${allowed}.`;
      continue;
    }
    fields[field] = value;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, fields };
}
