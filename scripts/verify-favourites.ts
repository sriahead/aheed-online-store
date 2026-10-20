import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import {
  addFavourite,
  listFavouriteProductIds,
  removeFavourite,
  toggleFavourite,
} from "@/lib/repositories/favourites";

/**
 * Prove the favourites repository against a REAL database — `npx tsx scripts/verify-favourites.ts`.
 *
 * ## Why this exists rather than a unit test
 *
 * `#232`'s toggle swallows a duplicate-key error, treating it as success. CLAUDE.md records that
 * the two Prisma adapters report that same Postgres error under DIFFERENT `.code` values — raw
 * SQLSTATE `"23505"` through the HTTP client and Prisma's `P2002` through the WebSocket one — and
 * that any `error.code` check guarding a write must be verified against a real failing request,
 * because "a hand-built double only reproduces its author's guess". So this script provokes a real
 * duplicate insert and PRINTS the code it actually saw. A green run with the duplicate case skipped
 * is a failure, not a pass; that case is the only real evidence behind the guard.
 *
 * It is possible at all because every export in `lib/repositories/favourites.ts` takes its client,
 * `vendorId` and `userId` explicitly and reads no request context. That is the property
 * `tests/repository-purity.test.ts` enforces, and this is what it buys.
 *
 * ## Safety
 *
 * It WRITES, so it goes through `lib/db-target-guard.ts` exactly as
 * `scripts/remove-fixture-redemptions.ts` does: staging and production endpoints are refused by
 * comparing normalised Neon endpoints, so a pooled production URL cannot sail past a guard holding
 * only the direct one. Relevant beyond theory — a production `DIRECT_URL` has been found exported
 * into the session environment four times (see `docs/model-handoff.md`), so prefix this with
 * `env -u DIRECT_URL -u DATABASE_URL` to force it onto `.env`'s dev values.
 *
 * Every row it creates is removed in a `finally`, including on failure. It picks an EXISTING vendor,
 * user and product rather than creating any, so it leaves no fixtures behind for
 * `#797` to complain about.
 */

/** Read a connection string out of a gitignored secrets file without importing it. */
function readVar(path: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return undefined; // absent in CI; the guard treats that as "no constraint from this file"
  }
  for (const line of contents.split(/\r?\n/)) {
    // Tolerates BOTH `KEY="value"` and the spaced `KEY = value` form, because two
    // reference-database keys carry the spaced one (#505).
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const targetUrl = process.env.DIRECT_URL;

  const verdict = checkDestructiveTarget(targetUrl, [
    { label: "the STAGING database", url: readVar("secrets/staging.vars", "DIRECT_URL") },
    {
      label: "the STAGING database (pooled)",
      url: readVar("secrets/staging.vars", "DATABASE_URL"),
    },
    { label: "the PRODUCTION database", url: readVar("secrets/production.vars", "DIRECT_URL") },
    {
      label: "the PRODUCTION database (pooled)",
      url: readVar("secrets/production.vars", "DATABASE_URL"),
    },
  ]);

  if (!verdict.allowed) {
    console.error(`REFUSED: ${verdict.reason}`);
    console.error("This script writes, so it only ever runs against the dev Neon branch.");
    process.exit(1);
  }

  console.log(`Target endpoint: ${verdict.endpoint}`);

  const adapter = new PrismaNeon({ connectionString: targetUrl });
  const prisma = new PrismaClient({ adapter });

  // The repository's parameter types are the app's `getPrisma()` client. This is the plain Node
  // client; the two differ in how they were constructed, not in the model API these functions use.
  const db = prisma as unknown as Parameters<typeof addFavourite>[0];

  let vendorId: string | undefined;
  let userId: string | undefined;
  let productId: string | undefined;

  try {
    const vendor = await prisma.vendor.findFirst({ select: { id: true, slug: true } });
    const user = await prisma.user.findFirst({ select: { id: true, email: true } });
    if (!vendor || !user) {
      console.error("No vendor or user in this database — run the seed first.");
      process.exit(1);
    }
    const product = await prisma.product.findFirst({
      where: { vendorId: vendor.id },
      select: { id: true, name: true },
    });
    if (!product) {
      console.error(`Vendor ${vendor.slug} has no products — run the seed first.`);
      process.exit(1);
    }

    vendorId = vendor.id;
    userId = user.id;
    productId = product.id;
    console.log(`Using vendor ${vendor.slug}, user ${user.email}, product ${product.name}\n`);

    // Start from a known-clean state, in case a previous run died before its cleanup.
    await removeFavourite(db, vendorId, userId, productId);

    console.log("1. toggle on, twice (idempotence through the unique constraint)");
    const first = await toggleFavourite(db, vendorId, userId, productId);
    check('first toggle reports "added"', first === "added", `got "${first}"`);
    let count = await prisma.favourite.count({ where: { vendorId, userId, productId } });
    check("exactly one row after the first toggle", count === 1, `count=${count}`);

    // A second toggle FLIPS, so it is not the duplicate path — `addFavourite` directly is.
    await addFavourite(db, vendorId, userId, productId);
    count = await prisma.favourite.count({ where: { vendorId, userId, productId } });
    check(
      "addFavourite on an existing row leaves exactly one row and does not throw",
      count === 1,
      `count=${count}`,
    );

    console.log("\n2. the real duplicate-key error, and the code this adapter reports");
    let observedCode: unknown = "(none — NO ERROR WAS RAISED)";
    let accepted = false;
    try {
      // Deliberately bypasses `addFavourite`'s catch to see the raw error.
      await prisma.favourite.create({ data: { vendorId, userId, productId } });
    } catch (error) {
      observedCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code: unknown }).code
          : "(no .code property)";
      accepted = isUniqueViolation(error);
    }
    console.log(`  observed .code = ${JSON.stringify(observedCode)}`);
    check(
      "a duplicate insert raised an error whose code isUniqueViolation accepts",
      accepted,
      `code=${JSON.stringify(observedCode)}`,
    );

    console.log("\n3. the read path sees it");
    const ids = await listFavouriteProductIds(db, vendorId, userId);
    check("listFavouriteProductIds contains the product", ids.has(productId));

    console.log("\n4. toggle off");
    const second = await toggleFavourite(db, vendorId, userId, productId);
    check('second toggle reports "removed"', second === "removed", `got "${second}"`);
    count = await prisma.favourite.count({ where: { vendorId, userId, productId } });
    check("zero rows after toggling off", count === 0, `count=${count}`);

    // Removing something already gone is not an error — the same idempotence from the other side.
    await removeFavourite(db, vendorId, userId, productId);
    check("removeFavourite on a missing row does not throw", true);
  } finally {
    if (vendorId && userId && productId) {
      await removeFavourite(db, vendorId, userId, productId);
    }
    await prisma.$disconnect();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
