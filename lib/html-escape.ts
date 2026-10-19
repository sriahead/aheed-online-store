/**
 * #1135 — escape a string for interpolation into HTML text or a quoted attribute.
 *
 * The transactional email templates build HTML from template literals, and until a shopper's item
 * note reached the order confirmation, every interpolated string came from the vendor's own data.
 * Any string a shopper can type must pass through this before it reaches an email body.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
