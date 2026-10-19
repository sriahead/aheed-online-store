import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import { createAiMeter, startOfUtcDay } from "@/lib/ai-meter";
import { WORKERS_AI_DAILY_ALLOWANCE_NEURONS } from "@/lib/ai-budget-message";
import {
  getVendorAiDailyBudget,
  sumPlatformMilliNeuronsSince,
  sumVendorMilliNeuronsSince,
} from "@/lib/repositories/ai-usage";

/**
 * Live verification for #1028 — requirements.md R41 (and R27 against a real database).
 *
 * WHY A SCRIPT AND NOT A TEST. `tests/ai-meter.test.ts` proves which branch the meter takes for a
 * given pair of sums. This proves the sums themselves: that the platform-wide aggregate really adds
 * every vendor's rows, and that a vendor well under its OWN budget is refused in Free mode once the
 * platform total crosses the shared allowance, and allowed in Paid mode.
 *
 * WHAT IT DOES. Picks two vendors. Inserts marked `AiUsageEvent` rows against the FIRST so the
 * platform total since 00:00 UTC reaches the allowance, then checks the SECOND (which must be under
 * its own budget) in both modes. Deletes every row it inserted, in a `finally`, and confirms none is
 * left. The inserted rows are visible to dev's real AI features for the seconds the script runs.
 *
 * GUARDED. It writes, so it refuses to run against staging or production by comparing the target
 * endpoint with `secrets/staging.vars` and `secrets/production.vars` (lib/db-target-guard.ts).
 *
 *   npx tsx specs/2026-10-19-p1135-custom-notes-ai-allowance/verify-ai-plan-mode.ts
 */

const MARKER_MODEL = "verify-1135-plan-mode";
let failures = 0;

function readVar(path: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}: ${detail}`);
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
    process.exit(1);
  }
  console.log(`target endpoint: ${verdict.endpoint}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: targetUrl! }) });
  // The repository and meter type their client as the Worker's; the Node client has the same API.
  const db = prisma as never;

  try {
    const vendors = await prisma.vendor.findMany({ select: { id: true, slug: true }, take: 2 });
    if (vendors.length < 2) throw new Error("needs two vendors on this database");
    const since = startOfUtcDay(new Date());

    // The vendor under test must be under its own budget, or Free would refuse it as "vendor".
    const scored = await Promise.all(
      vendors.map(async (vendor) => ({
        ...vendor,
        used: (await sumVendorMilliNeuronsSince(db, vendor.id, since)) / 1000,
        budget: await getVendorAiDailyBudget(db, vendor.id),
      })),
    );
    const subject = scored.find((v) => v.used < v.budget);
    if (!subject) throw new Error("no vendor is under its own budget today; rerun after 00:00 UTC");
    const filler = scored.find((v) => v.id !== subject.id)!;
    console.log(
      `subject: ${subject.slug} (${subject.used} of ${subject.budget}); filler: ${filler.slug}`,
    );

    const before = await sumPlatformMilliNeuronsSince(db, since);
    const needed = Math.max(0, WORKERS_AI_DAILY_ALLOWANCE_NEURONS * 1000 - before) + 1000;
    await prisma.aiUsageEvent.create({
      data: {
        vendorId: filler.id,
        feature: "NET_CONTENT",
        model: MARKER_MODEL,
        milliNeurons: needed,
        neuronSource: "ESTIMATED",
      },
    });
    const after = await sumPlatformMilliNeuronsSince(db, since);
    check(
      "platform total sums every vendor",
      after === before + needed,
      `${before / 1000} -> ${after / 1000} neurons (inserted ${needed / 1000} against ${filler.slug})`,
    );

    const free = await createAiMeter(db, subject.id, "NET_CONTENT", "free").check();
    check(
      "Free refuses an under-budget vendor once the shared allowance is used",
      !free.allowed && free.scope === "platform" && free.budgetNeurons === 10_000,
      JSON.stringify(free),
    );

    const paid = await createAiMeter(db, subject.id, "NET_CONTENT", "paid").check();
    check(
      "Paid allows the same vendor (no shared cap)",
      paid.allowed && paid.scope === "vendor",
      JSON.stringify(paid),
    );
  } finally {
    const removed = await prisma.aiUsageEvent.deleteMany({ where: { model: MARKER_MODEL } });
    const left = await prisma.aiUsageEvent.count({ where: { model: MARKER_MODEL } });
    check("cleanup removed every marked row", left === 0, `deleted ${removed.count}, left ${left}`);
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
