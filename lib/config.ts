import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";

/**
 * Reads a config value robustly in BOTH runtimes:
 *  - On Cloudflare Workers, secrets/vars are on the request-scoped binding env.
 *  - Locally (Node / next dev), they come from process.env.
 * Must be called within request scope on Workers (route handlers, server components).
 */
function readEnv(key: string): string | undefined {
  try {
    const { env } = getCloudflareContext();
    const v = (env as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    /* not in a Worker request context — fall through to process.env */
  }
  return process.env[key];
}

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon POOLED url)"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
  // ADR-002 — Better Auth. Secret is required (session/cookie signing); URL is
  // optional (Better Auth can infer it from the request when unset, but an
  // explicit per-environment value avoids cookie/redirect surprises in prod).
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BETTER_AUTH_URL: z.string().optional(),
});

export type AppEnv = z.infer<typeof schema>;

/** Lazily parse env at call time (request scope), never at module import. */
export function getEnv(): AppEnv {
  return schema.parse({
    DATABASE_URL: readEnv("DATABASE_URL"),
    S3_ENDPOINT: readEnv("S3_ENDPOINT"),
    S3_BUCKET: readEnv("S3_BUCKET"),
    S3_ACCESS_KEY: readEnv("S3_ACCESS_KEY"),
    S3_SECRET_KEY: readEnv("S3_SECRET_KEY"),
    S3_REGION: readEnv("S3_REGION"),
    CDN_BASE_URL: readEnv("CDN_BASE_URL"),
    BETTER_AUTH_SECRET: readEnv("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: readEnv("BETTER_AUTH_URL"),
  });
}

// lib/email — Resend adapter. Kept out of `schema`/`getEnv()` above: email
// sending has no dependency on DATABASE_URL/BETTER_AUTH_SECRET, and coupling
// it to that schema meant getEmailService() failed anywhere those unrelated
// vars weren't set (e.g. CI's `gates` job, which never provides them).
const emailSchema = z.object({
  // Optional: no key means email sending degrades (logs, doesn't crash the
  // request) until the human provisions one.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
});

export type EmailEnv = z.infer<typeof emailSchema>;

export function getEmailEnv(): EmailEnv {
  return emailSchema.parse({
    RESEND_API_KEY: readEnv("RESEND_API_KEY"),
    RESEND_FROM_EMAIL: readEnv("RESEND_FROM_EMAIL"),
  });
}
