import { getEnv } from "./config";

/**
 * PaymentService port (P3b, #96) with the real Stripe adapter (P3c, #99).
 *
 * Hosted Stripe Checkout: we create a session server-side and redirect. Stripe
 * handles UK Strong Customer Authentication / 3-D Secure — a legal requirement,
 * not a nicety — and card data never touches our servers (ADR-005).
 *
 * Implemented with raw `fetch`, NOT the `stripe` npm SDK: this repo already chose
 * aws4fetch over the AWS SDK and plain fetch over Resend's SDK, both for Worker
 * bundle size. The SDK carries the same Node-runtime baggage.
 *
 * There is no publishable key anywhere here — hosted Checkout is a server-created
 * session plus a redirect, so nothing Stripe-related reaches the browser.
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
  /** Absolute origin to return the shopper to, e.g. https://staging.aheed…. Passed
   *  in rather than read from request context, so the order transaction stays
   *  free of `headers()` and remains testable from a plain script (P3b R9a). */
  returnOrigin: string;
}

export interface CreatePaymentResult {
  provider: string;
  status: PaymentIntentStatus;
  /** Provider-side id (Stripe session id). Null while stubbed. */
  providerReference: string | null;
  /** Where to send the shopper to pay. Null when no redirect is needed (stub). */
  redirectUrl: string | null;
}

export interface PaymentService {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}

export const STUB_PAYMENT_PROVIDER = "stub";
export const STRIPE_PAYMENT_PROVIDER = "stripe";

const STRIPE_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * Stub adapter — used whenever STRIPE_SECRET_KEY is unset, so local dev and CI
 * work with no Stripe setup at all.
 *
 * Deliberately no side effect and no SUCCEEDED path: a stub that pretended to
 * succeed would let orders look paid when they never were.
 */
export function createStubPaymentService(): PaymentService {
  return {
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

export function createStripePaymentService(secretKey: string): PaymentService {
  return {
    async createPayment(input) {
      // Stripe's API is form-encoded, including its bracketed nested keys.
      const body = new URLSearchParams({
        mode: "payment",
        // The shopper returns here; the page reads the order's real status from
        // the DB rather than trusting the redirect (P3c R21).
        success_url: `${input.returnOrigin}/checkout/${input.orderNumber}`,
        cancel_url: `${input.returnOrigin}/api/checkout/cancel?orderNumber=${input.orderNumber}`,
        // Traceable from the Stripe dashboard back to an order without a query.
        client_reference_id: input.orderNumber,
        "metadata[orderNumber]": input.orderNumber,
        "metadata[vendorId]": input.vendorId,
        "line_items[0][quantity]": "1",
        // Currency comes from the order, never hardcoded — a vendor trading in
        // another currency must not require a code change.
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(input.amountPence),
        "line_items[0][price_data][product_data][name]": `Order ${input.orderNumber}`,
      });

      const response = await fetch(STRIPE_SESSIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          // Stripe dedupes retries of the same order server-side.
          "Idempotency-Key": `order-${input.orderNumber}`,
        },
        body,
      });

      if (!response.ok) {
        throw new PaymentProviderError(
          `Stripe session creation failed: ${response.status} ${await response.text()}`,
        );
      }

      const session = (await response.json()) as { id?: string; url?: string };
      if (!session.id || !session.url) {
        throw new PaymentProviderError("Stripe session response missing id/url");
      }

      return {
        provider: STRIPE_PAYMENT_PROVIDER,
        status: "PENDING",
        providerReference: session.id,
        redirectUrl: session.url,
      };
    },
  };
}

/** Stripe when configured, stub otherwise — mirrors getEmailService()'s degradation. */
export function getPaymentService(): PaymentService {
  const { STRIPE_SECRET_KEY } = getEnv();
  return STRIPE_SECRET_KEY
    ? createStripePaymentService(STRIPE_SECRET_KEY)
    : createStubPaymentService();
}
