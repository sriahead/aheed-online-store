import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDevDiagnostics } from "@/lib/dev-diagnostics";

// readEnv() falls back to process.env outside a Worker request context (see
// lib/config.ts), so we can drive these tests by setting process.env.
const KEYS = [
  "GIT_COMMIT_SHA",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "CDN_BASE_URL",
  "BETTER_AUTH_URL",
  "KMS_INTERNAL_URL",
];

describe("getDevDiagnostics", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports integrations false when keys are unset", () => {
    const d = getDevDiagnostics();
    expect(d.integrations).toEqual({
      googleSignIn: false,
      storage: false,
      email: false,
      cdn: false,
      betterAuthUrl: false,
    });
    expect(d.commit).toBeNull();
    expect(d.kmsUrl).toBeNull();
  });

  it("reports a flag true only when all its keys are present", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.CDN_BASE_URL = "https://cdn.example.com";
    const d = getDevDiagnostics();
    expect(d.integrations.googleSignIn).toBe(true);
    expect(d.integrations.cdn).toBe(true);
    expect(d.integrations.storage).toBe(false); // S3_* not all set
  });

  it("all integration values are booleans", () => {
    process.env.S3_ENDPOINT = "x";
    const d = getDevDiagnostics();
    for (const v of Object.values(d.integrations)) {
      expect(typeof v).toBe("boolean");
    }
  });

  it("never leaks a secret value into the returned object", () => {
    const sentinel = "SUPER-SECRET-VALUE-9f3a";
    process.env.GOOGLE_CLIENT_SECRET = sentinel;
    process.env.S3_SECRET_KEY = sentinel;
    process.env.BETTER_AUTH_SECRET = sentinel;
    process.env.RESEND_API_KEY = sentinel;
    const serialized = JSON.stringify(getDevDiagnostics());
    expect(serialized).not.toContain(sentinel);
  });
});
