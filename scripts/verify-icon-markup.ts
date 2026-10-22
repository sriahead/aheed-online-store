import { readFileSync } from "node:fs";
import { geometryOf, sameGeometry } from "./lib/svg-geometry";

/**
 * Inventory the `<svg>` elements in a server's rendered pages, or compare two inventories (#1223, R33 to
 * R35). It exists to prove that migrating from `lucide-react` to `Icon` changed no icon in the HTML:
 *
 * `npx tsx scripts/verify-icon-markup.ts --base <url> --path <path> [--path <path>...] [--sign-in <email>:<password>]`
 * `npx tsx scripts/verify-icon-markup.ts --compare <before.jsonl> <after.jsonl>`
 *
 * INVENTORY MODE fetches each page and prints ONE LINE OF JSON PER PATH on stdout: an array with one
 * element per `<svg>`: `{ geometry, width, height, className, ariaHidden }`.
 *
 * - `geometry` is the normalised shape list from `scripts/lib/svg-geometry.ts` joined by `;`, not a hash,
 *   because two Lucide releases round some coordinates differently (`10.747` and `10.8`) and a hash would
 *   call the same icon different. It is compared with a tolerance by `--compare`.
 * - `className` has every token starting `lucide` removed (that is lucide-react's own marker, which `Icon`
 *   does not emit) and the rest sorted, so a class list compares equal across the migration.
 *
 * Progress and errors go to stderr; stdout is machine-readable only. A path that does not answer 200 is
 * an error (exit 1): a redirect to a sign-in page must not be silently compared as if it were the page.
 *
 * `--sign-in` posts to Better Auth. Over plain local http it needs `x-forwarded-proto: http` (otherwise
 * `403 INVALID_ORIGIN`, `docs/developer-portal/local-dev-playbook.md`), so every request sends it when the
 * base is http. Use the `DEMO_ACCOUNT_PASSWORD` from `.dev.vars`; `.env` holds a different value.
 *
 * COMPARE MODE reads two files of that output and exits 0 when, for every line, the two arrays pair up
 * one to one on `(width, height, className, ariaHidden)` with geometry equal within tolerance.
 */

export interface SvgRecord {
  geometry: string;
  width: string | null;
  height: string | null;
  className: string;
  ariaHidden: string | null;
}

const SVG_RE = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/g;

function attributeOf(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/** Every `<svg>` in a page, as comparable records, in document order. */
export function inventory(html: string): SvgRecord[] {
  const records: SvgRecord[] = [];
  for (const match of html.matchAll(SVG_RE)) {
    const [, attributes, inner] = match;
    const className = (attributeOf(attributes, "class") ?? "")
      .split(/\s+/)
      .filter((token) => token && !token.startsWith("lucide"))
      .sort()
      .join(" ");
    records.push({
      geometry: geometryOf(inner).join(";"),
      width: attributeOf(attributes, "width"),
      height: attributeOf(attributes, "height"),
      className,
      ariaHidden: attributeOf(attributes, "aria-hidden"),
    });
  }
  return records;
}

const identity = (r: SvgRecord) => `${r.width}|${r.height}|${r.className}|${r.ariaHidden}`;

/** Pair two inventories one to one; returns the records left unpaired on each side. */
export function compareInventories(before: SvgRecord[], after: SvgRecord[]) {
  const unmatchedAfter = [...after];
  const onlyBefore: SvgRecord[] = [];
  for (const record of before) {
    const index = unmatchedAfter.findIndex(
      (candidate) =>
        identity(candidate) === identity(record) &&
        sameGeometry(record.geometry.split(";"), candidate.geometry.split(";")),
    );
    if (index === -1) onlyBefore.push(record);
    else unmatchedAfter.splice(index, 1);
  }
  return { onlyBefore, onlyAfter: unmatchedAfter };
}

function log(message: string) {
  console.error(message);
}

function argValues(flag: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  });
  return values;
}

async function signIn(base: URL, credentials: string): Promise<string> {
  const separator = credentials.indexOf(":"); // the password may itself contain ":"
  const email = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: base.origin,
  };
  if (base.protocol === "http:") headers["x-forwarded-proto"] = "http";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(new URL("/api/auth/sign-in/email", base), {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
      redirect: "manual",
    });
    if (response.status === 429) {
      log(`sign-in rate limited (429); waiting 30s before attempt ${attempt + 1}`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `sign-in failed: HTTP ${response.status}. A 403 is an origin problem (needs x-forwarded-proto over http); a 401 is the credential or the wrong password file.`,
      );
    }
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
    if (cookies.length === 0) throw new Error("sign-in returned 200 but set no cookie");
    log(`signed in as ${email}`);
    return cookies.join("; ");
  }
  throw new Error("sign-in kept returning 429");
}

async function inventoryMode(): Promise<number> {
  const baseArg = argValues("--base")[0];
  const paths = argValues("--path");
  if (!baseArg || paths.length === 0) {
    log("usage: --base <url> --path <path> [--path <path>...] [--sign-in <email>:<password>]");
    return 2;
  }
  const base = new URL(baseArg);
  const credentials = argValues("--sign-in")[0];
  const headers: Record<string, string> = {};
  if (base.protocol === "http:") headers["x-forwarded-proto"] = "http";
  if (credentials) headers.cookie = await signIn(base, credentials);

  let failed = false;
  for (const path of paths) {
    const response = await fetch(new URL(path, base), { headers, redirect: "manual" });
    if (response.status !== 200) {
      log(`${path}: HTTP ${response.status} (expected 200)`);
      failed = true;
      continue;
    }
    const records = inventory(await response.text());
    log(`${path}: ${records.length} svg element(s)`);
    console.log(JSON.stringify(records));
  }
  return failed ? 1 : 0;
}

function compareMode(): number {
  const index = process.argv.indexOf("--compare");
  const [beforePath, afterPath] = [process.argv[index + 1], process.argv[index + 2]];
  if (!beforePath || !afterPath) {
    log("usage: --compare <before.jsonl> <after.jsonl>");
    return 2;
  }
  const read = (path: string): SvgRecord[][] =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SvgRecord[]);
  const before = read(beforePath);
  const after = read(afterPath);
  if (before.length !== after.length) {
    log(`different number of pages: ${before.length} before, ${after.length} after`);
    return 1;
  }
  let differences = 0;
  before.forEach((page, pageIndex) => {
    const { onlyBefore, onlyAfter } = compareInventories(page, after[pageIndex]);
    for (const record of onlyBefore)
      log(
        `page ${pageIndex + 1}: only BEFORE: ${identity(record)} ${record.geometry.slice(0, 80)}`,
      );
    for (const record of onlyAfter)
      log(
        `page ${pageIndex + 1}: only AFTER:  ${identity(record)} ${record.geometry.slice(0, 80)}`,
      );
    differences += onlyBefore.length + onlyAfter.length;
  });
  log(differences === 0 ? `identical: ${before.length} page(s)` : `${differences} difference(s)`);
  return differences === 0 ? 0 : 1;
}

if (process.argv[1] && /verify-icon-markup/.test(process.argv[1])) {
  const run = process.argv.includes("--compare") ? Promise.resolve(compareMode()) : inventoryMode();
  run.then(
    (code) => process.exit(code),
    (error: unknown) => {
      log(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
