import { formatPrice } from "@/components/product/format-price";
import { escapeHtml } from "@/lib/html-escape";

/**
 * #1554 — the recovery email for an abandoned checkout. It is MARKETING under PECR, so it only ever
 * goes to a customer with effective marketing consent, and it always carries the way out.
 *
 * The copy is built on behavioural principles, used honestly:
 *   - endowment effect: "your basket", listing the customer's own items, so it reads as theirs;
 *   - goal-gradient: they were one step from finishing, and the button takes them straight back;
 *   - cognitive ease: one action, one button, short paragraphs, the real total;
 *   - reciprocity: an optional code, framed as a thank-you rather than a bribe;
 *   - loss aversion, truthfully: the stock really was released when the checkout expired, so
 *     "we haven't held these" is a fact, not a pressure tactic;
 *   - anchoring with real numbers only: the code's saving is stated plainly beside the real total.
 *
 * What it never does, by design and by law (CPRs, DMCC Act 2024): no countdown, no invented
 * deadline, no "only 2 left", no claim about other shoppers. A code's real end date is stated only
 * when the code actually has one. Every vendor- or customer-supplied string is escaped (#1135).
 */

export interface RecoveryCode {
  code: string;
  kind: "PERCENTAGE" | "FIXED_AMOUNT";
  /** Basis points for PERCENTAGE (1000 = 10%), pence for FIXED_AMOUNT. */
  value: number;
  minSubtotalPence: number;
  endsAt: Date | null;
}

export interface RecoveryEmailInput {
  storeName: string;
  firstName: string | null;
  items: readonly { productName: string; quantity: number; lineTotalPence: number }[];
  totalPence: number;
  /** Where "Return to your basket" goes (the order page, with its Reorder button), or null. */
  orderHref: string | null;
  /** Where the customer changes their marketing choice, or null without a canonical host. */
  preferencesHref: string | null;
  code: RecoveryCode | null;
}

const BUTTON_STYLE =
  "display:inline-block;padding:12px 20px;border-radius:12px;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold";

export const MAX_ITEMS_SHOWN = 6;

export function codeBenefit(code: RecoveryCode): string {
  if (code.kind === "PERCENTAGE") {
    const percent = code.value / 100;
    return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}% off`;
  }
  return `${formatPrice(code.value)} off`;
}

function codeParagraph(code: RecoveryCode): string {
  const conditions: string[] = [];
  if (code.minSubtotalPence > 0) {
    conditions.push(`on orders over ${formatPrice(code.minSubtotalPence)}`);
  }
  if (code.endsAt) {
    const date = code.endsAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/London",
    });
    conditions.push(`until ${date}`);
  }
  const suffix = conditions.length ? ` ${escapeHtml(conditions.join(", "))}` : "";
  return `<p>As a thank-you for coming back, here's <strong>${escapeHtml(codeBenefit(code))}</strong>${suffix}. Use code <strong>${escapeHtml(code.code)}</strong> at checkout.</p>`;
}

export function buildRecoveryEmail(input: RecoveryEmailInput): { subject: string; html: string } {
  const store = escapeHtml(input.storeName);
  const greeting = input.firstName ? `Hi ${escapeHtml(input.firstName)},` : "Hello,";
  const shown = input.items.slice(0, MAX_ITEMS_SHOWN);
  const more = input.items.length - shown.length;
  const rows = shown
    .map(
      (item) =>
        `<tr><td>${item.quantity} × ${escapeHtml(item.productName)}</td><td align="right">${formatPrice(item.lineTotalPence)}</td></tr>`,
    )
    .join("");
  const moreRow = more > 0 ? `<tr><td colspan="2">and ${more} more</td></tr>` : "";
  const total = `<tr><td><strong>Total</strong></td><td align="right"><strong>${formatPrice(input.totalPence)}</strong></td></tr>`;

  const parts = [
    `<p>${greeting}</p>`,
    `<p>You were one step away from finishing your order with ${store}, so we've kept a note of your basket.</p>`,
    `<table cellpadding="4">${rows}${moreRow}${total}</table>`,
  ];
  if (input.code) parts.push(codeParagraph(input.code));
  parts.push(
    `<p>We haven't held these items for you, so if something is popular it may sell out before you check out.</p>`,
  );
  if (input.orderHref) {
    parts.push(
      `<p><a href="${escapeHtml(input.orderHref)}" style="${BUTTON_STYLE}">Return to your basket</a></p>`,
    );
  }
  const optOut = input.preferencesHref
    ? `<a href="${escapeHtml(input.preferencesHref)}">Stop marketing emails</a>.`
    : "Reply to this email to stop marketing emails.";
  parts.push(
    `<p>If you've changed your mind, that's fine: there's nothing you need to do.</p>`,
    `<p><small>You're getting this because you agreed to hear from ${store}. ${optOut}</small></p>`,
  );

  return {
    subject: input.code
      ? `Your basket is waiting, with ${codeBenefit(input.code)} — ${input.storeName}`
      : `Your basket is waiting — ${input.storeName}`,
    html: parts.join("\n"),
  };
}
