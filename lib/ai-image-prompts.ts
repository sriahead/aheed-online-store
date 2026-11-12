/**
 * #1535 — prompts for AI photos of bundles and promotion banners. Pure, DB-free, session-free.
 *
 * Earlier generated catalogue images came back with live animals in place of meat and with
 * garbled lettering (#1521), so every prompt here states both exclusions. The wording is
 * vendor-neutral: what is pictured comes from the vendor's own product names, never from here.
 */

export interface PromptItem {
  name: string;
  quantity: number;
}

const MAX_ITEMS = 6;

/** The exclusions every generated photo carries. */
export const IMAGE_PROMPT_GUARDRAILS =
  "Show only the goods as a shop sells them: food raw or prepared and ready to cook, packaged goods in their packs. " +
  "No live animals, no people, no hands. No text, no lettering, no labels, no logos, no price tags.";

/** "4 × Medium Chicken (1100–1200g), 2 × Lamb Chops" — the first few items, largest quantity first. */
export function describeItems(items: readonly PromptItem[]): string {
  const sorted = [...items]
    .filter((item) => item.name.trim() !== "")
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, MAX_ITEMS);
  return sorted
    .map((item) =>
      item.quantity > 1 ? `${item.quantity} × ${item.name.trim()}` : item.name.trim(),
    )
    .join(", ");
}

export function buildBundleImagePrompt(bundleName: string, items: readonly PromptItem[]): string {
  const contents = describeItems(items) || bundleName.trim();
  return (
    `Commercial product photograph of a shop bundle called "${bundleName.trim()}": ${contents}, ` +
    "arranged together on a clean neutral surface, three-quarter view, soft studio lighting, sharp focus, appetising, realistic. " +
    IMAGE_PROMPT_GUARDRAILS
  );
}

/** Alt text for a generated bundle photo: what is in it, not how it looks. */
export function bundleImageAltText(bundleName: string, items: readonly PromptItem[]): string {
  const contents = describeItems(items);
  const text = contents ? `${bundleName.trim()}: ${contents}` : bundleName.trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}

/**
 * A wide banner photo for a promotion. `subject` is what the promotion sells (the product, the
 * bundle's contents or the department); the headline only sets the mood and is never drawn as text.
 */
export function buildPromotionBannerPrompt(subject: string, headline: string): string {
  const what = subject.trim() || headline.trim();
  return (
    `Wide commercial banner photograph for a shop promotion of ${what}. ` +
    `The offer is "${headline.trim()}", but do not write it anywhere. ` +
    "Generous empty space on the left for overlaid text, subject on the right, soft studio lighting, shallow depth of field, appetising, realistic. " +
    IMAGE_PROMPT_GUARDRAILS
  );
}
