import { PrismaClient } from "@prisma/client/wasm";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { cache } from "react";
import { getEnv } from "./config";

/**
 * HTTP driver (fetch) for 99% of reads — prevents WebSocket exhaustion.
 * Does not support interactive transactions.
 */
export const getPrisma = cache(() => {
  const { DATABASE_URL } = getEnv();
  const adapter = new PrismaNeonHttp(DATABASE_URL, {});
  return new PrismaClient({ adapter });
});

/**
 * WebSocket driver strictly for interactive transactions (e.g. addToCart, checkout).
 * Kept separate so we only open a WebSocket when a transaction actually runs,
 * keeping concurrent connection counts well below Cloudflare's limits.
 */
export const getPrismaWs = cache(() => {
  const { DATABASE_URL } = getEnv();
  const adapter = new PrismaNeon({ connectionString: DATABASE_URL });
  return new PrismaClient({ adapter });
});

/**
 * Fresh HTTP client, deliberately NOT wrapped in `cache()` (#508).
 *
 * `getPrisma()`/`getPrismaWs()` rely on React's `cache()` to de-dupe within one request's
 * render scope — the mechanism that keeps this app off the cross-request-singleton bug this
 * file's own history already documents (`"Cannot perform I/O on behalf of a different request"`).
 * `instrumentation.ts`'s `onRequestError` is not a Server Component render, and whether it runs
 * inside a `cache()`-compatible scope under this app's Next/OpenNext/Workers stack is
 * unconfirmed. Rather than gamble on that, this constructs a plain, uncached client — correct in
 * any calling context, at the cost of one extra client per error (not a hot path).
 */
export function getPrismaUncached() {
  const { DATABASE_URL } = getEnv();
  const adapter = new PrismaNeonHttp(DATABASE_URL, {});
  return new PrismaClient({ adapter });
}
