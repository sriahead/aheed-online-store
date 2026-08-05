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
  });
}
