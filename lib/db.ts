import { PrismaClient } from "@prisma/client/wasm";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { cache } from "react";
import { getEnv } from "./config";

// TEMP DIAGNOSTIC (#382) — remove before merging. `PrismaNeonHttpAdapter`
// (the class whose `startTransaction` unconditionally throws) is created
// internally by `PrismaNeonHttp.connect()` and never exported directly, so
// patch via the factory's `connect()` to reach its prototype exactly once —
// this catches the throw regardless of which PrismaClient/adapter instance is
// actually involved, since two rounds of instance-level patching (authDb()'s
// wrapped client, then getPrisma()'s own client's $transaction) both proved
// NOT to be where the crash originates.
{
  const factoryProto = PrismaNeonHttp.prototype as {
    connect: (...args: unknown[]) => Promise<{ startTransaction: (...a: unknown[]) => unknown }>;
  };
  const originalConnect = factoryProto.connect;
  let patched = false;
  factoryProto.connect = async function (this: unknown, ...args: unknown[]) {
    const adapter = await originalConnect.apply(this, args);
    if (!patched) {
      patched = true;
      const proto = Object.getPrototypeOf(adapter) as {
        startTransaction: (...a: unknown[]) => unknown;
      };
      const originalStartTransaction = proto.startTransaction;
      proto.startTransaction = function (this: unknown, ...a: unknown[]) {
        console.log("[382-diag-PROTO] PrismaNeonHttpAdapter.startTransaction CALLED!");
        console.log("[382-diag-PROTO] call stack:", new Error().stack);
        return originalStartTransaction.apply(this, a);
      };
    }
    return adapter;
  };
}

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
