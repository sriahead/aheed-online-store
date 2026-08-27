/**
 * Proves, against a real database, that the repository exports cleared by #409
 * slice 1 can be exercised from a plain Node script.
 *
 *   npx tsx scripts/verify-repository-injection.ts
 *
 * WHY THIS SCRIPT EXISTS RATHER THAN A UNIT TEST
 *
 * `tests/repository-client-injection.test.ts` proves the exports take a client.
 * It cannot prove the thing that actually matters — that injecting a Node-native
 * client makes them RUN — because that needs a database and a real Prisma
 * client, neither of which belongs in the unit suite.
 *
 * The property is not obvious and was wrong for two years while three separate
 * docstrings asserted it. `lib/db.ts` builds its client from
 * `@prisma/client/wasm`, mandatory on Workers, whose query compiler Node cannot
 * load; so an export that resolves its own client fails here with
 * `ERR_UNKNOWN_FILE_EXTENSION` no matter how it is called. Building the client
 * from the BARE `@prisma/client` specifier — exactly as `prisma/seed.ts` does,
 * because it too runs in real Node — is what makes these functions reachable.
 *
 * Read-only: every check below is a read. It touches whatever database `.env`
 * points at, so confirm that host against `secrets/staging.vars` and
 * `secrets/production.vars` first (CLAUDE.md — a "staging-sounding" file is not
 * evidence; only the host is).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { listCustomersForAdmin } from "@/lib/repositories/customers";
import { getCatalogueHealth, getLoyaltyLiability } from "@/lib/repositories/reports";
import { checkOrderLookupRateLimit } from "@/lib/repositories/order-lookup-rate-limit";
import { listCodes } from "@/lib/repositories/discounts";

let failures = 0;

async function check(label: string, fn: () => Promise<string>) {
  try {
    console.log(`PASS  ${label}\n        ${await fn()}`);
  } catch (error) {
    failures += 1;
    const e = error as Error & { code?: string };
    console.log(`FAIL  ${label}\n        ${e.name} (${e.code ?? "-"}): ${e.message.trim()}`);
  }
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL/DATABASE_URL is empty — check .env is present and loading.");
  }
  console.log("database:", connectionString.replace(/:[^:@/]+@/, ":****@").split("@")[1], "\n");

  // The client a Workers request would never build: bare specifier, real Node.
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

  const vendor = await prisma.vendor.findFirst({ select: { id: true } });
  if (!vendor) throw new Error("no Vendor rows — seed the database before running this.");
  console.log(`vendor under test: ${vendor.id}\n`);

  await check("customers.ts  listCustomersForAdmin(prisma, vendorId, opts)", async () => {
    const page = await listCustomersForAdmin(prisma as never, vendor.id, { take: 3, page: 0 });
    return `${page.items.length} customer row(s), hasMore=${page.hasMore}`;
  });

  await check("reports.ts  getCatalogueHealth(prisma, vendorId)", async () => {
    const h = await getCatalogueHealth(prisma as never, vendor.id);
    return JSON.stringify(h);
  });

  await check("reports.ts  getLoyaltyLiability(prisma, vendorId)", async () => {
    const l = await getLoyaltyLiability(prisma as never, vendor.id);
    return JSON.stringify(l);
  });

  await check("discounts.ts  listCodes(prisma, vendorId)", async () => {
    const codes = await listCodes(prisma as never, vendor.id);
    return `${codes.length} discount code(s)`;
  });

  // The security control this slice most wanted back under test. A read-only
  // probe: an under-threshold call returns allowed=true and writes one
  // OrderLookupAttempt row, which ages out of the 60s window on its own.
  await check(
    "order-lookup-rate-limit.ts  checkOrderLookupRateLimit(prisma, vendorId, ip)",
    async () => {
      const ip = `verify-${Date.now()}`; // unique, so a real caller's window is untouched
      const first = await checkOrderLookupRateLimit(prisma as never, vendor.id, ip);
      if (!first.allowed) throw new Error("first attempt in a fresh window was refused");
      let last = first;
      for (let i = 0; i < 5; i += 1) {
        last = await checkOrderLookupRateLimit(prisma as never, vendor.id, ip);
      }
      if (last.allowed) throw new Error("throttle never refused after 6 attempts in one window");
      return "allowed on attempt 1, refused past the 5-per-minute threshold";
    },
  );
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
    process.exitCode = failures === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error("\nscript crashed:", error);
    process.exitCode = 1;
  });
