import { getPaymentEnv } from "./config";

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
  /** P9.1 (#427/#428) — the order's capability token, carried on both return
   *  URLs. Required, not optional: a guest returning from Stripe without it is
   *  refused by `findOrderForViewer`, so an adapter that forgot to include it
   *  would lock every guest out of their own confirmation. */
  confirmationToken: string;
}

export interface CreatePaymentResult {
  provider: string;
  status: PaymentIntentStatus;
  /** Provider-side id (Stripe session id). Null while stubbed. */
  providerReference: string | null;
  /** Where to send the shopper to pay. Null when no redirect is needed (stub). */
  redirectUrl: string | null;
}

/**
 * What the provider says about a session we already created (#454).
 *
 * Every field is nullable except `id` because this is read back from a remote
 * API and a caller must not be able to treat an absent field as a zero. The
 * recovery path in `features/payments/` compares all three of `paymentStatus`,
 * `amountTotal` and `currency` before it will build a binding from this.
 */
export interface RetrievedSession {
  id: string;
  /** Stripe's `payment_status` — only the literal `"paid"` authorizes a recovery. */
  paymentStatus: string | null;
  /** Stripe's session `status` (`open` / `complete` / `expired`), for display. */
  status: string | null;
  amountTotal: number | null;
  currency: string | null;
}

export interface PaymentService {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /**
   * Reads back a session by id (#454). Added so a refused webhook binding can be
   * confirmed or overturned against the provider's OWN record rather than by
   * re-driving an event that may have been refused correctly.
   *
   * A read, deliberately: nothing here can move money or change an order. The
   * only thing that acts on the result is `confirmPayment`, unchanged, via the
   * same compare-and-set predicate #429 installed.
   */
  retrieveSession(sessionId: string): Promise<RetrievedSession>;
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
    // Never "paid", for the same reason createPayment has no SUCCEEDED path: a
    // stub that reported a payment as settled would let the #454 recovery path
    // confirm an order no money was ever taken for.
    async retrieveSession(sessionId) {
      return {
        id: sessionId,
        paymentStatus: "unpaid",
        status: "open",
        amountTotal: null,
        currency: null,
      };
    },
  };
}

export function createStripePaymentService(secretKey: string): PaymentService {
  return {
    async createPayment(input) {
      // P9.1 (#427/#428). Both return URLs carry the order's capability token —
      // the order number alone authorizes nothing. Encoded because it rides in a
      // query string, even though randomUUID() emits nothing that needs it.
      const token = encodeURIComponent(input.confirmationToken);

      // Stripe's API is form-encoded, including its bracketed nested keys.
      const body = new URLSearchParams({
        mode: "payment",
        // The shopper returns here; the page reads the order's real status from
        // the DB rather than trusting the redirect (P3c R21).
        success_url: `${input.returnOrigin}/checkout/${input.orderNumber}?t=${token}`,
        // A PAGE, not an API route, and deliberately not a mutation: Stripe
        // returns the browser here with a GET, so cancelling from this request
        // would be a destructive GET reachable by any prefetcher, scanner or
        // unfurler that touches the URL. The page asks; a POST server action
        // acts (#428).
        cancel_url: `${input.returnOrigin}/checkout/${input.orderNumber}/cancel?t=${token}`,
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

    async retrieveSession(sessionId) {
      // Raw fetch, no `stripe` npm SDK — same Worker-bundle-size reason as
      // createPayment above. Path-encoded because the id lands in the URL.
      const response = await fetch(`${STRIPE_SESSIONS_URL}/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
      });

      if (!response.ok) {
        throw new PaymentProviderError(
          `Stripe session retrieval failed: ${response.status} ${await response.text()}`,
        );
      }

      const session = (await response.json()) as {
        id?: string;
        payment_status?: string;
        status?: string;
        amount_total?: number;
        currency?: string;
      };

      return {
        id: session.id ?? sessionId,
        paymentStatus: session.payment_status ?? null,
        status: session.status ?? null,
        // `?? null` rather than `|| null` — a legitimately zero amount_total is
        // not the same as an absent one, and only the absent case may be null.
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
      };
    },
  };
}

/** Stripe when configured, stub otherwise — mirrors getEmailService()'s degradation. */
export function getPaymentService(): PaymentService {
  const { STRIPE_SECRET_KEY } = getPaymentEnv();
  return STRIPE_SECRET_KEY
    ? createStripePaymentService(STRIPE_SECRET_KEY)
    : createStubPaymentService();
}
