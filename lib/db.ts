import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getEnv } from "./config";

/**
 * Neon serverless driver + Prisma driver adapter — the ONLY DB path that works
 * on V8 isolates (no raw TCP). Lazy singleton so:
 *  - env is read in request scope (not at import), and
 *  - the client is reused across requests in the same isolate.
 *
 * @prisma/adapter-neon@6.19.3: PrismaNeon takes a neon.PoolConfig directly
 * (e.g. { connectionString }) and builds its own Pool internally — do not
 * construct a Pool yourself and pass it in.
 */
let _prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const { DATABASE_URL } = getEnv();
    const adapter = new PrismaNeon({ connectionString: DATABASE_URL });
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}
