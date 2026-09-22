/**
 * Fails the build when the Pagefind search index is missing or empty (#871).
 *
 * WHY THIS EXISTS
 *
 * Nextra 4 loads its search index at RUNTIME as a dynamic import of
 * /_pagefind/pagefind.js (nextra/dist/client/components/search.js:13). Nothing
 * ever generated that file here, so every query on the deployed internal docs
 * site failed with `TypeError: Failed to fetch dynamically imported module`
 * — while `lint`, `typecheck`, `test`, `build`, `gates`, `deploy-docs-internal`
 * and `sdd:audit` all reported green. The feature was dead from the day the
 * site went live and no check anywhere had an opinion about it.
 *
 * A postbuild that merely RUNS pagefind would reproduce that class of failure:
 * pagefind exits 0 when it walks a directory containing no matching HTML, so a
 * wrong --site path produces an empty index and a silent, still-broken search
 * box. The only thing that makes this durable is asserting the OUTPUT.
 *
 * Deliberately dependency-free (plain .mjs, node: builtins only): this project
 * has no tsx and no test runner, and a guard that needs its own toolchain is a
 * guard that gets removed the first time it is inconvenient.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "_pagefind");
const ENTRY = join(OUT_DIR, "pagefind-entry.json");
const LOADER = join(OUT_DIR, "pagefind.js");

function fail(message) {
  console.error(`\nsearch index check FAILED — ${message}`);
  console.error(`  expected a Pagefind index at: ${OUT_DIR}`);
  console.error(`  this is the file Nextra fetches at runtime as /_pagefind/pagefind.js;`);
  console.error(`  without it the deployed search box throws on every query (#871).\n`);
  process.exit(1);
}

// The loader is what the browser actually imports. Its absence is the exact
// production symptom, so check it by the same name the client requests.
let loaderBytes = 0;
try {
  loaderBytes = readFileSync(LOADER).byteLength;
} catch {
  fail("pagefind.js was not produced");
}
if (loaderBytes === 0) fail("pagefind.js is empty");

let entry;
try {
  entry = JSON.parse(readFileSync(ENTRY, "utf8"));
} catch {
  fail("pagefind-entry.json is missing or not valid JSON");
}

// page_count is per language; sum rather than reading languages.en, so this
// keeps working if the corpus ever stops being English-only.
const languages = Object.values(entry.languages ?? {});
const pages = languages.reduce((total, lang) => total + (lang.page_count ?? 0), 0);

if (pages === 0) {
  fail("the index contains 0 pages — check the --site path points at built HTML");
}

console.log(
  `search index OK — ${pages} page(s) indexed across ${languages.length} language(s) ` +
    `by pagefind ${entry.version ?? "?"}`,
);
