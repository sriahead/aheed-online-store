/**
 * Live checks for P2.6 slice 1 (#564), against a real database.
 *
 *   npx tsx scripts/verify-search-slice.ts > /tmp/r.txt 2>&1
 *
 * Do NOT pipe this through `head` or anything else that closes the pipe early —
 * CLAUDE.md records a script being killed by SIGPIPE partway through and
 * leaving rows behind. Redirect to a file and read it.
 *
 * WHAT THIS PROVES AND WHAT IT DELIBERATELY DOES NOT.
 * `tests/search-repository.test.ts` is where the NEGATIVES are proven — that
 * the empty-query guard issues no query at all, and that every filter reaches
 * the composed `where`. A live query cannot demonstrate either: a result set
 * that happens to look right is consistent with a filter having been dropped.
 * What this file adds is the half a stub cannot fake — that the new predicate
 * finds a real product on a real catalogue, and that the OLD predicate does not
 * (R9), which is the only evidence that the defect this slice fixes was real.
 *
 * WHY IT CAN CALL REPOSITORY FUNCTIONS AT ALL.
 * `searchProducts` and `listProducts` take `prisma` and `vendorId` as explicit
 * parameters, so this script hands them a client built from the BARE
 * `@prisma/client` specifier, exactly as `prisma/seed.ts` does. A function that
 * resolved its own client through `lib/db` could not run here at all: that
 * builds from `@prisma/client/wasm`, whose query compiler real Node cannot load
 * (`ERR_UNKNOWN_FILE_EXTENSION`). That property is what #252 and #409/#411/#412
 * exist to protect, and this is another consumer of it.
 *
 * READ-ONLY. It creates nothing and deletes nothing, so unlike
 * `scripts/verify-repository-injection.ts` it does not refuse to run against a
 * deployed database — it prints the host instead, which is the figure any
 * result has to be read against.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { SEARCH_CANDIDATE_LIMIT, listProducts, searchProducts } from "@/lib/repositories/products";

let failures = 0;

async function check(label: string, fn: () => Promise<string>) {
  try {
    console.log(`PASS  ${label}\n        ${await fn()}`);
  } catch (error) {
    failures += 1;
    const e = error as Error;
    console.log(`FAIL  ${label}\n        ${e.name}: ${e.message.trim()}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Host only, lowercased, with Neon's `-pooler` suffix stripped. */
function normalizeHost(url: string): string | null {
  const match = /@([^:/?]+)/.exec(url);
  if (!match) return null;
  return match[1].toLowerCase().replace(/-pooler\./, ".");
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL/DATABASE_URL is empty — check .env is present and loading.");
  }
  console.log("database:", normalizeHost(connectionString) ?? "(unparseable)", "\n");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

  const aheed = await prisma.vendor.findFirst({
    where: { slug: "aheed-food-centre" },
    select: { id: true },
  });
  if (!aheed) throw new Error("Aheed vendor not found — seed the database first.");
  const other = await prisma.vendor.findFirst({
    where: { slug: { not: "aheed-food-centre" } },
    select: { id: true, slug: true },
  });

  const db = prisma as never;

  /* ---- R9: the defect this slice fixes was real -------------------------- */

  await check("R9a  multi-word, out-of-order query returns a real product", async () => {
    // "Basmati Rice 5kg" is a seeded product, so these terms appear in its name
    // in the OPPOSITE order to the one typed here.
    const page = await searchProducts(db, aheed.id, "rice basmati", { take: 12 });
    assert(page.items.length >= 1, `expected >= 1 item, got ${page.items.length}`);
    return `${page.items.length} item(s); first: ${page.items[0].name}`;
  });

  await check("R9b  the OLD single-contains predicate returns nothing for it", async () => {
    const rows = await prisma.product.findMany({
      where: {
        vendorId: aheed.id,
        isActive: true,
        OR: [
          { name: { contains: "rice basmati", mode: "insensitive" } },
          { description: { contains: "rice basmati", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    assert(rows.length === 0, `expected 0 rows from the old predicate, got ${rows.length}`);
    return "0 rows — the pre-change implementation could not find it";
  });

  /* ---- R7 / R8 extras: live confidence, not the proof --------------------- */

  await check("R7   empty query returns the three-field empty page", async () => {
    const page = await searchProducts(db, aheed.id, "   ", { take: 12 });
    assert(page.items.length === 0, "expected no items");
    assert(page.nextCursor === null, "expected null nextCursor");
    assert(page.truncated === false, "expected truncated false");
    return JSON.stringify(page);
  });

  await check("R8a  every returned product belongs to the vendor asked for", async () => {
    const page = await searchProducts(db, aheed.id, "rice", { take: 50 });
    const ids = page.items.map((p) => p.id);
    const foreign = await prisma.product.count({
      where: { id: { in: ids }, vendorId: { not: aheed.id } },
    });
    assert(foreign === 0, `${foreign} returned product(s) belong to another vendor`);
    return `${ids.length} item(s), 0 foreign${other ? ` (other vendor present: ${other.slug})` : ""}`;
  });

  await check("R8b  inStockOnly excludes out-of-stock products", async () => {
    const page = await searchProducts(db, aheed.id, "rice", { take: 50, inStockOnly: true });
    const outOfStock = page.items.filter((p) => !p.inStock);
    assert(
      outOfStock.length === 0,
      `${outOfStock.length} out-of-stock item(s) survived the filter`,
    );
    return `${page.items.length} item(s), all in stock`;
  });

  /* ---- R16: cursor handling against real data ---------------------------- */

  await check("R16  absent / non-numeric / negative cursors all yield page one", async () => {
    const first = await searchProducts(db, aheed.id, "rice", { take: 12 });
    const baseline = first.items.map((p) => p.id).join(",");

    for (const cursor of ["abc", "-5", ""]) {
      const page = await searchProducts(db, aheed.id, "rice", { take: 12, cursor });
      const ids = page.items.map((p) => p.id).join(",");
      assert(ids === baseline, `cursor ${JSON.stringify(cursor)} did not return page one`);
    }
    return `page one is stable across 4 cursor forms (${first.items.length} items)`;
  });

  await check("R16b out-of-range cursor returns an honest empty page", async () => {
    const first = await searchProducts(db, aheed.id, "rice", { take: 12 });
    const page = await searchProducts(db, aheed.id, "rice", { take: 12, cursor: "100000" });
    assert(page.items.length === 0, "expected no items");
    assert(page.nextCursor === null, "expected null nextCursor");
    assert(
      page.truncated === first.truncated,
      "truncated should carry the real value, not a fabricated false",
    );
    return `empty page, truncated=${page.truncated} (matches page one)`;
  });

  /* ---- R20: the keyset path is untouched --------------------------------- */

  await check("R20  listProducts still keyset-paginates without overlap", async () => {
    const first = await listProducts(db, aheed.id, { take: 2 });
    assert(first.nextCursor !== null, "expected a nextCursor from page one");
    const second = await listProducts(db, aheed.id, { take: 2, cursor: first.nextCursor! });

    const firstIds = new Set(first.items.map((p) => p.id));
    const overlap = second.items.filter((p) => firstIds.has(p.id));
    assert(overlap.length === 0, `${overlap.length} product(s) appeared on both pages`);
    assert(first.truncated === false, "listProducts must report truncated false");
    return `page1=[${[...firstIds].join(", ")}] page2=[${second.items.map((p) => p.id).join(", ")}]`;
  });

  /* ---- R19a optional: is the truncation notice even reachable here? ------- */

  await check("R19a is any query on this database broad enough to truncate?", async () => {
    // Several candidates, not one. A single term returning few matches says
    // nothing about whether the cap is reachable AT ALL, and that is the
    // question — the answer decides whether the optional live half of R19a can
    // be walked or has to be recorded as unreachable.
    const broad = ["chicken", "rice", "oil", "a", "e", "and", "the"];
    const counted: { term: string; matches: number }[] = [];

    for (const term of broad) {
      counted.push({
        term,
        matches: await prisma.product.count({
          where: {
            vendorId: aheed.id,
            isActive: true,
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { description: { contains: term, mode: "insensitive" } },
            ],
          },
        }),
      });
    }

    counted.sort((a, b) => b.matches - a.matches);
    const widest = counted[0];
    const page = await searchProducts(db, aheed.id, widest.term, { take: 12 });

    // NOT an assertion that truncated is true. If this catalogue cannot exceed
    // the cap, that is a fact to record — never a reason to lower the cap.
    const summary = counted.map((c) => `${c.term}=${c.matches}`).join(" ");
    return (
      `cap is ${SEARCH_CANDIDATE_LIMIT}; matches: ${summary}; ` +
      `widest "${widest.term}" gives truncated=${page.truncated} ` +
      (widest.matches > SEARCH_CANDIDATE_LIMIT
        ? "(notice IS reachable here)"
        : "(notice NOT reachable on this database — the component test is the binding proof)")
    );
  });

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  await prisma.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
