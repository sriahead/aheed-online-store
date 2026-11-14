import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { deriveUnitPricePenceForSort } from "../components/product/unit-price";
import { formatPrice } from "../components/product/format-price";
import { slugify } from "../lib/catalogue-form";
import { readLowStockDefault } from "../lib/repositories/vendor";
import type { CatalogueProduct } from "../lib/stock-import/match";
import { normaliseFile, type NormalisedRow, type RowIssue } from "../lib/stock-import/normalise";
import {
  buildPlan,
  categoryName,
  countPlan,
  DECISIONS,
  targetsFor,
  type Decision,
  type PlanLine,
  type PlanLookups,
} from "../lib/stock-import/plan";
import { computeChanges, unitLabelFor, type MergeOptions } from "../lib/stock-import/merge";
import { parseProfile, type StockImportProfile } from "../lib/stock-import/profile";
import { readVar } from "./aheed-data-inventory";
import { readSourceGrid, readWorkbookSheets, writeWorkbook } from "./lib/read-spreadsheet";

/**
 * #1570 — Stock Data Import & Update Manager. Any store; the store's quirks live in its profile
 * (`scripts/stock-import/profiles/<vendor>.json`). Driven by the `stock-import` skill.
 *
 *   PLAN (read-only — writes the review sheet and a report, never the database):
 *   npx tsx scripts/stock-import.ts plan <file.xlsx> [<file2> …] --profile <profile.json> \
 *       --secrets <secrets file> --url-key <KEY> [--out <dir>] [--overwrite-edited] [--update-live-prices]
 *
 *   DECIDE (record review decisions from JSON; see `decide` below):
 *   npx tsx scripts/stock-import.ts decide <decisions.json> --review <dir>/review.xlsx
 *
 *   APPLY (the reviewed sheet; the same source files, unchanged):
 *   npx tsx scripts/stock-import.ts apply <files…> --profile <p> --secrets <s> --url-key <KEY> \
 *       --review <dir>/review.xlsx --confirm-host <db host> [--production] [same flags as plan]
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

const pounds = (p: number | null | undefined) => (p == null ? "" : formatPrice(p));

interface Store {
  vendorId: string;
  catalogue: CatalogueProduct[];
  brands: { id: string; name: string; slug: string }[];
  categories: { id: string; slug: string; name: string; isActive: boolean }[];
}

async function loadStore(p: PrismaClient, vendorSlug: string): Promise<Store> {
  const vendor = await p.vendor.findUnique({ where: { slug: vendorSlug }, select: { id: true } });
  if (!vendor) throw new Error(`vendor "${vendorSlug}" not found in this database`);
  const vendorId = vendor.id;
  const [brands, categories, products] = await Promise.all([
    p.brand.findMany({ where: { vendorId }, select: { id: true, name: true, slug: true } }),
    p.category.findMany({
      where: { vendorId },
      select: { id: true, slug: true, name: true, isActive: true },
    }),
    p.product.findMany({
      where: { vendorId },
      select: {
        id: true,
        slug: true,
        name: true,
        plu: true,
        barcode: true,
        brandId: true,
        brand: { select: { name: true } },
        categoryId: true,
        category: { select: { slug: true, name: true } },
        basePrice: true,
        originalPrice: true,
        unitLabel: true,
        netContentAmount: true,
        netContentUnit: true,
        description: true,
        isActive: true,
        vatRate: true,
        origin: true,
        isHalal: true,
        isVegetarian: true,
        isOrganic: true,
        isGlutenFree: true,
        isFresh: true,
        manuallyEditedFields: true,
      },
    }),
  ]);
  const catalogue: CatalogueProduct[] = products.map(({ brand, category, ...rest }) => ({
    ...rest,
    brandName: brand?.name ?? null,
    categorySlug: category.slug,
    categoryName: category.name,
  }));
  return { vendorId, catalogue, brands, categories };
}

/** Profile brands first (aliases included), then every brand already in the store. */
function brandLookup(profile: StockImportProfile, store: Store): Map<string, string> {
  const ids = new Map<string, string>();
  for (const b of store.brands) {
    ids.set(b.name.toLowerCase(), b.id);
    ids.set(b.slug, b.id);
  }
  for (const b of profile.brands) {
    const id = [b.name, ...b.aliases]
      .map((n) => ids.get(n.toLowerCase()) ?? ids.get(slugify(n)))
      .find(Boolean);
    if (id) ids.set(b.name.toLowerCase(), id);
  }
  return ids;
}

function lookupsFor(profile: StockImportProfile, store: Store): PlanLookups {
  return {
    brandIds: brandLookup(profile, store),
    categories: new Map(store.categories.map((c) => [c.slug, { id: c.id, name: c.name }])),
  };
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
    const lines = buildPlan(rows, store.catalogue, profile, knownBrands, lookups, f.options);
    const dir = runDir(f, profile.vendorSlug);

    const extra = masterDataNotes(lines, lookups, store, profile);
    for (const fi of fileIssues) extra.push(`- **${fi.file}**: ${fi.issue.message}`);
    writeWorkbook(join(dir, "review.xlsx"), [
      {
        name: "Review",
        rows: [REVIEW_HEADER, ...reviewRows(lines, lookups)],
        widths: [24, 10, 38, 10, 10, 40, 34, 40, 10, 18, 8, 8, 40, 10, 10, 8, 40, 30, 50, 30, 40],
      },
      {
        name: "Run",
        rows: [
          ["Key", "Value"],
          ["vendor", profile.vendorSlug],
          ["database host", host],
          ["planned at", new Date().toISOString()],
          ["profile sha256", sha256(f.profile as string)],
          ...f.files.map((file) => [`source ${basename(file)} sha256`, sha256(file)]),
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

function masterDataNotes(
  lines: PlanLine[],
  lookups: PlanLookups,
  store: Store,
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
  files: string[],
  profilePath: string,
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
  if (meta.get("profile sha256") !== sha256(profilePath)) {
    throw new Error("REFUSED: the profile changed since the plan — plan again");
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
  const decisions = readReview(f.review, f.files, f.profile as string);
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
    const fresh = buildPlan(rows, store.catalogue, profile, knownBrands, lookups, f.options);
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

    // Master data first, reused before created (R9).
    for (const name of new Set(
      writing.map((w) => w.line.row.brand).filter((b): b is string => !!b),
    )) {
      if (lookups.brandIds.has(name.toLowerCase())) continue;
      const created = await p.brand.create({
        data: { vendorId, name, slug: slugify(name) },
        select: { id: true },
      });
      lookups.brandIds.set(name.toLowerCase(), created.id);
      masterCreated.push(`brand ${name}`);
    }
    for (const w of writing) {
      const cat = w.line.row.category;
      if (lookups.categories.has(cat.slug)) continue;
      if (!("newName" in cat))
        throw new Error(`category slug "${cat.slug}" (from the profile) does not exist`);
      const created = await p.category.create({
        data: { vendorId, slug: cat.slug, name: cat.newName, parentId: null, isActive: false },
        select: { id: true },
      });
      lookups.categories.set(cat.slug, { id: created.id, name: cat.newName });
      masterCreated.push(`category ${cat.newName} (inactive)`);
    }
    const attributeIds = new Map<string, { id: string; options: Map<string, string> }>();
    const attributeNames = new Set(writing.flatMap((w) => Object.keys(w.line.row.attributes)));
    for (const name of attributeNames) {
      const slug = slugify(name);
      let attr = await p.vendorAttribute.findUnique({
        where: { vendorId_slug: { vendorId, slug } },
        select: { id: true, options: { select: { id: true, slug: true } } },
      });
      if (!attr) {
        attr = await p.vendorAttribute.create({
          data: { vendorId, name, slug, kind: "LIST" },
          select: { id: true, options: { select: { id: true, slug: true } } },
        });
        masterCreated.push(`attribute ${name}`);
      }
      attributeIds.set(name, {
        id: attr.id,
        options: new Map(attr.options.map((o) => [o.slug, o.id])),
      });
    }
    for (const w of writing) {
      for (const [name, option] of Object.entries(w.line.row.attributes)) {
        const attr = attributeIds.get(name) as { id: string; options: Map<string, string> };
        const slug = slugify(option);
        if (attr.options.has(slug)) continue;
        const created = await p.vendorAttributeOption.create({
          data: { attributeId: attr.id, name: option, slug, sortOrder: attr.options.size },
          select: { id: true },
        });
        attr.options.set(slug, created.id);
        masterCreated.push(`option ${name}: ${option}`);
      }
    }

    const slugs = new Set(store.catalogue.map((c) => c.slug));
    const uniqueSlug = (name: string) => {
      const base = slugify(name).slice(0, 90) || "product";
      let slug = base;
      for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
      slugs.add(slug);
      return slug;
    };

    for (const w of work) {
      const { line } = w;
      const row = line.row;
      if (w.decision !== "UPDATE" && w.decision !== "CREATE") {
        outcomes.push({
          key: row.key,
          action: "skipped",
          productId: null,
          name: row.displayName,
          detail:
            w.decision === "REVIEW"
              ? "undecided (REVIEW)"
              : `${w.decision}: ${w.note || line.reason}`,
        });
        continue;
      }
      try {
        const targets = targetsFor(row, lookups);
        const categoryId = targets.categoryId as string;
        if (w.decision === "UPDATE") {
          const target = w.target as CatalogueProduct;
          const { changes, kept } = computeChanges(row, target, targets, profile, f.options);
          const data: Prisma.ProductUncheckedUpdateInput = {};
          let price = target.basePrice;
          let net =
            target.netContentAmount !== null && target.netContentUnit !== null
              ? { amount: target.netContentAmount, unit: target.netContentUnit }
              : null;
          for (const c of changes) {
            switch (c.field) {
              case "name":
                data.name = row.displayName;
                break;
              case "basePrice":
                data.basePrice = price = row.pricePence as number;
                break;
              case "originalPrice":
                data.originalPrice = row.wasPricePence;
                break;
              case "netContent":
                net = row.netContent;
                data.netContentAmount = net?.amount ?? null;
                data.netContentUnit = net?.unit ?? null;
                break;
              case "unitLabel":
                data.unitLabel = unitLabelFor(row.pricePence as number);
                break;
              case "brandId":
                data.brandId =
                  targets.brandId ?? lookups.brandIds.get((row.brand as string).toLowerCase());
                break;
              case "categoryId":
                data.categoryId = categoryId;
                break;
              case "plu":
                data.plu = row.plu;
                break;
              case "barcode":
                data.barcode = row.barcode;
                break;
              case "description":
                data.description = row.description as string;
                break;
              case "origin":
                data.origin = row.origin;
                break;
              case "vatRate":
                data.vatRate = row.vatRate as number;
                break;
              default:
                data[c.field] = row.flags[c.field] as boolean;
            }
          }
          if ("basePrice" in data || "netContentAmount" in data)
            data.unitPricePencePerBaseUnit = deriveUnitPricePenceForSort(price, net);
          const extras = await p.$transaction(async (tx) => {
            if (Object.keys(data).length > 0)
              await tx.product.update({ where: { id: target.id, vendorId }, data });
            return writeExtras(tx, vendorId, target.id, target.slug, row, attributeIds);
          });
          const parts = [
            ...changes.map((c) => `${c.field}: ${c.from || "—"} → ${c.to}`),
            ...extras,
          ];
          if (kept.length)
            parts.push(`kept ${kept.map((k) => `${k.field} (${k.reason})`).join(", ")}`);
          if (w.note) parts.push(`note: ${w.note}`);
          outcomes.push({
            key: row.key,
            action: changes.length || extras.length ? "updated" : "unchanged",
            productId: target.id,
            name: row.displayName,
            detail: parts.join("; "),
          });
        } else {
          const id = randomUUID();
          const slug = uniqueSlug(row.displayName);
          const extras = await p.$transaction(async (tx) => {
            await tx.product.create({
              data: {
                id,
                vendorId,
                slug,
                name: row.displayName,
                description: row.description ?? "",
                categoryId,
                basePrice: row.pricePence as number,
                originalPrice: row.wasPricePence,
                unitLabel: unitLabelFor(row.pricePence as number),
                netContentAmount: row.netContent?.amount ?? null,
                netContentUnit: row.netContent?.unit ?? null,
                unitPricePencePerBaseUnit: deriveUnitPricePenceForSort(
                  row.pricePence as number,
                  row.netContent,
                ),
                isActive: false,
                brandId:
                  targets.brandId ??
                  (row.brand ? lookups.brandIds.get(row.brand.toLowerCase()) : null) ??
                  null,
                plu: row.plu,
                barcode: row.barcode,
                origin: row.origin,
                ...(row.vatRate !== null ? { vatRate: row.vatRate } : {}),
                ...row.flags,
                importBatchId: batchId,
                importSourceRow: row.rowNumber,
              },
            });
            await tx.inventory.create({
              data: {
                vendorId,
                productId: id,
                quantity: 0,
                stockMode: "UNKNOWN",
                // #1572 — the store-wide low-stock default.
                lowStockThreshold: await readLowStockDefault(tx, vendorId),
              },
            });
            return writeExtras(tx, vendorId, id, slug, row, attributeIds);
          });
          store.catalogue.push({ id, slug, name: row.displayName } as CatalogueProduct);
          outcomes.push({
            key: row.key,
            action: "created",
            productId: id,
            name: row.displayName,
            detail: [
              `hidden, ${pounds(row.pricePence)}`,
              ...extras,
              ...(w.note ? [`note: ${w.note}`] : []),
            ].join("; "),
          });
        }
      } catch (e) {
        outcomes.push({
          key: row.key,
          action: "failed",
          productId: null,
          name: row.displayName,
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

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Attributes and offers (R9, R12). Existing values are kept; everything new is inactive. */
async function writeExtras(
  tx: Tx,
  vendorId: string,
  productId: string,
  slug: string,
  row: NormalisedRow,
  attributeIds: Map<string, { id: string; options: Map<string, string> }>,
): Promise<string[]> {
  const notes: string[] = [];
  for (const [name, option] of Object.entries(row.attributes)) {
    const attr = attributeIds.get(name);
    if (!attr) continue;
    const optionId = attr.options.get(slugify(option)) as string;
    const existing = await tx.productAttributeValue.findUnique({
      where: { productId_attributeId: { productId, attributeId: attr.id } },
      select: { optionId: true },
    });
    if (!existing) {
      await tx.productAttributeValue.create({
        data: { vendorId, productId, attributeId: attr.id, optionId },
      });
      notes.push(`${name}: ${option}`);
    } else if (existing.optionId !== optionId) {
      notes.push(`kept existing ${name}`);
    }
  }
  if (row.multiBuy) {
    const tier = await tx.productPriceTier.findUnique({
      where: { productId },
      select: { id: true },
    });
    if (!tier) {
      await tx.productPriceTier.create({
        data: {
          vendorId,
          productId,
          groupQuantity: row.multiBuy.quantity,
          groupPricePence: row.multiBuy.pricePence,
          isActive: false,
        },
      });
      notes.push(
        `multi-buy ${row.multiBuy.quantity} for ${pounds(row.multiBuy.pricePence)} (inactive)`,
      );
    }
  }
  if (row.bundle) {
    const bundleSlug = slugify(row.bundle.name);
    let bundle = await tx.bundle.findUnique({
      where: { vendorId_slug: { vendorId, slug: bundleSlug } },
      select: { id: true },
    });
    if (!bundle) {
      bundle = await tx.bundle.create({
        data: { vendorId, slug: bundleSlug, name: row.bundle.name, isActive: false },
        select: { id: true },
      });
      notes.push(`bundle ${row.bundle.name} created (inactive)`);
    }
    const item = await tx.bundleItem.findUnique({
      where: { bundleId_productId: { bundleId: bundle.id, productId } },
      select: { id: true },
    });
    if (!item) {
      await tx.bundleItem.create({
        data: { bundleId: bundle.id, productId, quantity: row.bundle.quantity },
      });
      notes.push(`in bundle ${row.bundle.name} ×${row.bundle.quantity}`);
    }
  }
  if (row.promotion) {
    const promo = await tx.promotion.findFirst({
      where: { vendorId, productId, headline: row.promotion },
      select: { id: true },
    });
    if (!promo) {
      await tx.promotion.create({
        data: {
          vendorId,
          productId,
          headline: row.promotion,
          linkUrl: `/products/${slug}`,
          isActive: false,
        },
      });
      notes.push(`promotion "${row.promotion}" (inactive)`);
    }
  }
  return notes;
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
  store: Store,
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

async function main() {
  const f = parseFlags(process.argv.slice(2));
  if (f.command === "decide") {
    decide(f, f.files[0]);
    return;
  }
  if (!["plan", "apply"].includes(f.command) || f.files.length === 0 || !f.profile) {
    throw new Error("usage: see the header of scripts/stock-import.ts");
  }
  const profile = parseProfile(JSON.parse(readFileSync(f.profile, "utf8")));
  if (f.command === "plan") await plan(f, profile);
  else await apply(f, profile);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
