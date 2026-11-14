import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { formatPrice } from "../components/product/format-price";
import type { getPrismaWs } from "../lib/db";
import {
  applyLine,
  createImportRun,
  ensureMasterData,
  loadImportStore,
  saveImportSettings,
  type ImportProduct,
  type ImportStore,
} from "../lib/repositories/stock-import";
import { normaliseFile, type NormalisedRow, type RowIssue } from "../lib/stock-import/normalise";
import {
  buildPlan,
  catalogueDuplicates,
  categoryName,
  countPlan,
  DECISIONS,
  type Decision,
  type PlanLine,
  type PlanLookups,
} from "../lib/stock-import/plan";
import type { CatalogueProduct } from "../lib/stock-import/match";
import type { MergeOptions } from "../lib/stock-import/merge";
import { loadPresets } from "../lib/stock-import/presets";
import { applyPresets, parseProfile, type StockImportProfile } from "../lib/stock-import/profile";
import { buildLookups } from "../lib/stock-import/run-lines";
import { settingsFromProfile } from "../lib/stock-import/settings";
import { readVar } from "./aheed-data-inventory";
import { readSourceGrid, readWorkbookSheets, writeWorkbook } from "./lib/read-spreadsheet";

/**
 * #1570 — Stock Data Import & Update Manager. Any store; the store's quirks live in its profile
 * (`scripts/stock-import/profiles/<vendor>.json`). Driven by the `stock-import` skill.
 *
 *   PLAN (read-only — writes the review sheet and a report, never the database):
 *   npx tsx scripts/stock-import.ts plan <file.xlsx> [<file2> …] --profile <profile.json> \
 *       --secrets <secrets file> --url-key <KEY> [--out <dir>] [--overwrite-edited] [--update-live-prices]
 *       [--previous-run <earlier run>/plan.json]
 *
 *   --previous-run (#1573): the till names an earlier run replaced, so a re-run can still keep till
 *   words the price list dropped (lib/stock-import/naming.ts). Pass it to apply as well.
 *
 *   DECIDE (record review decisions from JSON; see `decide` below):
 *   npx tsx scripts/stock-import.ts decide <decisions.json> --review <dir>/review.xlsx
 *
 *   APPLY (the reviewed sheet; the same source files, unchanged):
 *   npx tsx scripts/stock-import.ts apply <files…> --profile <p> --secrets <s> --url-key <KEY> \
 *       --review <dir>/review.xlsx --confirm-host <db host> [--production] [same flags as plan]
 *
 *   #1578 — the staff screen (/staff/products/import) runs the same apply code from the database:
 *
 *   SETTINGS-PUSH (a JSON profile becomes the store's import settings, as the screen edits them):
 *   npx tsx scripts/stock-import.ts settings-push --profile <p> --secrets <s> --url-key <KEY> \
 *       --confirm-host <db host>
 *
 *   TO-SCREEN (plan the files as a run on the screen; review-sheet SKIP lines with a note become
 *   held questions there; nothing is applied):
 *   npx tsx scripts/stock-import.ts to-screen <files…> --secrets <s> --url-key <KEY> \
 *       --review <dir>/review.xlsx --vendor <slug> --confirm-host <db host>
 *
 * NOTHING IT WRITES IS LIVE. A created product is hidden with stock UNKNOWN; a created category,
 * price tier, bundle or promotion is inactive; an existing product's `isActive`, `restriction` and
 * slug are never written; a live product's price changes only with --update-live-prices. The store
 * reviews and switches products on in /staff/products.
 *
 * CLIENT DATA STAYS OUT OF GIT: run folders go to `.import-reports/` (gitignored).
 */

interface Flags {
  command: string;
  files: string[];
  profile?: string;
  secrets?: string;
  urlKey?: string;
  out?: string;
  review?: string;
  confirmHost?: string;
  previousRun?: string;
  vendor?: string;
  production: boolean;
  options: MergeOptions;
}

function parseFlags(argv: string[]): Flags {
  const valued = new Set([
    "--profile",
    "--secrets",
    "--url-key",
    "--out",
    "--review",
    "--confirm-host",
    "--previous-run",
    "--vendor",
  ]);
  const files: string[] = [];
  const values: Record<string, string> = {};
  for (let i = 1; i < argv.length; i++) {
    if (valued.has(argv[i])) values[argv[i]] = argv[++i];
    else if (!argv[i].startsWith("--")) files.push(argv[i]);
  }
  return {
    command: argv[0] ?? "",
    files,
    profile: values["--profile"],
    secrets: values["--secrets"],
    urlKey: values["--url-key"],
    out: values["--out"],
    review: values["--review"],
    confirmHost: values["--confirm-host"],
    previousRun: values["--previous-run"],
    vendor: values["--vendor"],
    production: argv.includes("--production"),
    options: {
      overwriteEdited: argv.includes("--overwrite-edited"),
      updateLivePrices: argv.includes("--update-live-prices"),
    },
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** The profile as written (presets not merged), for `settings-push`. */
function readProfileFile(profilePath: string): StockImportProfile {
  return parseProfile(JSON.parse(readFileSync(profilePath, "utf8")));
}

/** #1573/#1578 — the profile with its presets (`lib/stock-import/presets/`) merged under it. */
function loadProfile(profilePath: string): StockImportProfile {
  const profile = readProfileFile(profilePath);
  return applyPresets(profile, loadPresets(profile.presets));
}

/** #1573 — product id → the till name an earlier run's plan replaced. */
function loadTillNames(path: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!path) return out;
  const earlier = JSON.parse(readFileSync(path, "utf8")) as {
    lines: { target: { id: string } | null; changes: { field: string; from: string }[] }[];
  };
  for (const line of earlier.lines) {
    const rename = line.changes?.find((c) => c.field === "name");
    if (line.target && rename?.from && !out.has(line.target.id))
      out.set(line.target.id, rename.from);
  }
  return out;
}

/** Everything a plan depends on besides the database, hashed into the Run sheet. */
function runInputs(f: Flags, profile: StockImportProfile): [string, string][] {
  const profilePath = f.profile as string;
  const out: [string, string][] = [["profile sha256", sha256(profilePath)]];
  for (const [name, preset] of profile.presets.map(
    (n, i) => [n, loadPresets(profile.presets)[i]] as const,
  ))
    out.push([
      `preset ${name}.json sha256`,
      createHash("sha256").update(JSON.stringify(preset)).digest("hex"),
    ]);
  if (f.previousRun) out.push(["previous run sha256", sha256(f.previousRun)]);
  for (const file of f.files) out.push([`source ${basename(file)} sha256`, sha256(file)]);
  return out;
}

const pounds = (p: number | null | undefined) => (p == null ? "" : formatPrice(p));

type Ws = ReturnType<typeof getPrismaWs>;
/** The CLI's Node client, typed as the runtime client the shared repository takes. */
const asWs = (p: PrismaClient) => p as unknown as Ws;

async function vendorIdFor(p: PrismaClient, vendorSlug: string): Promise<string> {
  const vendor = await p.vendor.findUnique({ where: { slug: vendorSlug }, select: { id: true } });
  if (!vendor) throw new Error(`vendor "${vendorSlug}" not found in this database`);
  return vendor.id;
}

async function loadStore(p: PrismaClient, vendorSlug: string): Promise<ImportStore> {
  return loadImportStore(asWs(p), await vendorIdFor(p, vendorSlug));
}

function lookupsFor(profile: StockImportProfile, store: ImportStore) {
  return buildLookups(profile, store.brands, store.categories);
}

function readRows(files: string[], profile: StockImportProfile, knownBrands: string[]) {
  const rows: NormalisedRow[] = [];
  const fileIssues: { file: string; issue: RowIssue }[] = [];
  for (const path of files) {
    const source = readSourceGrid(path);
    const result = normaliseFile(
      { fileName: basename(path), grid: source.grid, firstRowNumber: source.firstRowNumber },
      profile,
      knownBrands,
    );
    rows.push(...result.rows);
    for (const issue of result.fileIssues) fileIssues.push({ file: path, issue });
  }
  return { rows, fileIssues };
}

const REVIEW_HEADER = [
  "Key",
  "Decision",
  "Target product id",
  "Suggested",
  "Confidence",
  "Reason",
  "Source text",
  "Clean name",
  "Brand",
  "Category",
  "Size",
  "Price",
  "Matched product",
  "Matched PLU",
  "Matched price",
  "Matched live?",
  "Runner-up",
  "Also sold as",
  "Changes",
  "Kept",
  "Till words kept",
  "Issues",
];

function reviewRows(lines: PlanLine[], lookups: PlanLookups): (string | number)[][] {
  return lines.map((l) => [
    l.row.key,
    l.decision,
    l.target?.id ?? "",
    l.decision,
    l.confidence,
    l.reason,
    l.row.sourceText,
    l.row.displayName,
    l.row.brand ?? "",
    categoryName(l.row, lookups),
    l.row.sizeLabel ?? "",
    pounds(l.row.pricePence),
    l.target?.name ?? "",
    l.target?.plu ?? "",
    pounds(l.target?.basePrice),
    l.target ? (l.target.isActive ? "LIVE" : "hidden") : "",
    l.runnerUp ? `${l.runnerUp.name} [${l.runnerUp.id}]` : "",
    l.otherSizes.map((p) => p.name).join("; "),
    l.changes.map((c) => `${c.field}: ${c.from || "—"} → ${c.to}`).join("\n"),
    l.kept.map((k) => `${k.field} (${k.reason})`).join("; "),
    l.tillWords.join(", "),
    l.row.issues.map((i) => `${i.severity}: ${i.message}`).join("; "),
  ]);
}

function reportMarkdown(title: string, lines: PlanLine[], extra: string[]): string {
  const c = countPlan(lines);
  const out = [
    `# ${title}`,
    "",
    `Rows: ${c.rows} · update: ${c.update} · unchanged: ${c.unchanged} · create: ${c.create} · review: ${c.review} · skip: ${c.skip} · duplicate: ${c.duplicate} · warnings: ${c.warnings}`,
    "",
    ...extra,
    "",
    "| Key | Decision | Name | Price | Matched | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...lines.map(
      (l) =>
        `| ${l.row.key} | ${l.decision} | ${l.row.displayName} | ${pounds(l.row.pricePence)} | ${l.target ? `${l.target.name} (${l.target.plu ?? "no PLU"})` : ""} | ${l.reason.replace(/\|/g, "/")} |`,
    ),
  ];
  return out.join("\n") + "\n";
}

async function connect(f: Flags) {
  if (!f.secrets || !f.urlKey) throw new Error("--secrets and --url-key are required");
  const url = readVar(f.secrets, f.urlKey);
  if (!url) throw new Error(`${f.urlKey} not found in ${f.secrets}`);
  const host = new URL(url).hostname;
  return { client: new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) }), host };
}

function runDir(f: Flags, vendorSlug: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = f.out ?? join(".import-reports", "stock-import", `${vendorSlug}-${stamp}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function plan(f: Flags, profile: StockImportProfile) {
  const { client, host } = await connect(f);
  console.log(`database host: ${host} (read-only)`);
  try {
    const store = await loadStore(client, profile.vendorSlug);
    const knownBrands = store.brands.map((b) => b.name);
    const { rows, fileIssues } = readRows(f.files, profile, knownBrands);
    const lookups = lookupsFor(profile, store);
    const tillNames = loadTillNames(f.previousRun);
    const lines = buildPlan(
      rows,
      store.catalogue,
      profile,
      knownBrands,
      lookups,
      f.options,
      tillNames,
    );
    const dir = runDir(f, profile.vendorSlug);

    const extra = masterDataNotes(lines, lookups, store, profile);
    extra.push(...duplicateNotes(lines, store.catalogue, profile, knownBrands));
    const kept = lines.filter((l) => l.tillWords.length > 0);
    if (kept.length > 0) {
      extra.push("", `**Till words kept** (the list's name was shorter): ${kept.length} lines`);
      for (const l of kept)
        extra.push(`- ${l.row.key}: ${l.row.displayName} (kept: ${l.tillWords.join(", ")})`);
    }
    for (const fi of fileIssues) extra.push(`- **${fi.file}**: ${fi.issue.message}`);
    writeWorkbook(join(dir, "review.xlsx"), [
      {
        name: "Review",
        rows: [REVIEW_HEADER, ...reviewRows(lines, lookups)],
        widths: [
          24, 10, 38, 10, 10, 40, 34, 40, 10, 18, 8, 8, 40, 10, 10, 8, 40, 30, 50, 30, 20, 40,
        ],
      },
      {
        name: "Run",
        rows: [
          ["Key", "Value"],
          ["vendor", profile.vendorSlug],
          ["database host", host],
          ["planned at", new Date().toISOString()],
          ...runInputs(f, profile),
          ["decisions", DECISIONS.join(", ")],
          [
            "how to review",
            "Change Decision (UPDATE/CREATE/SKIP) and, for UPDATE, Target product id. REVIEW lines are skipped by apply.",
          ],
        ],
        widths: [30, 90],
      },
    ]);
    writeFileSync(join(dir, "plan-report.md"), reportMarkdown("Stock import — plan", lines, extra));
    writeFileSync(
      join(dir, "plan.json"),
      JSON.stringify({ host, counts: countPlan(lines), lines }, null, 1),
    );
    console.log(countPlan(lines));
    console.log(`review sheet: ${join(dir, "review.xlsx")}`);
  } finally {
    await client.$disconnect();
  }
}

/** #1573 — possible duplicates already in the catalogue, for the plan report. Never merged. */
function duplicateNotes(
  lines: PlanLine[],
  catalogue: CatalogueProduct[],
  profile: StockImportProfile,
  knownBrands: string[],
): string[] {
  const found = catalogueDuplicates(lines, catalogue, profile, knownBrands);
  if (found.length === 0) return [];
  return [
    "",
    `**Possible duplicates already in the catalogue** (same brand, words and size; check, never merged): ${found.length}`,
    ...found.map(
      (d) =>
        `- ${d.product.name} (${d.product.plu ?? "no PLU"}) ↔ ${d.others.map((o) => `${o.name} (${o.plu ?? "no PLU"})`).join("; ")}`,
    ),
  ];
}

function masterDataNotes(
  lines: PlanLine[],
  lookups: PlanLookups,
  store: ImportStore,
  profile: StockImportProfile,
): string[] {
  const used = lines.filter((l) => ["UPDATE", "CREATE", "REVIEW"].includes(l.decision));
  const newBrands = [
    ...new Set(
      used
        .map((l) => l.row.brand)
        .filter((b): b is string => !!b && !lookups.brandIds.has(b.toLowerCase())),
    ),
  ];
  const cats = [...new Set(used.map((l) => l.row.category.slug))];
  const newCats = cats.filter((s) => !lookups.categories.has(s));
  const offCats = store.categories
    .filter((c) => cats.includes(c.slug) && !c.isActive)
    .map((c) => c.name);
  const attrs = [...new Set(used.flatMap((l) => Object.keys(l.row.attributes)))];
  const notes = [
    `- Brands to create: ${newBrands.length ? newBrands.join(", ") : "none"}`,
    `- Categories to create (inactive): ${newCats.length ? newCats.join(", ") : "none"}`,
    `- Attributes used: ${attrs.length ? attrs.join(", ") : "none"} (missing ones and options are created)`,
  ];
  if (offCats.length)
    notes.push(
      `- **Categories switched off** (products in them stay invisible even when switched on): ${offCats.join(", ")}`,
    );
  if (profile.renameMatched)
    notes.push("- Matched products take the clean name (profile `renameMatched`).");
  return notes;
}

interface ReviewDecision {
  decision: Decision;
  targetId: string | null;
  note: string;
}

function readReview(
  path: string,
  inputs: [string, string][],
  files: string[],
): Map<string, ReviewDecision> {
  const sheets = readWorkbookSheets(path);
  const run = sheets.get("Run");
  const review = sheets.get("Review");
  if (!run || !review)
    throw new Error(`${path} is not a stock-import review sheet (needs Review and Run sheets)`);
  const meta = new Map(run.slice(1).map((r) => [r[0], r[1]]));
  for (const file of files) {
    const expected = meta.get(`source ${basename(file)} sha256`);
    if (!expected) throw new Error(`${basename(file)} was not part of the planned run`);
    if (expected !== sha256(file))
      throw new Error(`REFUSED: ${basename(file)} changed since the plan — plan again`);
  }
  // #1573 — the profile, each preset and the previous run, like the sources: any change means the
  // reviewed sheet no longer describes what apply would write.
  for (const [key, hash] of inputs) {
    if (key.startsWith("source ")) continue;
    if (meta.get(key) !== hash)
      throw new Error(`REFUSED: ${key.replace(" sha256", "")} changed since the plan — plan again`);
  }
  for (const key of meta.keys()) {
    if (/^(preset .*|previous run) sha256$/.test(key) && !inputs.some(([k]) => k === key))
      throw new Error(`REFUSED: the plan used ${key.replace(" sha256", "")}; pass the same inputs`);
  }
  const header = review[0];
  const at = (name: string) => header.indexOf(name);
  const out = new Map<string, ReviewDecision>();
  for (const r of review.slice(1)) {
    const key = r[at("Key")]?.trim();
    if (!key) continue;
    const decision = r[at("Decision")]?.trim().toUpperCase() as Decision;
    if (!DECISIONS.includes(decision))
      throw new Error(
        `${key}: decision "${r[at("Decision")]}" is not one of ${DECISIONS.join(", ")}`,
      );
    out.set(key, {
      decision,
      targetId: r[at("Target product id")]?.trim() || null,
      note: at("Review note") >= 0 ? (r[at("Review note")]?.trim() ?? "") : "",
    });
  }
  return out;
}

/**
 * DECIDE — record a reviewer's decisions on the review sheet from a JSON file instead of editing the
 * workbook by hand: `{ "<key>": { "decision": "UPDATE", "plu": "3422", "note": "methi = fenugreek" } }`
 * (`targetId` instead of `plu` also works). The Run sheet is kept, so apply's checks still hold.
 */
function decide(f: Flags, decisionsPath: string) {
  if (!f.review) throw new Error("decide needs --review <review.xlsx>");
  const sheets = readWorkbookSheets(f.review);
  const review = sheets.get("Review");
  const run = sheets.get("Run");
  if (!review || !run) throw new Error(`${f.review} is not a stock-import review sheet`);
  const plan = JSON.parse(readFileSync(join(f.review, "..", "plan.json"), "utf8")) as {
    lines: PlanLine[];
  };
  const byPlu = new Map<string, string>();
  for (const l of plan.lines)
    for (const c of [l.target, l.runnerUp, ...l.otherSizes]) if (c?.plu) byPlu.set(c.plu, c.id);
  const wanted = JSON.parse(readFileSync(decisionsPath, "utf8")) as Record<
    string,
    { decision: Decision; plu?: string; targetId?: string; note?: string }
  >;
  const header = [...review[0]];
  if (!header.includes("Review note")) header.push("Review note");
  const at = (name: string) => header.indexOf(name);
  const rows = review.slice(1).map((r) => {
    const out = [...r];
    while (out.length < header.length) out.push("");
    return out;
  });
  const unknown = Object.keys(wanted).filter((k) => !rows.some((r) => r[at("Key")] === k));
  if (unknown.length) throw new Error(`not on the review sheet: ${unknown.join(", ")}`);
  for (const r of rows) {
    const d = wanted[r[at("Key")]];
    if (!d) continue;
    if (!DECISIONS.includes(d.decision))
      throw new Error(`${r[at("Key")]}: bad decision ${d.decision}`);
    const targetId = d.targetId ?? (d.plu ? byPlu.get(d.plu) : undefined);
    if (d.decision === "UPDATE" && !targetId) {
      throw new Error(
        `${r[at("Key")]}: UPDATE needs a plu or targetId the plan saw (got ${d.plu ?? "none"})`,
      );
    }
    r[at("Decision")] = d.decision;
    r[at("Target product id")] = d.decision === "UPDATE" ? (targetId as string) : "";
    r[at("Review note")] = d.note ?? "";
  }
  writeWorkbook(f.review, [
    { name: "Review", rows: [header, ...rows] },
    { name: "Run", rows: run },
  ]);
  console.log(`recorded ${Object.keys(wanted).length} decisions in ${f.review}`);
}

interface ApplyOutcome {
  key: string;
  action: "created" | "updated" | "unchanged" | "skipped" | "failed";
  productId: string | null;
  name: string;
  detail: string;
}

async function apply(f: Flags, profile: StockImportProfile) {
  if (!f.review) throw new Error("apply needs --review <review.xlsx>");
  const { client: p, host } = await connect(f);
  console.log(`database host: ${host}`);
  if (f.confirmHost !== host)
    throw new Error(`apply needs --confirm-host ${host} (got ${f.confirmHost ?? "nothing"})`);
  if (/production/i.test(f.secrets ?? "") && !f.production) {
    throw new Error("REFUSED: a production secrets file also needs --production (staging first)");
  }
  const decisions = readReview(f.review, runInputs(f, profile), f.files);
  const batchId = `stock-import-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  const dir = runDir({ ...f, out: join(f.review, "..", `apply-${batchId}`) }, profile.vendorSlug);
  const outcomes: ApplyOutcome[] = [];
  const masterCreated: string[] = [];

  try {
    const store = await loadStore(p, profile.vendorSlug);
    const { vendorId } = store;
    const knownBrands = store.brands.map((b) => b.name);
    const { rows } = readRows(f.files, profile, knownBrands);
    const lookups = lookupsFor(profile, store);
    const tillNames = loadTillNames(f.previousRun);
    const fresh = buildPlan(
      rows,
      store.catalogue,
      profile,
      knownBrands,
      lookups,
      f.options,
      tillNames,
    );
    const byId = new Map(store.catalogue.map((c) => [c.id, c]));

    // The reviewed decision wins; a CREATE whose product now exists by that exact name (a re-run)
    // becomes an UPDATE of it, so running the same sheet twice creates nothing twice (R13).
    const work: {
      line: PlanLine;
      decision: Decision;
      target: CatalogueProduct | null;
      note: string;
    }[] = [];
    for (const line of fresh) {
      const reviewed = decisions.get(line.row.key);
      if (!reviewed) throw new Error(`${line.row.key} is not on the review sheet — plan again`);
      let decision = reviewed.decision;
      let target = reviewed.targetId ? (byId.get(reviewed.targetId) ?? null) : null;
      if (decision === "UPDATE" && !target)
        throw new Error(`${line.row.key}: UPDATE needs a Target product id that exists`);
      if (decision === "CREATE") {
        const existing = store.catalogue.find((c) => c.name === line.row.displayName);
        if (existing) {
          decision = "UPDATE";
          target = existing;
        }
      }
      work.push({ line, decision, target, note: reviewed.note });
    }
    const writing = work.filter((w) => w.decision === "UPDATE" || w.decision === "CREATE");

    // Master data first, reused before created (R9) — the shared code the staff screen uses (#1578).
    const master = await ensureMasterData(
      asWs(p),
      vendorId,
      writing.map((w) => w.line.listRow),
      lookups,
    );
    masterCreated.push(...master.created);
    const ctx = {
      batchId,
      profile,
      knownBrands,
      lookups,
      attributeIds: master.attributeIds,
      options: f.options,
      tillNames,
      slugs: new Set(store.catalogue.map((c) => c.slug)),
    };

    for (const w of work) {
      const { line } = w;
      if (w.decision !== "UPDATE" && w.decision !== "CREATE") {
        outcomes.push({
          key: line.row.key,
          action: "skipped",
          productId: null,
          name: line.listRow.displayName,
          detail:
            w.decision === "REVIEW"
              ? "undecided (REVIEW)"
              : `${w.decision}: ${w.note || line.reason}`,
        });
        continue;
      }
      try {
        // #1573 — applyLine adds the target's till words to an UPDATE itself.
        const outcome = await applyLine(asWs(p), vendorId, ctx, {
          row: line.listRow,
          decision: w.decision,
          target: w.target as ImportProduct | null,
          note: w.note,
        });
        if (outcome.action === "created")
          store.catalogue.push({ id: outcome.productId, name: outcome.name } as ImportProduct);
        outcomes.push({
          key: line.row.key,
          action: outcome.action,
          productId: outcome.productId,
          name: outcome.name,
          detail: outcome.detail,
        });
      } catch (e) {
        outcomes.push({
          key: line.row.key,
          action: "failed",
          productId: null,
          name: line.listRow.displayName,
          detail: e instanceof Error ? e.message.split("\n").slice(-1)[0] : String(e),
        });
      }
    }

    const verify = await readBack(p, vendorId, outcomes, store);
    const md = applyMarkdown(host, batchId, outcomes, masterCreated, verify, work);
    writeFileSync(join(dir, "apply-report.md"), md);
    writeFileSync(
      join(dir, "apply.json"),
      JSON.stringify({ host, batchId, masterCreated, outcomes, verify }, null, 1),
    );
    console.log(md.split("\n").slice(0, 12).join("\n"));
    console.log(`report: ${join(dir, "apply-report.md")}`);
  } finally {
    await p.$disconnect();
  }
}

interface Verification {
  checked: number;
  createdHidden: number;
  createdNotHidden: string[];
  createdWithoutUnknownStock: string[];
  withoutImage: number;
  liveTouched: string[];
}

async function readBack(
  p: PrismaClient,
  vendorId: string,
  outcomes: ApplyOutcome[],
  store: ImportStore,
): Promise<Verification> {
  const ids = outcomes
    .filter((o) => o.productId && o.action !== "skipped")
    .map((o) => o.productId as string);
  const rows = await p.product.findMany({
    where: { vendorId, id: { in: ids } },
    select: {
      id: true,
      name: true,
      isActive: true,
      inventory: { select: { stockMode: true } },
      _count: { select: { images: true } },
    },
  });
  const created = new Set(outcomes.filter((o) => o.action === "created").map((o) => o.productId));
  const wasLive = new Set(store.catalogue.filter((c) => c.isActive).map((c) => c.id));
  return {
    checked: rows.length,
    createdHidden: rows.filter((r) => created.has(r.id) && !r.isActive).length,
    createdNotHidden: rows.filter((r) => created.has(r.id) && r.isActive).map((r) => r.name),
    createdWithoutUnknownStock: rows
      .filter((r) => created.has(r.id) && r.inventory?.stockMode !== "UNKNOWN")
      .map((r) => r.name),
    withoutImage: rows.filter((r) => r._count.images === 0).length,
    liveTouched: rows.filter((r) => wasLive.has(r.id)).map((r) => r.name),
  };
}

function applyMarkdown(
  host: string,
  batchId: string,
  outcomes: ApplyOutcome[],
  master: string[],
  v: Verification,
  work: { line: PlanLine; decision: Decision }[],
): string {
  const count = (a: ApplyOutcome["action"]) => outcomes.filter((o) => o.action === a).length;
  const dup = work.filter((w) => w.decision === "DUPLICATE").length;
  return [
    "# Stock import — apply",
    "",
    `Database: ${host} · batch \`${batchId}\``,
    "",
    `Created: ${count("created")} · updated: ${count("updated")} · unchanged: ${count("unchanged")} · skipped: ${count("skipped")} (duplicates ${dup}) · failed: ${count("failed")}`,
    "",
    `Master data created: ${master.length ? master.join(", ") : "none"}`,
    "",
    "## Read-back",
    "",
    `- Products re-read: ${v.checked}; created and hidden: ${v.createdHidden}`,
    `- Created but NOT hidden: ${v.createdNotHidden.length ? v.createdNotHidden.join(", ") : "none"}`,
    `- Created without stock UNKNOWN: ${v.createdWithoutUnknownStock.length ? v.createdWithoutUnknownStock.join(", ") : "none"}`,
    `- Live products changed: ${v.liveTouched.length ? v.liveTouched.join(", ") : "none"}`,
    `- Still without an image: ${v.withoutImage}`,
    "",
    "| Key | Result | Name | Detail |",
    "| --- | --- | --- | --- |",
    ...outcomes.map(
      (o) => `| ${o.key} | ${o.action} | ${o.name} | ${o.detail.replace(/\|/g, "/")} |`,
    ),
    "",
  ].join("\n");
}

/** A write command's guard: the exact host, and --production for a production secrets file. */
async function connectForWrite(f: Flags) {
  const { client, host } = await connect(f);
  console.log(`database host: ${host}`);
  if (f.confirmHost !== host) {
    await client.$disconnect();
    throw new Error(`needs --confirm-host ${host} (got ${f.confirmHost ?? "nothing"})`);
  }
  if (/production/i.test(f.secrets ?? "") && !f.production) {
    await client.$disconnect();
    throw new Error("REFUSED: a production secrets file also needs --production (staging first)");
  }
  return client;
}

/** #1578 — a JSON profile becomes the store's import settings (what the staff screen edits). */
async function settingsPush(f: Flags) {
  if (!f.profile) throw new Error("settings-push needs --profile");
  const profile = readProfileFile(f.profile);
  const { settings, notCarried } = settingsFromProfile(profile);
  const p = await connectForWrite(f);
  try {
    const vendorId = await vendorIdFor(p, profile.vendorSlug);
    const saved = await saveImportSettings(asWs(p), vendorId, settings);
    if (!saved.ok) throw new Error(saved.error);
    console.log(
      `settings saved for ${profile.vendorSlug} (version ${saved.version.toISOString()})`,
    );
    if (notCarried.length)
      console.log(`NOT carried (move them into a preset): ${notCarried.join(", ")}`);
  } finally {
    await p.$disconnect();
  }
}

/**
 * #1578 — plan files as runs on the staff screen. A review-sheet line decided SKIP with a note
 * becomes a held question there, for the store to decide. Nothing is applied.
 */
async function toScreen(f: Flags) {
  if (!f.vendor) throw new Error("to-screen needs --vendor <slug>");
  const held = new Map<string, { decision: "HOLD"; question: string }>();
  if (f.review) {
    const review = readWorkbookSheets(f.review).get("Review");
    if (!review) throw new Error(`${f.review} has no Review sheet`);
    const at = (name: string) => review[0].indexOf(name);
    for (const r of review.slice(1)) {
      const note = at("Review note") >= 0 ? (r[at("Review note")] ?? "").trim() : "";
      if (r[at("Decision")]?.trim().toUpperCase() === "SKIP" && note)
        held.set(r[at("Key")].trim(), { decision: "HOLD", question: note });
    }
  }
  const p = await connectForWrite(f);
  try {
    const vendorId = await vendorIdFor(p, f.vendor);
    for (const file of f.files) {
      const source = readSourceGrid(file);
      const created = await createImportRun(asWs(p), vendorId, {
        fileName: basename(file),
        fileSha256: sha256(file),
        grid: source.grid,
        userId: null,
        decisions: held,
      });
      if (!created.ok) throw new Error(`${basename(file)}: ${created.error}`);
      console.log(`${basename(file)} → /staff/products/import/${created.runId}`);
    }
    console.log(`held questions carried: ${held.size}`);
  } finally {
    await p.$disconnect();
  }
}

async function main() {
  const f = parseFlags(process.argv.slice(2));
  if (f.command === "decide") {
    decide(f, f.files[0]);
    return;
  }
  if (f.command === "settings-push") return settingsPush(f);
  if (f.command === "to-screen") return toScreen(f);
  if (!["plan", "apply"].includes(f.command) || f.files.length === 0 || !f.profile) {
    throw new Error("usage: see the header of scripts/stock-import.ts");
  }
  const profile = loadProfile(f.profile);
  if (f.command === "plan") await plan(f, profile);
  else await apply(f, profile);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
