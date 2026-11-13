import type { EmailBrand } from "@/lib/email/layout/brand";
import { renderEmail, type EmailContent } from "@/lib/email/layout/render";
import { COPY_FIELDS, interpolate, resolveCopy, type CopyFields } from "./copy";
import { templateDefinition, type TemplateKey } from "./registry";

/**
 * #1564 — the shared last step of every customer template: pick the wording (a store's saved
 * override for an editable field when it has one, else the platform default), fill the
 * placeholders, and render through the one layout.
 */

/** A store's saved wording for one template; a blank or missing field means the default. */
export type CopyOverrides = Partial<Record<keyof CopyFields, string | null>>;

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export function templateCopy(
  key: TemplateKey,
  values: Readonly<Record<string, string>>,
  overrides?: CopyOverrides | null,
): { copy: CopyFields; reason: string } {
  const def = templateDefinition(key);
  const chosen = { ...def.defaults };
  if (overrides) {
    for (const field of COPY_FIELDS) {
      const value = overrides[field];
      if (def.editable.includes(field) && typeof value === "string" && value.trim() !== "") {
        chosen[field] = value;
      }
    }
  }
  return { copy: resolveCopy(chosen, values), reason: interpolate(def.reason, values) };
}

/**
 * Renders `content` (which already carries the resolved copy in its fields) and returns the parts
 * a sender needs. `subject` is passed separately because some templates adjust it (a code suffix,
 * `Re:` threading).
 */
export function finish(subject: string, content: EmailContent, brand: EmailBrand): RenderedEmail {
  const { html, text } = renderEmail(content, brand);
  return { subject, preheader: content.preheader, html, text };
}

/** Empty string → null, so the layout omits that part. */
export function orNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}
