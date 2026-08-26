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
  const client = new PrismaClient({ adapter });
  // TEMP DIAGNOSTIC (#382) — remove before merging. Logs every call to
  // $transaction on the raw HTTP-mode client, with a stack trace, before it
  // throws — to find which caller reaches the RAW (unwrapped) client.
  const originalTransaction = client.$transaction.bind(client);
  client.$transaction = (...args: unknown[]) => {
    console.log("[382-diag-RAW] $transaction CALLED on raw getPrisma() client!");
    console.log("[382-diag-RAW] call stack:", new Error().stack);
    // @ts-expect-error temporary diagnostic override
    return originalTransaction(...args);
  };
  return client;
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
