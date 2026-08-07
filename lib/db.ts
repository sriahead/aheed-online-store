import { PrismaClient } from "@prisma/client/wasm";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getEnv } from "./config";

/**
 * Neon serverless driver + Prisma driver adapter — the ONLY DB path that works
 * on V8 isolates (no raw TCP).
 *
 * NOT a cross-request singleton: a fresh PrismaClient/PrismaNeon adapter is
 * constructed on every call. Cloudflare Workers forbids reusing I/O objects
 * (streams, connections) across different requests in the same isolate —
 * caching `_prisma` across requests threw "Cannot perform I/O on behalf of a
 * different request" on ~1-in-3 rapid sequential requests once actually
 * tested against the real Workers runtime (`npm run preview`), not `next dev`
 * (which can't even load @prisma/client/wasm, so never exercised this path
 * for real). This matches Neon's own recommended pattern for serverless/edge:
 * its HTTP-based driver is cheap to instantiate per call, not a persistent
 * connection worth preserving across requests.
 *
 * @prisma/adapter-neon@6.19.3: PrismaNeon takes a neon.PoolConfig directly
 * (e.g. { connectionString }) and builds its own Pool internally — do not
 * construct a Pool yourself and pass it in.
 *
 * Import from "@prisma/client/wasm", NOT the bare "@prisma/client" specifier.
 * Next.js's build-time file tracer runs in Node, so a bare specifier resolves
 * via the package's "node" export condition (index.js — loads its WASM via
 * fs.readFileSync) even though the code actually runs in workerd, where that
 * fails with "[unenv] fs.readFileSync is not implemented yet!". The explicit
 * "/wasm" entrypoint bypasses conditional-exports resolution and always
 * loads the engine via import(), which workerd supports natively.
 */
export function getPrisma(): PrismaClient {
  const { DATABASE_URL } = getEnv();
  const adapter = new PrismaNeon({ connectionString: DATABASE_URL });
  return new PrismaClient({ adapter });
}
