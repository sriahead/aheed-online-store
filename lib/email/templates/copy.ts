/**
 * #1564 R5/R12 — the editable wording of a template, and the `{{placeholder}}` rules shared by the
 * renderer and (part 2) the editor's validator.
 */

export const COPY_FIELDS = [
  "subject",
  "preheader",
  "heading",
  "intro",
  "ctaLabel",
  "reassurance",
  "signOff",
] as const;

export type CopyField = (typeof COPY_FIELDS)[number];
export type CopyFields = Record<CopyField, string>;

/** R12 — the longest each field may be once edited. */
export const COPY_FIELD_LIMITS: Record<CopyField, number> = {
  subject: 150,
  preheader: 150,
  heading: 120,
  intro: 600,
  ctaLabel: 40,
  reassurance: 600,
  signOff: 600,
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** The placeholder names a string uses, in order of first appearance. */
export function placeholdersIn(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * Fills `{{name}}` from `values`. Values are plain text; the layout escapes the result. A name the
 * template does not provide is left as written, which the editor refuses on save (R12), so it can
 * only reach a customer through a code default — and the registry test forbids that.
 */
export function interpolate(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole,
  );
}

/** Every field interpolated; an empty result stays empty (the renderer then omits that part). */
export function resolveCopy(
  copy: CopyFields,
  values: Readonly<Record<string, string>>,
): CopyFields {
  const out = {} as CopyFields;
  for (const field of COPY_FIELDS) out[field] = interpolate(copy[field], values).trim();
  return out;
}
