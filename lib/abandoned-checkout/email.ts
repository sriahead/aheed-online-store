import { formatPrice } from "@/components/product/format-price";
import type { EmailBrand } from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import type { EmailBlock } from "@/lib/email/layout/render";
import {
  finish,
  orNull,
  templateCopy,
  type CopyOverrides,
  type RenderedEmail,
} from "@/lib/email/templates/compose";

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
 * when the code actually has one. Every vendor- or customer-supplied string is escaped by the
 * layout (#1135). #1564: the wording is the `marketing.abandoned_checkout` template's; the
 * greeting, items, code, consent reason and opt-out stay locked.
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
  /** #1564 — the store's look; neutral when absent. */
  brand?: EmailBrand;
  overrides?: CopyOverrides | null;
}

export const MAX_ITEMS_SHOWN = 6;

export function codeBenefit(code: RecoveryCode): string {
  if (code.kind === "PERCENTAGE") {
    const percent = code.value / 100;
    return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}% off`;
  }
  return `${formatPrice(code.value)} off`;
}

function codeText(code: RecoveryCode): string {
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
  const suffix = conditions.length ? ` ${conditions.join(", ")}` : "";
  return `As a thank-you for coming back, here's **${codeBenefit(code)}**${suffix}. Use code **${code.code}** at checkout.`;
}

export function buildRecoveryEmail(input: RecoveryEmailInput): RenderedEmail {
  const brand = input.brand ?? fallbackBrand(input.storeName);
  const { copy, reason } = templateCopy(
    "marketing.abandoned_checkout",
    { storeName: input.storeName },
    input.overrides,
  );
  const shown = input.items.slice(0, MAX_ITEMS_SHOWN);
  const more = input.items.length - shown.length;
  const rows = shown.map((item) => ({
    label: `${item.quantity} × ${item.productName}`,
    amount: formatPrice(item.lineTotalPence),
  }));
  if (more > 0) rows.push({ label: `and ${more} more`, amount: "" });

  const blocks: EmailBlock[] = [
    {
      kind: "items",
      rows,
      totals: [{ label: "Total", amount: formatPrice(input.totalPence), strong: true }],
    },
  ];
  if (input.code)
    blocks.push({ kind: "callout", title: "A thank-you from us", text: codeText(input.code) });

  const subject = input.code ? `${copy.subject} (${codeBenefit(input.code)} inside)` : copy.subject;
  return finish(
    subject,
    {
      preheader: copy.preheader,
      greeting: input.firstName ? `Hi ${input.firstName},` : "Hello,",
      heading: copy.heading,
      intro: orNull(copy.intro),
      blocks,
      cta:
        input.orderHref && copy.ctaLabel ? { label: copy.ctaLabel, href: input.orderHref } : null,
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
      footerNote: input.preferencesHref
        ? {
            text: "Don't want these emails?",
            link: { label: "Stop marketing emails", href: input.preferencesHref },
          }
        : { text: "Reply to this email to stop marketing emails." },
    },
    brand,
  );
}
