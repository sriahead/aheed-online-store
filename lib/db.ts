import { PrismaClient } from "@prisma/client/wasm";
import { PrismaNeon } from "@prisma/adapter-neon";
import { cache } from "react";
import { getEnv } from "./config";

/**
 * Neon serverless driver + Prisma driver adapter — the ONLY DB path that works
 * on V8 isolates (no raw TCP).
 *
 * Wrapped in React's `cache()` to create a PER-REQUEST singleton.
 * Cloudflare Workers forbids reusing I/O objects (streams, connections) across
 * different requests in the same isolate, which is why we cannot use a global
 * variable. However, creating a new PrismaClient on EVERY function call
 * exhausts Cloudflare's concurrent connection/subrequest limits during complex
 * page renders, leading to React Error 441 (Server Component render crash).
 * `cache()` perfectly scopes the instance to a single incoming request.
 *
 * @prisma/adapter-neon@6.19.3: PrismaNeon takes a neon.PoolConfig directly
 * (e.g. { connectionString }) and builds its own Pool internally.
 *
 * Import from "@prisma/client/wasm" to ensure the engine loads via import()
 * natively supported by workerd, bypassing Node's fs.readFileSync.
 */
export const getPrisma = cache(() => {
  const { DATABASE_URL } = getEnv();
  const adapter = new PrismaNeon({ connectionString: DATABASE_URL });
  return new PrismaClient({ adapter });
});
