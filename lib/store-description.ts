/**
 * #905 — a vendor's store description ("what this store sells"), and how it reaches an AI prompt.
 *
 * The three prompts that used to hardcode a grocery framing (`lib/list-normalisation.ts`,
 * `lib/search-synonym-proposals.ts`, `lib/net-content-suggester.ts`) now open with a neutral line
 * and, when the vendor has written one, a second line quoting this description. The vendor's own
 * words replace the platform's assumption about what every vendor sells.
 *
 * The description is admin-written text travelling into a model, so it is inserted as DATA, never
 * as instruction: one line, capped, inside quotation marks after a fixed label. It cannot add a
 * line of its own or close the quote it sits in. Pure — no I/O — so the prompt tests reach it
 * directly.
 */

/** The longest description stored or sent. Matches the settings form's `maxLength`. */
export const STORE_DESCRIPTION_MAX_LENGTH = 200;

/** Every run of whitespace, newlines included, becomes one space; the ends are trimmed. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The prompt line for a description, or `null` when there is nothing to say — the caller then
 * leaves the prompt on its neutral wording alone. Re-applies the stored-value rules (one line, at
 * most 200 characters) rather than trusting them, and swaps `"` for `'` so the value cannot end
 * the quote early.
 */
export function storeDescriptionPromptLine(description: string | null): string | null {
  if (description === null) return null;
  const value = collapseWhitespace(description)
    .slice(0, STORE_DESCRIPTION_MAX_LENGTH)
    .replace(/"/g, "'");
  if (value === "") return null;
  return `The shop describes itself as: "${value}"`;
}
