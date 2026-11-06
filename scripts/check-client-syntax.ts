/**
 * Post-build guard (#1445): fails when any emitted client `.js` file contains syntax Safari / iOS
 * 15.4 cannot parse. Runs as `postbuild`, so `npm run build` and both deploy workflows (OpenNext
 * calls `npm run build`) stop before a chunk that would leave old iPhones with a dead page.
 *
 *   npx tsx scripts/check-client-syntax.ts [dir]   (default `.next/static`)
 *
 * Exits 1 on a finding, on a file that does not parse, and on a directory with no `.js` files, so
 * a wrong path cannot pass vacuously.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findUnsupportedSyntax } from "./lib/client-syntax";

function listJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listJs(path));
    else if (entry.endsWith(".js")) out.push(path);
  }
  return out;
}

function main(): number {
  const dir = process.argv[2] ?? ".next/static";
  let files: string[];
  try {
    files = listJs(dir);
  } catch (error) {
    console.error(`check-client-syntax: cannot read ${dir}: ${(error as Error).message}`);
    return 1;
  }
  if (files.length === 0) {
    console.error(`check-client-syntax: no .js files under ${dir}`);
    return 1;
  }

  let failures = 0;
  for (const file of files) {
    const name = relative(process.cwd(), file);
    try {
      for (const f of findUnsupportedSyntax(readFileSync(file, "utf8"))) {
        console.error(`${name}:${f.line}:${f.column} — ${f.construct}`);
        failures++;
      }
    } catch (error) {
      console.error(`${name} — does not parse: ${(error as Error).message}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(
      `check-client-syntax: ${failures} problem(s) in ${files.length} file(s). Safari / iOS 15.4 ` +
        `cannot parse this output; check package.json "browserslist" (#1445).`,
    );
    return 1;
  }
  console.log(`check-client-syntax: ${files.length} client file(s) parse on Safari / iOS 15.4.`);
  return 0;
}

process.exit(main());
