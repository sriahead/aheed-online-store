// R6: every MOVE/COMPRESS row's Verify phrase must appear in its Destination;
// every KEEP row's Heading must exist in the post-change CLAUDE.md;
// every DELETE row must carry a classification and a non-empty destination.
import { readFileSync, existsSync } from "node:fs";

const ledger = readFileSync(process.argv[2], "utf8").split("\n");
const cache = new Map();
const read = (p) => {
  if (!cache.has(p))
    cache.set(
      p,
      existsSync(p) ? readFileSync(p, "utf8").replace(/\*\*/g, "").replace(/\s+/g, " ") : null,
    );
  return cache.get(p);
};
const norm = (s) => s.replace(/\s+/g, " ").trim();

let ok = 0;
const fails = [];
const counts = {};

for (const line of ledger) {
  if (!/^\| L\d+ /.test(line)) continue;
  const c = line.split("|").map((x) => x.trim());
  const [, ref, , , , disp, dest, head, phrase] = c;
  counts[disp] = (counts[disp] || 0) + 1;

  if (disp === "DELETE") {
    if (!head || !dest) fails.push(`${ref} DELETE missing classification/destination`);
    else if (!["DUPLICATE", "NARRATIVE"].includes(head))
      fails.push(`${ref} DELETE classification '${head}' not DUPLICATE/NARRATIVE`);
    else ok++;
    continue;
  }
  if (disp === "KEEP") {
    const body = read("CLAUDE.md");
    const key = norm(head).replace(/[`*]/g, "").split("(")[0].trim();
    if (body && norm(body).replace(/[`*]/g, "").includes(key)) ok++;
    else fails.push(`${ref} KEEP heading not found in CLAUDE.md: "${key}"`);
    continue;
  }
  // MOVE / COMPRESS
  const body = read(dest);
  if (body === null) {
    fails.push(`${ref} destination missing: ${dest}`);
    continue;
  }
  const needle = norm(phrase).replace(/\\\|/g, "|");
  if (needle.length < 12) {
    fails.push(`${ref} phrase too short to prove anything: "${needle}"`);
    continue;
  }
  if (body.includes(needle)) ok++;
  else fails.push(`${ref} [${disp}] phrase NOT found in ${dest}: "${needle.slice(0, 70)}"`);
}

console.log("dispositions:", JSON.stringify(counts));
console.log("verified:", ok, "failed:", fails.length);
for (const f of fails.slice(0, 40)) console.log("  ✘", f);
if (fails.length > 40) console.log(`  ... and ${fails.length - 40} more`);
