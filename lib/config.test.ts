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
      delete process.env.RESEND_FROM_EMAIL;
    });

    it("rejects missing Stripe keys in production", () => {
      expect(() => getPaymentEnv()).toThrow("STRIPE_SECRET_KEY is required in production");
      // Add key to see if the other is required
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      expect(() => getPaymentEnv()).toThrow("STRIPE_WEBHOOK_SECRET is required in production");
    });

    it("rejects missing Resend keys in production", () => {
      expect(() => getEmailEnv()).toThrow("RESEND_API_KEY is required in production");
      process.env.RESEND_API_KEY = "re_123";
      expect(() => getEmailEnv()).toThrow("RESEND_FROM_EMAIL is required in production");
    });

    it("passes when all production required keys are present", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
      expect(() => getPaymentEnv()).not.toThrow();

      process.env.RESEND_API_KEY = "re_123";
      process.env.RESEND_FROM_EMAIL = "test@example.com";
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
      delete process.env.RESEND_FROM_EMAIL;
    });

    it("allows missing optional keys in development", () => {
      // Despite missing Stripe and Resend keys, it does not throw
      expect(() => getPaymentEnv()).not.toThrow();
      expect(() => getEmailEnv()).not.toThrow();
    });
  });
});
