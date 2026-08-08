import { readEnv } from "./config";

/**
 * Non-secret environment diagnostics for the ADMIN /dev page (issue #41).
 *
 * SECURITY: this returns only presence-check booleans, the deployed commit,
 * and the (non-secret) KMS URL — NEVER a secret value. `integrations` answers
 * "is this wired for this environment?" without exposing any key. Keep it that
 * way: adding a real secret value to this return type would violate CLAUDE.md.
 */
export interface DevDiagnostics {
  commit: string | null;
  integrations: {
    googleSignIn: boolean;
    storage: boolean;
    email: boolean;
    cdn: boolean;
    betterAuthUrl: boolean;
  };
  kmsUrl: string | null;
}

export function getDevDiagnostics(): DevDiagnostics {
  const has = (...keys: string[]) => keys.every((k) => Boolean(readEnv(k)));
  return {
    commit: readEnv("GIT_COMMIT_SHA") ?? null,
    integrations: {
      googleSignIn: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      storage: has("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"),
      email: has("RESEND_API_KEY", "RESEND_FROM_EMAIL"),
      cdn: has("CDN_BASE_URL"),
      betterAuthUrl: has("BETTER_AUTH_URL"),
    },
    kmsUrl: readEnv("KMS_INTERNAL_URL") ?? null,
  };
}
