import { describe, it, expect } from "vitest";
import {
  parseCheckoutEvent,
  parseSignatureHeader,
  SIGNATURE_TOLERANCE_SECONDS,
  timingSafeEqual,
  verifyStripeSignature,
} from "@/lib/stripe-webhook";

// lib/stripe-webhook.ts is pure (WebCrypto only — no network, no DB), so this
// runs with NO Stripe credentials of any kind.

const SECRET = "whsec_test_secret";
const NOW = 1_760_000_000;

/** Builds a genuine Stripe-style signature header, the same way Stripe does. */
async function signPayload(body: string, secret: string, timestamp: number): Promise<string> {
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
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

const BODY = JSON.stringify({
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_1",
      payment_status: "paid",
      // P9.1 (#429) — the two fields the payment binding compares on, in the
      // shape and units Stripe actually sends them: the currency lower-cased,
      // the amount in the currency's minor unit.
      amount_total: 2346,
      currency: "gbp",
      metadata: { orderNumber: "AHE-1" },
    },
  },
});

describe("verifyStripeSignature", () => {
  it("accepts a genuine signature", async () => {
    const header = await signPayload(BODY, SECRET, NOW);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });

  it("rejects a tampered body — the whole point of signing", async () => {
    const header = await signPayload(BODY, SECRET, NOW);
    const tampered = BODY.replace('"paid"', '"unpaid"');
    expect(await verifyStripeSignature(tampered, header, SECRET, NOW)).toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    const header = await signPayload(BODY, "whsec_wrong", NOW);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  it("rejects a replay outside the tolerance window", async () => {
    const old = NOW - (SIGNATURE_TOLERANCE_SECONDS + 1);
    const header = await signPayload(BODY, SECRET, old);
    // Genuinely signed, but too old — this is what stops captured-payload replays.
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  it("accepts one just inside the tolerance window", async () => {
    const recent = NOW - (SIGNATURE_TOLERANCE_SECONDS - 1);
    const header = await signPayload(BODY, SECRET, recent);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });

  it("rejects a missing or malformed header", async () => {
    expect(await verifyStripeSignature(BODY, null, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, "", SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, "garbage", SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, "t=123", SECRET, NOW)).toBe(false); // no v1
  });

  it("rejects when no secret is configured", async () => {
    const header = await signPayload(BODY, SECRET, NOW);
    expect(await verifyStripeSignature(BODY, header, "", NOW)).toBe(false);
  });

  it("accepts when any v1 matches — secrets rotate with two live at once", async () => {
    const good = await signPayload(BODY, SECRET, NOW);
    const goodHex = good.split("v1=")[1];
    const header = `t=${NOW},v1=deadbeef,v1=${goodHex}`;
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });
});

describe("parseSignatureHeader", () => {
  it("extracts timestamp and all v1 values", () => {
    expect(parseSignatureHeader("t=123,v1=aaa,v1=bbb")).toEqual({
      timestamp: 123,
      signatures: ["aaa", "bbb"],
    });
  });

  it("returns null when a required part is missing", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("v1=aaa")).toBeNull();
    expect(parseSignatureHeader("t=abc,v1=aaa")).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("compares equal strings as equal", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects differing strings, including differing lengths", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("parseCheckoutEvent", () => {
  it("extracts the fields the handler needs, including the binding's amount and currency", () => {
    expect(parseCheckoutEvent(JSON.parse(BODY))).toEqual({
      type: "checkout.session.completed",
      orderNumber: "AHE-1",
      paymentStatus: "paid",
      sessionId: "cs_test_1",
      amountTotal: 2346,
      currency: "gbp",
    });
  });

  // P9.1 (#429). A completed session that carries no amount or currency is not a
  // parse failure — it parses, with nulls, and `confirmPayment` then refuses it
  // as `unbindable`. The refusal is the repository's decision to make, not this
  // parser's, so the nulls have to survive being read.
  it("yields null amount and currency when the session carries neither", () => {
    const payload = {
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_2", payment_status: "paid", metadata: { orderNumber: "A" } } },
    };
    expect(parseCheckoutEvent(payload)).toMatchObject({
      sessionId: "cs_test_2",
      amountTotal: null,
      currency: null,
    });
  });

  it("tolerates unrelated event shapes without throwing", () => {
    expect(parseCheckoutEvent({ type: "customer.created", data: { object: {} } })).toEqual({
      type: "customer.created",
      orderNumber: null,
      paymentStatus: null,
      sessionId: null,
      amountTotal: null,
      currency: null,
    });
  });

  it("returns null for junk", () => {
    expect(parseCheckoutEvent(null)).toBeNull();
    expect(parseCheckoutEvent("nope")).toBeNull();
    expect(parseCheckoutEvent({ nope: true })).toBeNull();
  });
});
