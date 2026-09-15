import { PrismaClient } from "@aheed/reference-client/wasm";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { cache } from "react";
import { getReferenceEnv } from "./config";

/**
 * The UK location-reference database client (#764).
 *
 * A SECOND Prisma client against a SECOND Neon project (`uk-location-reference`), entirely separate
 * from `lib/db.ts`'s client against Aheed's transactional database. The two share no schema, no
 * migrations and no connection.
 *
 * ## Why `/wasm` explicitly, and never the bare specifier
 *
 * `@aheed/reference-client` resolves through the generated package's export conditions,
 * and Next's build-time file tracer runs in **real Node** — so the bare specifier picks the `node`
 * condition (`index.js`, which loads its WASM through `fs.readFileSync`) even though this code
 * actually executes in workerd. It fails at runtime with `[unenv] fs.readFileSync is not
 * implemented yet!`. Naming `/wasm` sidesteps conditional-exports resolution entirely and always
 * gets the `import()`-based loader workerd supports. This is the identical trap `lib/db.ts` records
 * for `@prisma/client/wasm`; having a second generated client does not exempt it.
 *
 * `scripts/sync-reference-data.ts` runs in real Node and therefore does the opposite — it imports
 * the Node entry point, exactly as `prisma/seed.ts` uses the bare `@prisma/client`.
 *
 * ## HTTP adapter only
 *
 * Reference data is read-only at runtime: nothing in a request ever writes here, and there are no
 * interactive transactions to run. So this needs only the fetch-based `PrismaNeonHttp`, with none of
 * the WebSocket-exhaustion exposure `getPrismaWs` exists to contain. Bulk writes happen in the sync
 * script, on a Node runner, through its own client.
 *
 * Wrapped in React's `cache()` for the same reason `getPrisma()` is — per-request de-duplication,
 * never a cross-request singleton, which throws "Cannot perform I/O on behalf of a different
 * request" on Workers.
 */
export const getReferencePrisma = cache(() => {
  const { UK_LOCATION_REF_DATABASE_URL } = getReferenceEnv();
  if (!UK_LOCATION_REF_DATABASE_URL) {
    // Throwing here is correct and safe: the only caller is `lib/reference/`, which catches it and
    // reports UNVERIFIED. Returning a client pointed at nothing would defer the same failure to a
    // query, where it would be harder to attribute.
    throw new Error("UK_LOCATION_REF_DATABASE_URL is not configured");
  }
  const adapter = new PrismaNeonHttp(UK_LOCATION_REF_DATABASE_URL, {});
  return new PrismaClient({ adapter });
});

/**
 * Whether a reference database is configured at all.
 *
 * Deliberately a question the caller can ask WITHOUT triggering a throw. `getReferenceEnv()` throws
 * when the URL is absent, and the reference service must treat "not configured" as UNVERIFIED
 * rather than as a crash — an environment that has not been given a reference database yet should
 * degrade to manual address entry, not 500.
 *
 * This is the `readOptional` shape CLAUDE.md records for `getJobsEnv` (#618/#621): a config
 * accessor that throws makes a plain falsy check unreachable in every built Worker, because
 * `NODE_ENV` is unconditionally `"production"` there.
 */
export function isReferenceDatabaseConfigured(): boolean {
  try {
    return Boolean(getReferenceEnv().UK_LOCATION_REF_DATABASE_URL);
  } catch {
    return false;
  }
}
