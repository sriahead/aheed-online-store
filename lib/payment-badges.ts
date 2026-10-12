/**
 * #1055 — the payment-method badges the storefront footer can show, in display order.
 *
 * The order here IS the display order (the `VendorPaymentBadge` table has no `sortOrder`), and it
 * mirrors the `PaymentBadgeMethod` enum's declaration order in `prisma/schema.prisma`. The images
 * are platform static assets under `public/payment-methods/` — a card scheme's logo is the same for
 * every vendor, so they are not vendor uploads and carry no storage key (ADR-003 covers uploads).
 *
 * A plain module, no Prisma import: the footer, the staff form and the form parser all read it.
 */
export const PAYMENT_BADGE_METHODS = [
  "VISA",
  "MASTERCARD",
  "AMEX",
  "APPLE_PAY",
  "GOOGLE_PAY",
] as const;

export type PaymentBadgeMethodName = (typeof PAYMENT_BADGE_METHODS)[number];

export const PAYMENT_BADGE_DETAILS: Record<PaymentBadgeMethodName, { label: string; src: string }> =
  {
    VISA: { label: "Visa", src: "/payment-methods/visa.svg" },
    MASTERCARD: { label: "Mastercard", src: "/payment-methods/mastercard.svg" },
    AMEX: { label: "American Express", src: "/payment-methods/amex.svg" },
    APPLE_PAY: { label: "Apple Pay", src: "/payment-methods/apple-pay.svg" },
    GOOGLE_PAY: { label: "Google Pay", src: "/payment-methods/google-pay.svg" },
  };

export function isPaymentBadgeMethod(value: string): value is PaymentBadgeMethodName {
  return (PAYMENT_BADGE_METHODS as readonly string[]).includes(value);
}

/** Sorts methods into display order and drops duplicates. */
export function orderPaymentBadges(methods: readonly string[]): PaymentBadgeMethodName[] {
  return PAYMENT_BADGE_METHODS.filter((m) => methods.includes(m));
}
