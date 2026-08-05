import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { getEnv } from "./config";

/**
 * Neon serverless driver + Prisma driver adapter — the ONLY DB path that works
 * on V8 isolates (no raw TCP). Lazy singleton so:
 *  - env is read in request scope (not at import), and
 *  - the client is reused across requests in the same isolate.
 *
 * VERSION CAVEATS (verify against your installed Prisma):
 *  - Prisma 6+: driver adapters are GA. Do NOT list `driverAdapters` in previewFeatures.
 *  - Prisma 5:  add `previewFeatures = ["driverAdapters"]` to the generator.
 *  - PrismaNeon signature varies by version: v6 accepts `new PrismaNeon(pool)`;
 *    some versions accept `new PrismaNeon({ connectionString })`. Adjust if you get a type error.
 *  - Local Node < 22 has no global WebSocket: `npm i -D ws` and set
 *    `neonConfig.webSocketConstructor = ws`. Node 22+ and Workers provide it natively.
 */
let _prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const { DATABASE_URL } = getEnv();
    const pool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaNeon(pool);
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}
