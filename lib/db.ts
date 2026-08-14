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
