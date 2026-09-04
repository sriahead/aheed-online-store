/**
 * Demonstrates that the AI normalisation pre-pass's decision logic is genuinely pure
 * (P2.6 slice 4, #567).
 *
 * Run it with no database, no Cloudflare request context and no CLOUDFLARE_* variables set:
 *
 *   npx tsx scripts/verify-list-normalisation.ts
 *
 * Everything that decides what a shopper gets — parsing the model's reply, validating its indices,
 * folding items back onto lines, and the pack-size rule — executes here in plain Node. That is the
 * point of the split: the model is the only part that needs the network, so every rule it feeds
 * can be reasoned about, replayed and argued with offline.
 *
 * Committed rather than scratch, matching scripts/verify-repository-injection.ts. It lives under
 * scripts/ deliberately: a scratch file at the repo root is inside `next build`'s tsconfig, so a
 * type error in it fails the whole OpenNext build rather than just itself.
 */
import {
  buildNormalisationPrompt,
  mergeNormalisedItems,
  parseNormalisationResponse,
} from "../lib/list-normalisation";
import { parseList, resolveLines, type ListCandidate } from "../lib/shopping-list";

/** Stands in for a vendor's catalogue. No database: these are the rows the matcher would fetch. */
const CATALOGUE: ListCandidate[] = [
  {
    id: "1",
    slug: "atta-1kg",
    name: "Chapati Atta 1kg",
    unitLabel: "each",
    basePrice: 199,
    stock: 8,
  },
  {
    id: "2",
    slug: "atta-5kg",
    name: "Chapati Atta 5kg",
    unitLabel: "each",
    basePrice: 799,
    stock: 4,
  },
  {
    id: "3",
    slug: "turmeric",
    name: "Ground Turmeric 100g",
    unitLabel: "each",
    basePrice: 149,
    stock: 6,
  },
  {
    id: "4",
    slug: "rice-5kg",
    name: "Basmati Rice 5kg",
    unitLabel: "each",
    basePrice: 999,
    stock: 3,
  },
];

// #567's own worked example.
const SHOPPER_TYPED = "2kg atta, 1 haldi, 3 tins chick peas, bhindi, 500g keema"
  .split(",")
  .map((s) => s.trim())
  .join("\n");

/** What the model would plausibly return. Hard-coded so this script needs no network. */
const MODEL_REPLY = `Here you go:
[
  {"index":0,"name":"chapati atta","quantity":1,"measure":"2kg","brand":null},
  {"index":1,"name":"turmeric","quantity":1,"measure":null,"brand":null},
  {"index":2,"name":"chick peas","quantity":3,"measure":null,"brand":null},
  {"index":3,"name":"okra","quantity":1,"measure":null,"brand":null},
  {"index":4,"name":"lamb mince","quantity":1,"measure":"500g","brand":null},
  {"index":99,"name":"INVENTED - out of range","quantity":1,"measure":null,"brand":null},
  {"index":0,"name":"INVENTED - duplicate index","quantity":1,"measure":null,"brand":null}
]`;

function main() {
  const parsed = parseList(SHOPPER_TYPED);
  console.log(`parsed ${parsed.length} lines from the shopper's text\n`);

  console.log("--- prompt (first 3 numbered lines) ---");
  console.log(
    buildNormalisationPrompt(parsed)
      .split("\n")
      .filter((l) => /^\d+\. /.test(l))
      .slice(0, 3)
      .join("\n"),
  );

  const items = parseNormalisationResponse(MODEL_REPLY, parsed.length);
  console.log(`\n--- parsed ${items.length} items from the model's reply ---`);
  console.log("(the reply contained 7; the out-of-range and duplicate-index entries were dropped)");
  if (items.some((i) => i.name.startsWith("INVENTED"))) {
    console.error("FAIL: an invalid item survived index validation");
    process.exit(1);
  }

  const merged = mergeNormalisedItems(parsed, items);
  const resolved = resolveLines(merged, CATALOGUE);

  console.log("\n--- resolution ---");
  for (const line of resolved) {
    const measure = line.measure ? ` [measure ${line.measure}]` : "";
    const detail =
      line.resolution.kind === "matched"
        ? line.resolution.product.name
        : line.resolution.kind === "ambiguous"
          ? `${line.resolution.candidates.length} choice(s)`
          : "-";
    console.log(`  "${line.original}"${measure} -> ${line.resolution.kind}: ${detail}`);
  }

  // The load-bearing assertion: "2kg atta" must NOT resolve to a 1kg or 5kg bag on its own.
  const atta = resolved[0];
  if (atta.resolution.kind !== "ambiguous") {
    console.error(`\nFAIL: "2kg atta" resolved to ${atta.resolution.kind}, expected ambiguous`);
    process.exit(1);
  }

  console.log("\nPASS — pure logic ran with no database, no request context and no AI credential.");
}

main();
