import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getEnv, getEmailEnv, getPaymentEnv } from "./config";

describe("config environments", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  describe("production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.DATABASE_URL = "postgres://fake";
      process.env.BETTER_AUTH_SECRET = "secret";
      // Clear optional keys
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
      delete process.env.EMAIL_PROVIDER;
    });

    it("rejects missing Stripe keys in production", () => {
      expect(() => getPaymentEnv()).toThrow("STRIPE_SECRET_KEY is required in production");
      // Add key to see if the other is required
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      expect(() => getPaymentEnv()).toThrow("STRIPE_WEBHOOK_SECRET is required in production");
    });

    // #1217 R8 — the three production email cases.
    it("rejects a missing EMAIL_FROM in production", () => {
      expect(() => getEmailEnv()).toThrow("EMAIL_FROM is required in production");
    });

    it("requires RESEND_API_KEY only when EMAIL_PROVIDER=resend", () => {
      process.env.EMAIL_FROM = "no-reply@example.com";
      process.env.EMAIL_PROVIDER = "resend";
      expect(() => getEmailEnv()).toThrow(
        "RESEND_API_KEY is required in production when EMAIL_PROVIDER=resend",
      );
    });

    it("accepts the Cloudflare provider with no Resend key", () => {
      process.env.EMAIL_FROM = "no-reply@example.com";
      process.env.EMAIL_PROVIDER = "cloudflare";
      expect(() => getEmailEnv()).not.toThrow();
      delete process.env.EMAIL_PROVIDER;
      expect(() => getEmailEnv()).not.toThrow();
    });

    it("passes when all production required keys are present", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
      expect(() => getPaymentEnv()).not.toThrow();

      process.env.EMAIL_FROM = "test@example.com";
      expect(() => getEmailEnv()).not.toThrow();
    });
  });

  describe("development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      process.env.DATABASE_URL = "postgres://fake";
      process.env.BETTER_AUTH_SECRET = "secret";
      // Clear optional keys
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
      delete process.env.EMAIL_PROVIDER;
    });

    it("allows missing optional keys in development", () => {
      // Despite missing Stripe and Resend keys, it does not throw
      expect(() => getPaymentEnv()).not.toThrow();
      expect(() => getEmailEnv()).not.toThrow();
    });
  });
});
