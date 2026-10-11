import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  ASSISTANT_MAX_CONVERSATIONS_PER_WINDOW,
  assistantReport,
  recordOutcome,
  startConversation,
} from "@/lib/repositories/assistant-conversations";

/**
 * #1014/#1015 validation harness — proves what
 * `specs/2026-10-11-p1015-1014-help-assistant/requirements.md` R6, R7, R8, R9 and R11 assert,
 * against REAL Postgres (R42).
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its own client from the bare `@prisma/client`
 * with `@prisma/adapter-neon`'s HTTP adapter — the same adapter `getPrisma()` uses at runtime, so a
 * write that only works over the websocket client would fail here too. Never `lib/db.ts`'s
 * `@prisma/client/wasm`, which Node cannot load.
 *
 * Usage: `npx tsx scripts/verify-assistant-conversations.ts`
 *
 * Writes fixtures to `.env`'s database, which must be DEV — compare it against `secrets/*.vars`
 * first. Every fixture carries this run's tag (in its IP or its question), and every row it created
 * is deleted before exit, including after a failed check. Needs two ACTIVE vendors.
 */

const RUN = `verify-${randomUUID().slice(0, 8)}`;
const DAY_MS = 24 * 60 * 60 * 1000;

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function httpClient(): Promise<PrismaClient> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env against secrets/*.vars");
  console.log(`  database host: ${new URL(url).hostname}`);
  const { PrismaNeonHttp } = await import("@prisma/adapter-neon");
  return new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
}

/** The repository is typed against lib/db's wasm client; the Node client is the same API. */
const asRepoDb = (prisma: PrismaClient) => prisma as never;

/** Runs `fn` with `Math.random` forced to `value`, restoring it afterwards. */
async function withRandom<T>(value: number, fn: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

async function main(): Promise<void> {
  const prisma = await httpClient();
  const db = asRepoDb(prisma);
  const ips = [`${RUN}-ip-1`, `${RUN}-ip-2`, `${RUN}-ip-3`, `${RUN}-ip-4`];
  const fixtureHashes = ips.map(sha256);
  const directHash = sha256(`${RUN}-direct`);

  try {
    const vendors = await prisma.vendor.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      take: 2,
    });
    if (vendors.length < 2) throw new Error("needs two ACTIVE vendors");
    const [a, b] = [vendors[0].id, vendors[1].id];

    // Keep the probabilistic sweep out of every call except R8's own.
    await withRandom(0.5, async () => {
      // R6 — hashed IP, no raw IP anywhere, opening question bounded at 200.
      const r6 = await startConversation(db, a, ips[0], "OTHER", "Q".repeat(300));
      const row = r6
        ? await prisma.assistantConversation.findUnique({ where: { id: r6.id } })
        : null;
      check(
        "R6 ipHash is the 64-char hex SHA-256 of the IP",
        !!row && /^[0-9a-f]{64}$/.test(row.ipHash) && row.ipHash === sha256(ips[0]),
      );
      check(
        "R6 no column holds the raw IP",
        !!row && !Object.values(row).some((value) => String(value) === ips[0]),
      );
      check("R6 openingQuestion stored at 200", row?.openingQuestion.length === 200);

      // R7 — twenty per vendor and hashed IP in the window; other IPs and vendors unaffected.
      for (let i = 1; i < ASSISTANT_MAX_CONVERSATIONS_PER_WINDOW; i++) {
        await startConversation(db, a, ips[0], "DELIVERY", "Delivery charges and minimums");
      }
      const before = await prisma.assistantConversation.count({
        where: { vendorId: a, ipHash: sha256(ips[0]) },
      });
      const refused = await startConversation(db, a, ips[0], "DELIVERY", "x");
      const after = await prisma.assistantConversation.count({
        where: { vendorId: a, ipHash: sha256(ips[0]) },
      });
      check("R7 the 21st call returns null", before === 20 && refused === null, `before=${before}`);
      check("R7 and writes no row", after === 20, `after=${after}`);
      check(
        "R7 a different IP is not limited",
        (await startConversation(db, a, ips[1], "DELIVERY", "x")) !== null,
      );
      check(
        "R7 a different vendor is not limited",
        (await startConversation(db, b, ips[0], "DELIVERY", "x")) !== null,
      );
    });

    // R8 — the sweep deletes rows older than 90 days only, and only when it fires.
    const aged = (days: number, question: string) =>
      prisma.assistantConversation.create({
        data: {
          vendorId: a,
          topic: "OTHER",
          openingQuestion: `${RUN} ${question}`,
          ipHash: directHash,
          createdAt: new Date(Date.now() - days * DAY_MS),
        },
        select: { id: true },
      });
    const old91 = await aged(91, "aged 91");
    const old89 = await aged(89, "aged 89");
    await withRandom(0.5, () => startConversation(db, a, ips[2], "OTHER", "x"));
    check(
      "R8 no sweep at random 0.5: the 91-day row survives",
      (await prisma.assistantConversation.count({ where: { id: old91.id } })) === 1,
    );
    await withRandom(0.005, () => startConversation(db, a, ips[2], "OTHER", "x"));
    check(
      "R8 sweep at random 0.005: the 91-day row is deleted",
      (await prisma.assistantConversation.count({ where: { id: old91.id } })) === 0,
    );
    check(
      "R8 and the 89-day row survives",
      (await prisma.assistantConversation.count({ where: { id: old89.id } })) === 1,
    );

    // R9 — outcome transitions, unknown ids and another vendor's id.
    await withRandom(0.5, async () => {
      const outcomeOf = async (id: string) =>
        (
          await prisma.assistantConversation.findUnique({
            where: { id },
            select: { outcome: true },
          })
        )?.outcome;
      const open = async () =>
        (await startConversation(db, a, ips[3], "DELIVERY", "Delivery charges and minimums"))!.id;

      const one = await open();
      check(
        "R9 ABANDONED → ANSWERED",
        (await recordOutcome(db, a, one, "ANSWERED")) === true &&
          (await outcomeOf(one)) === "ANSWERED",
      );
      check(
        "R9 ANSWERED → ABANDONED refused",
        (await recordOutcome(db, a, one, "ABANDONED")) === false &&
          (await outcomeOf(one)) === "ANSWERED",
      );
      check(
        "R9 ANSWERED → ANSWERED refused",
        (await recordOutcome(db, a, one, "ANSWERED")) === false &&
          (await outcomeOf(one)) === "ANSWERED",
      );
      check(
        "R9 ANSWERED → HANDED_OFF",
        (await recordOutcome(db, a, one, "HANDED_OFF")) === true &&
          (await outcomeOf(one)) === "HANDED_OFF",
      );
      check(
        "R9 HANDED_OFF → ANSWERED refused",
        (await recordOutcome(db, a, one, "ANSWERED")) === false &&
          (await outcomeOf(one)) === "HANDED_OFF",
      );
      check(
        "R9 HANDED_OFF → ABANDONED refused",
        (await recordOutcome(db, a, one, "ABANDONED")) === false &&
          (await outcomeOf(one)) === "HANDED_OFF",
      );

      const two = await open();
      check(
        "R9 ABANDONED → HANDED_OFF",
        (await recordOutcome(db, a, two, "HANDED_OFF")) === true &&
          (await outcomeOf(two)) === "HANDED_OFF",
      );

      check(
        "R9 an unknown id returns false",
        (await recordOutcome(db, a, randomUUID(), "ANSWERED")) === false,
      );

      const three = await open();
      let threw = false;
      let crossVendor: boolean | undefined;
      try {
        crossVendor = await recordOutcome(db, b, three, "HANDED_OFF");
      } catch {
        threw = true;
      }
      check(
        "R9 another vendor's id returns false, unchanged, no throw",
        !threw && crossVendor === false && (await outcomeOf(three)) === "ABANDONED",
      );
    });

    // R11 — the report counts only this vendor, only the 90-day window. Measured as a delta over a
    // baseline, so rows already in dev (or created above) cannot make it pass or fail.
    const now = new Date();
    const baseline = await assistantReport(db, a, now);
    const tagged = `${RUN} report question`;
    const fixture = (
      vendorId: string,
      outcome: "ANSWERED" | "HANDED_OFF" | "ABANDONED",
      days = 0,
    ) =>
      prisma.assistantConversation.create({
        data: {
          vendorId,
          topic: "STORE_QUESTION",
          openingQuestion: tagged,
          outcome,
          ipHash: directHash,
          createdAt: new Date(now.getTime() - days * DAY_MS - 1000),
        },
      });
    await fixture(a, "HANDED_OFF");
    await fixture(a, "HANDED_OFF");
    await fixture(a, "HANDED_OFF");
    await fixture(a, "ANSWERED");
    await fixture(a, "HANDED_OFF", 91); // outside the window
    await fixture(b, "HANDED_OFF");
    await fixture(b, "HANDED_OFF");
    const report = await assistantReport(db, a, now);
    const pair = (r: typeof report, outcome: string) =>
      r.byTopic.find((p) => p.topic === "STORE_QUESTION" && p.outcome === outcome)?.count ?? 0;
    check(
      "R11 total grew by exactly 4",
      report.total - baseline.total === 4,
      `${baseline.total} → ${report.total}`,
    );
    check(
      "R11 HANDED_OFF grew by 3 and ANSWERED by 1",
      report.byOutcome.HANDED_OFF - baseline.byOutcome.HANDED_OFF === 3 &&
        report.byOutcome.ANSWERED - baseline.byOutcome.ANSWERED === 1,
    );
    check(
      "R11 the (STORE_QUESTION, HANDED_OFF) pair grew by 3",
      pair(report, "HANDED_OFF") - pair(baseline, "HANDED_OFF") === 3,
    );
    check(
      "R11 the tagged question is listed with count 3 (not 5 or 6)",
      report.topHandedOff.some((row) => row.openingQuestion === tagged && row.count === 3),
      JSON.stringify(report.topHandedOff.find((row) => row.openingQuestion === tagged)),
    );
    check("R11 at most ten top questions", report.topHandedOff.length <= 10);
  } finally {
    // Every row this run created: by fixture IP hash, or by this run's direct-write hash.
    const removed = await prisma.assistantConversation.deleteMany({
      where: { ipHash: { in: [...fixtureHashes, directHash] } },
    });
    const left = await prisma.assistantConversation.count({
      where: { ipHash: { in: [...fixtureHashes, directHash] } },
    });
    console.log(`  cleanup: deleted ${removed.count} row(s), ${left} left behind`);
    if (left !== 0) failures += 1;
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
