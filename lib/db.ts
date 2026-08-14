import { PrismaClient } from "@prisma/client/wasm";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { cache } from "react";
import { getEnv } from "./config";

/**
 * Neon serverless driver over HTTP + Prisma driver adapter — the ONLY DB path that works
 * reliably on V8 isolates under high concurrent load.
 *
 * Using `PrismaNeonHttp` uses `fetch` under the hood, completely bypassing Cloudflare's
 * WebSocket limits and the "Cannot perform I/O on behalf of a different request" error
 * which causes random 500 errors / Error 441s when web sockets are exhausted.
 *
 * Wrapped in React's `cache()` to create a PER-REQUEST singleton.
 */
export const getPrisma = cache(() => {
  const { DATABASE_URL } = getEnv();
  // We use PrismaNeonHttp which automatically uses fetch.
  // This bypasses the WebSocket Pool connection limits per Cloudflare isolate.
  const adapter = new PrismaNeonHttp(DATABASE_URL, {
    // Optional Neon HTTP settings, pass empty object as second param is required
  });
  return new PrismaClient({ adapter });
});
