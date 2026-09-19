import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import {
  createShoppingList,
  deleteShoppingList,
  findShoppingList,
  listShoppingLists,
  renameShoppingList,
} from "@/lib/repositories/shopping-lists";
import { eraseVendorData } from "@/lib/repositories/data-rights";
import { itemsToLines, linesToItems, MAX_SAVED_LISTS } from "@/lib/saved-list";
import { parseList } from "@/lib/shopping-list";

/**
 * Live verification for #116 — requirements.md R16, R18, R19, R43.
 *
 * WHY A SCRIPT AND NOT A TEST. Every requirement here is a claim about what real Postgres did.
 * The one that matters most cannot be tested with a double AT ALL: `createShoppingList` and
 * `renameShoppingList` take the WebSocket client because a nested create and an `updateMany`
 * crash unconditionally through the HTTP adapter (#382) — and a stub answers both happily, so
 * `tests/shopping-lists-repository.test.ts` passes either way. `--prove-http` below runs the same
 * two calls through `PrismaNeonHttp` on purpose and reports whether they really do fail, which is
 * CLAUDE.md's standing instruction: verify the adapter's behaviour against a real failing
 * request, because a hand-built double only reproduces its author's guess.
 *
 * This is possible at all because the repository layer takes its client, vendorId and userId as
 * explicit arguments and reads no request context — the same property that makes it unit-testable
 * makes it drivable from Node. Precedent: #696's `verify-cancel.ts`, #786's `verify-ledger.mjs`.
 *
 * GUARDED. It writes, so it refuses to run against staging or production by comparing Neon
 * ENDPOINTS, not file names (lib/db-target-guard.ts). It cleans up every row it creates,
 * including on failure.
 *
 *   npx tsx specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts
 *   npx tsx specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts --erase
 *   npx tsx specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts --fill-cap
 *   npx tsx specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts --prove-http
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
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

const TAG = "P116VERIFY";
let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}: ${detail}`);
  if (!ok) failures += 1;
}

const LIST_TEXT = `2x chicken breast
5kg basmati rice
milk`;

async function main() {
  const mode = process.argv.includes("--erase")
    ? "erase"
    : process.argv.includes("--fill-cap")
      ? "fill-cap"
      : process.argv.includes("--prove-http")
        ? "prove-http"
        : "once";

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
    process.exit(1);
  }
  console.log(`target endpoint: ${verdict.endpoint}\nmode: ${mode}\n`);

  // The WEBSOCKET adapter — what getPrismaWs() builds, and what create/rename require.
  const prismaWs = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });
  // The HTTP adapter — what getPrisma() builds. Used for the reads and the delete, and
  // deliberately misused by --prove-http.
  const prismaHttp = new PrismaClient({
    adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, {}),
  });

  let userId: string | null = null;
  let vendorId: string | null = null;

  try {
    const vendor = await prismaHttp.vendor.findFirst({ select: { id: true, slug: true } });
    if (!vendor) throw new Error("no vendor in this database — run the seed first");
    vendorId = vendor.id;

    const user = await prismaWs.user.create({
      data: {
        id: `${TAG}-u-${Date.now()}`,
        name: `${TAG} shopper`,
        email: `${TAG.toLowerCase()}-${Date.now()}@example.invalid`,
        emailVerified: true,
      },
      select: { id: true },
    });
    userId = user.id;

    const items = linesToItems(parseList(LIST_TEXT));
    if (items.length !== 3) throw new Error(`fixture parse produced ${items.length} items, want 3`);

    if (mode === "prove-http") {
      // R16/R18's whole reason for existing. If either of these SUCCEEDS, the WS requirement is
      // over-cautious and the spec should be revisited — so a success is reported as a failure of
      // this check, not quietly ignored.
      let createFailed = false;
      let renameFailed = false;
      let httpListId: string | null = null;
      try {
        httpListId = await createShoppingList(prismaHttp, vendor.id, user.id, "HTTP probe", items);
      } catch (error) {
        createFailed = true;
        console.log(`    create via HTTP threw: ${(error as Error).message.split("\n")[0]}`);
      }
      check(
        "R16 create genuinely requires the WS client",
        createFailed,
        createFailed ? "PrismaNeonHttp rejected the nested create, as #382 records" : "IT SUCCEEDED — re-examine the WS requirement", // prettier-ignore
      );

      if (httpListId) await deleteShoppingList(prismaHttp, vendor.id, user.id, httpListId);

      const seeded = await createShoppingList(prismaWs, vendor.id, user.id, "Probe", items);
      try {
        await renameShoppingList(prismaHttp, vendor.id, user.id, seeded!, "Renamed via HTTP");
      } catch (error) {
        renameFailed = true;
        console.log(`    rename via HTTP threw: ${(error as Error).message.split("\n")[0]}`);
      }
      check(
        "R18 rename genuinely requires the WS client",
        renameFailed,
        renameFailed ? "PrismaNeonHttp rejected the scoped updateMany" : "IT SUCCEEDED — re-examine the WS requirement", // prettier-ignore
      );
      if (seeded) await deleteShoppingList(prismaHttp, vendor.id, user.id, seeded);
    } else if (mode === "fill-cap") {
      for (let i = 0; i < MAX_SAVED_LISTS; i += 1) {
        await createShoppingList(prismaWs, vendor.id, user.id, `Filler ${i + 1}`, items);
      }
      const refused = await createShoppingList(prismaWs, vendor.id, user.id, "One too many", items);
      check(
        "R17 the cap refuses the next save",
        refused === null,
        `at ${MAX_SAVED_LISTS} lists the next create returned ${refused === null ? "null" : refused}`,
      );
      console.log(`\nleaving ${MAX_SAVED_LISTS} lists in place for user ${user.id}`);
      console.log("sign in as that user to exercise R29a, then re-run without --fill-cap to clean");
      // Deliberately skips teardown of the lists so the live-worker R29a row can use them; the
      // user row is still cleaned up below, which cascades them away.
    } else if (mode === "erase") {
      await createShoppingList(prismaWs, vendor.id, user.id, "To be erased", items);
      const result = await eraseVendorData(prismaWs, vendor.id, user.id);
      const remaining = await prismaHttp.shoppingListItem.count({
        where: { list: { vendorId: vendor.id, userId: user.id } },
      });
      check(
        "R43 erasure removes saved lists and cascades their items",
        result.savedListsDeleted === 1 && remaining === 0,
        `lists deleted: ${result.savedListsDeleted} items remaining: ${remaining}`,
      );
      // eraseVendorData may have deleted the User itself (last vendor); don't double-delete.
      const stillThere = await prismaHttp.user.findUnique({ where: { id: user.id } });
      if (!stillThere) userId = null;
    } else {
      // --- R16: create through the WS client ------------------------------------
      const listId = await createShoppingList(prismaWs, vendor.id, user.id, "Weekly shop", items);
      check(
        "R16 create writes the list and its items",
        listId !== null,
        listId ? `created list ${listId} with ${items.length} items` : "create returned null",
      );

      // --- the round trip that the whole design rests on ------------------------
      const detail = await findShoppingList(prismaHttp, vendor.id, user.id, listId!);
      const restored = itemsToLines(detail!.items);
      check(
        "R15 the saved list reads back in position order",
        restored.map((l) => l.original).join("|") ===
          parseList(LIST_TEXT)
            .map((l) => l.original)
            .join("|"),
        restored.map((l) => l.original).join(" / "),
      );

      const summaries = await listShoppingLists(prismaHttp, vendor.id, user.id);
      check(
        "R14 the index reports an honest item count",
        summaries.length === 1 && summaries[0].itemCount === 3,
        `${summaries.length} list(s), first has ${summaries[0]?.itemCount} items`,
      );

      // --- R18: rename is scoped, through the WS client -------------------------
      const own = await renameShoppingList(prismaWs, vendor.id, user.id, listId!, "Renamed");
      const otherUser = await renameShoppingList(prismaWs, vendor.id, `${user.id}-nope`, listId!, "Stolen"); // prettier-ignore
      const otherVendor = await renameShoppingList(prismaWs, `${vendor.id}-nope`, user.id, listId!, "Stolen"); // prettier-ignore
      check(
        "R18 rename is scoped to the owner",
        own && !otherUser && !otherVendor,
        `rename scoped: own=${own} other-user=${otherUser} other-vendor=${otherVendor}`,
      );

      // --- R19: delete cascades, and repeats harmlessly -------------------------
      const deleted = await deleteShoppingList(prismaHttp, vendor.id, user.id, listId!);
      const remaining = await prismaHttp.shoppingListItem.count({ where: { listId: listId! } });
      const again = await deleteShoppingList(prismaHttp, vendor.id, user.id, listId!);
      check(
        "R19 delete removes the list and cascades its items",
        deleted && remaining === 0 && !again,
        `deleted=${deleted} items-remaining=${remaining}, second call deleted=${again}`,
      );
    }
  } finally {
    if (userId) {
      // ShoppingList cascades from User, so this clears every list the run created.
      if (vendorId) await prismaWs.shoppingList.deleteMany({ where: { userId } });
      await prismaWs.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prismaWs.$disconnect();
    await prismaHttp.$disconnect();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
