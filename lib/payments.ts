/**
 * PaymentService port (P3b, #96). `tech-stack.md` has named this port since the
 * architecture baseline; this is its first real definition.
 *
 * The P3b adapter is a STUB: it records an intent to charge and returns PENDING,
 * so the risky part of checkout (atomic order creation + stock decrement) is
 * fully testable before any Stripe credential exists. P3c swaps in the Stripe
 * Checkout adapter behind this same interface — see ADR-005 for the money-flow
 * decision (single platform account, Connect-ready seam).
 *
 * Card data never touches our servers in any implementation of this port.
 */

export type PaymentIntentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface CreatePaymentInput {
  orderNumber: string;
  amountPence: number;
  currency: string;
  /** Which vendor the money is *for* — ADR-005's Connect-ready seam. Today every
   *  vendor settles into the single platform account, so adapters may ignore it;
   *  it exists so adding Stripe Connect later is additive, not a rewrite. */
  vendorId: string;
}

export interface CreatePaymentResult {
  provider: string;
  status: PaymentIntentStatus;
  /** Provider-side id (Stripe session/intent). Null while stubbed. */
  providerReference: string | null;
  /** Where to send the shopper to pay. Null when no redirect is needed (stub). */
  redirectUrl: string | null;
}

export interface PaymentService {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}

export const STUB_PAYMENT_PROVIDER = "stub";

/**
 * Stub adapter. Returns PENDING with no provider reference — the order is created
 * and stock is held, but nothing is charged and nothing moves the order to
 * CONFIRMED. That transition is P3c's webhook.
 */
export function getPaymentService(): PaymentService {
  return {
    // Deliberately no side effect and no SUCCEEDED path: a stub that pretended to
    // succeed would let P3b ship orders that look paid but never were.
    async createPayment() {
      return {
        provider: STUB_PAYMENT_PROVIDER,
        status: "PENDING",
        providerReference: null,
        redirectUrl: null,
      };
    },
  };
}
