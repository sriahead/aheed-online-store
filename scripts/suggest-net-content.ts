/**
 * Ask an AI model to SUGGEST net content for products that have none (#900).
 *
 *   npx tsx scripts/suggest-net-content.ts --env-file .dev.vars --limit 5
 *   npx tsx scripts/suggest-net-content.ts --env-file .dev.vars --product <id> --include-attempted --limit 1
 *
 * Flags:
 *   --env-file <path>      REQUIRED. Which environment to read and write (.dev.vars, secrets/*.vars).
 *   --limit N              Products to attempt, 1-100. Default 10.
 *   --vendor <slug>        Only this vendor. Default: every vendor, one shared --limit.
 *   --product <id>         Only this product (still subject to every eligibility rule).
 *   --model <id>           Overrides NET_CONTENT_AI_MODEL and the default model.
 *   --neuron-budget N      Stop starting calls once this many neurons are spent. Default 5000,
 *                          half the account's shared 10,000/day free Workers AI allowance.
 *   --unpriced-ok          Allow a model missing from the rate table (then --limit is the only bound).
 *   --include-attempted    Re-attempt products whose earlier suggestions are all settled.
 *
 * WHAT IT WRITES: only NetContentSuggestion rows (PENDING or NO_ANSWER). It never creates, updates
 * or deletes a Product or ProductImage — a suggestion reaches a product only when staff accept or
 * edit it on /staff/net-content. That is the slice's whole safety property.
 *
 * WHY A SCRIPT, NOT A BUTTON OR A SCHEDULE: specs/architecture.md's AI rule — offline, bounded,
 * proposed never applied. Same shape as scripts/fill-product-images.ts: an explicit env file, the
 * database host printed first, and a bare-`@prisma/client` Node client passed into repository
 * functions (lib/db's WASM build cannot load in Node).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unparseable)";
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const envPath = flagValue("--env-file");
  if (!envPath) {
    fail(
      "usage: npx tsx scripts/suggest-net-content.ts --env-file <path> [--limit N] [--vendor <slug>]\n" +
        "       [--product <id>] [--model <id>] [--neuron-budget N] [--unpriced-ok] [--include-attempted]",
    );
  }

  const rawLimit = flagValue("--limit");
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    fail(`--limit must be a whole number from 1 to ${MAX_LIMIT} — got "${rawLimit}"`);
  }

  const rawBudget = flagValue("--neuron-budget");
  const {
    DEFAULT_NEURON_BUDGET,
    NET_CONTENT_MODEL_RATES,
  } = await import("@/lib/net-content-run");
  const neuronBudget = rawBudget === undefined ? DEFAULT_NEURON_BUDGET : Number(rawBudget);
  if (!Number.isFinite(neuronBudget) || neuronBudget <= 0) {
    fail(`--neuron-budget must be a positive number — got "${rawBudget}"`);
  }

  const vars = parseEnvFile(envPath);
  const directUrl = vars.DIRECT_URL ?? vars.DATABASE_URL;
  if (!directUrl) fail(`${envPath} defines neither DIRECT_URL nor DATABASE_URL`);

  // Before any lib/config reader runs: readEnv() falls back to process.env outside a Worker, and
  // this is what points storage, the AI credentials and NET_CONTENT_AI_MODEL at THIS environment.
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;

  // Printed before any query (R13).
  console.log(`env file: ${envPath}`);
  console.log(`database: ${hostOf(directUrl)}`);

  const { resolveNetContentModel, createWorkersAiNetContentSuggester } = await import(
    "@/lib/net-content-suggester"
  );
  const { getAiEnv } = await import("@/lib/config");
  const model = resolveNetContentModel(flagValue("--model"), getAiEnv().NET_CONTENT_AI_MODEL);
  const rate = NET_CONTENT_MODEL_RATES[model] ?? null;
  if (rate === null && !hasFlag("--unpriced-ok")) {
    fail(
      `model ${model} has no entry in the neuron rate table, so its spend cannot be budgeted.\n` +
        "Add its rates to NET_CONTENT_MODEL_RATES in lib/net-content-run.ts, or pass --unpriced-ok " +
        "to rely on --limit alone.",
    );
  }

  console.log(`model:    ${model}`);
  console.log(`limit:    ${limit}`);
  console.log(`budget:   ${neuronBudget} neurons`);
  console.log("");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });
  try {
    const { listEligibleProductsForNetContent, createNetContentSuggestion } = await import(
      "@/lib/repositories/net-content-suggestions"
    );
    const { runNetContentSuggestions } = await import("@/lib/net-content-run");
    const { getStorage } = await import("@/lib/storage");
    const storage = getStorage();

    const vendorSlug = flagValue("--vendor");
    const vendors = await prisma.vendor.findMany({
      where: vendorSlug ? { slug: vendorSlug } : {},
      select: { id: true, slug: true },
      orderBy: { slug: "asc" },
    });
    if (vendors.length === 0) fail(`no vendor matches ${vendorSlug ?? "(any)"}`);

    const suggester = createWorkersAiNetContentSuggester(model);
    let remaining = limit;
    const totals = {
      attempted: 0,
      pending: 0,
      noAnswer: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      neurons: 0,
      neuronsIncomplete: false,
      latencyWeighted: 0,
    };
    let stopReason: string | null = null;

    for (const vendor of vendors) {
      if (remaining === 0 || stopReason) break;
      const products = await listEligibleProductsForNetContent(
        prisma,
        vendor.id,
        { includeAttempted: hasFlag("--include-attempted"), productId: flagValue("--product") },
        remaining,
      );
      if (products.length === 0) continue;
      console.log(`${vendor.slug}: ${products.length} eligible product(s)`);

      const summary = await runNetContentSuggestions({
        products,
        suggester,
        neuronBudget: neuronBudget - totals.neurons,
        rate,
        log: (line) => console.log(line),
        async loadPhoto(image) {
          const [head, bytes] = await Promise.all([
            storage.headObject(image.storageKey),
            storage.getObject(image.storageKey),
          ]);
          if (!bytes) return null;
          return {
            bytes: new Uint8Array(bytes),
            contentType: head?.contentType ?? "image/webp",
          };
        },
        saveSuggestion: (input) => createNetContentSuggestion(prisma, vendor.id, input),
      });

      remaining -= summary.attempted;
      totals.attempted += summary.attempted;
      totals.pending += summary.pending;
      totals.noAnswer += summary.noAnswer;
      totals.failed += summary.failed;
      totals.inputTokens += summary.inputTokens;
      totals.outputTokens += summary.outputTokens;
      totals.neurons += summary.neurons;
      totals.neuronsIncomplete ||= summary.neuronsIncomplete;
      totals.latencyWeighted += (summary.meanLatencyMs ?? 0) * summary.attempted;

      if (summary.outcome === "not-configured") {
        fail("CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is missing from the env file; nothing written.");
      }
      if (summary.outcome !== "completed") stopReason = summary.outcome;
    }

    console.log("");
    console.log(`attempted:      ${totals.attempted}`);
    console.log(`pending:        ${totals.pending}`);
    console.log(`no answer:      ${totals.noAnswer}`);
    console.log(`failed:         ${totals.failed}`);
    console.log(`tokens in/out:  ${totals.inputTokens} / ${totals.outputTokens}`);
    console.log(
      `neurons (est.): ${totals.neurons.toFixed(1)}` +
        (totals.neuronsIncomplete ? " (incomplete: some calls reported no usage)" : ""),
    );
    console.log(
      `mean latency:   ${totals.attempted === 0 ? "n/a" : `${Math.round(totals.latencyWeighted / totals.attempted)} ms`}`,
    );
    if (stopReason) console.log(`stopped early:  ${stopReason}`);
    if (stopReason === "transport-errors") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
