/**
 * Stripe webhook signature verification (P3c, #99).
 *
 * Pure except for WebCrypto — no network, no DB — so it is unit-testable with no
 * Stripe credentials. Implemented directly rather than via the `stripe` package,
 * matching this repo's established choice of raw `fetch`/WebCrypto over vendor
 * SDKs for Worker bundle size (aws4fetch over the AWS SDK; plain fetch over
 * Resend's SDK).
 *
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends it as
 * `Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...]`. Multiple v1 values appear
 * while a signing secret is being rotated, so any match counts.
 */

/** Stripe's own recommended replay window. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

/** Parses `t=...,v1=...` into its parts; null when malformed or missing pieces. */
export function parseSignatureHeader(header: string | null): ParsedSignatureHeader | null {
  if (!header) return null;

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    if (key.trim() === "t") {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key.trim() === "v1") {
      signatures.push(value.trim());
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison. Never returns early on the first differing
 * character — an early return leaks, through timing, how much of a forged
 * signature was correct, which is enough to reconstruct one byte at a time.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True only when the signature matches AND the timestamp is inside the tolerance.
 *
 * `rawBody` must be the exact bytes Stripe sent — re-serialising parsed JSON
 * changes whitespace/key order and the signature will never match.
 * `nowSeconds` is injected so replay-window behaviour is deterministically
 * testable.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  // Reject replays of an old-but-genuine payload.
  if (Math.abs(nowSeconds - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${rawBody}`),
  );
  const expected = toHex(digest);

  return parsed.signatures.some((candidate) => timingSafeEqual(candidate, expected));
}

/** The Stripe event shape this handler actually consumes — deliberately narrow. */
export interface StripeCheckoutEvent {
  type: string;
  orderNumber: string | null;
  /** Only meaningful for checkout.session.completed. */
  paymentStatus: string | null;
  sessionId: string | null;
}

/** Extracts just what the handler needs; tolerant of unknown/other event shapes. */
export function parseCheckoutEvent(payload: unknown): StripeCheckoutEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const event = payload as {
    type?: unknown;
    data?: {
      object?: { metadata?: { orderNumber?: unknown }; payment_status?: unknown; id?: unknown };
    };
  };
  if (typeof event.type !== "string") return null;

  const session = event.data?.object;
  return {
    type: event.type,
    orderNumber:
      typeof session?.metadata?.orderNumber === "string" ? session.metadata.orderNumber : null,
    paymentStatus: typeof session?.payment_status === "string" ? session.payment_status : null,
    sessionId: typeof session?.id === "string" ? session.id : null,
  };
}
