import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { StorageService } from "@/lib/storage";
import { parseEnvFile } from "./lib/env-file";
import { assertNotDeployedDatabase, normalizeHost } from "./lib/protected-hosts";
import { APPLY_TRANSACTION_OPTIONS, applyPlan } from "./lib/neon-migration-apply";
import {
  IMAGE_KEY_FIELDS,
  MODEL_PLAN,
  SEEDED_VENDOR,
  VENDOR_HOSTS,
  VENDOR_SLUGS,
  applyForeignKeys,
  classifyTargetVendors,
  insertOrder,
  isDemoEmail,
  isPlaceholderKey,
  isSelectedProductSlug,
  parseForeignKeys,
  vendorDependents,
  type ForeignKey,
  type Row,
  type Target,
} from "./lib/neon-migration-plan";

/**
 * #1323 — fill a NEW Neon database from the old staging one.
 * Spec: specs/2026-10-29-merqify-platform-move/ (R7-R18). Runbook: env-setup.md, "Merqify account".
 *
 *   npx tsx scripts/migrate-to-new-neon.ts --from secrets/staging.vars \
 *       --to secrets/merqify-staging.vars --target staging            # DRY RUN (the default)
 *   ... --apply                    # write, then re-count every model (R17)
 *   ... --apply --copy-images      # also copy the R2 objects the copied rows reference (R18)
 *   ... --verify-only [--copy-images]   # re-plan from the source and compare with a filled target
 *   ... --apply --simulate-failure # validation aid (#1333): write everything, then roll it back
 *
 * WHAT IT DOES. Reads every row of every model `scripts/lib/neon-migration-plan.ts` does not skip,
 * keeps the rows its rules allow (two stores, real users, a 10% product sample), drops or nulls
 * anything that would point at a row left behind, and inserts the rest in foreign-key order with
 * their ORIGINAL primary keys. Keeping the ids is what lets image objects be copied key for key:
 * product image keys are built from product ids. `VendorDomain` is not copied; the target gets one
 * canonical row per store for the new merqify.com hosts.
 *
 * SAFETY. Hosts come from the two env files, never from the process environment, and are printed
 * with no password before anything is read. It refuses before any write when the two hosts are the
 * same, when the target already has a store other than the one every migration seeds (R8a-R8b),
 * or when the target is a host named in secrets/staging.vars or secrets/production.vars (the OLD
 * databases, which this only reads).
 *
 * THE TARGET IS A FRESHLY MIGRATED DATABASE, not an empty one: `prisma migrate deploy` inserts the
 * Aheed vendor (`SEEDED_VENDOR`). `--apply` deletes that one row, only once nothing references it,
 * and then inserts the copied vendors, so the target ends with each vendor once (R8c).
 *
 * ATOMIC (#1333, specs/2026-10-31-atomic-neon-copy/). The delete and every insert run inside ONE
 * interactive transaction (`scripts/lib/neon-migration-apply.ts`), so a failed `--apply` rolls the
 * target back to what `migrate deploy` left and the same command can be re-run. The image copy runs
 * after the commit and cannot be rolled back: if it fails, the rows stay and a re-run refuses as
 * occupied. `--simulate-failure` (only with `--apply`) throws after the last write, to prove the
 * rollback on a disposable target.
 */

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(`REFUSING: ${message}`);
  process.exit(1);
}

type Side = {
  label: string;
  path: string;
  vars: Record<string, string>;
  url: string;
  host: string;
};

function loadSide(label: string, path: string | undefined): Side {
  if (!path) fail(`--${label} <env-file> is required`);
  let vars: Record<string, string>;
  try {
    vars = parseEnvFile(path);
  } catch {
    fail(`${label} file ${path} cannot be read`);
  }
  const url = vars.DIRECT_URL;
  if (!url) fail(`${label} file ${path} has no DIRECT_URL line`);
  const host = normalizeHost(url);
  if (!host) fail(`${label} file ${path}: DIRECT_URL carries no host`);
  return { label, path, vars, url, host };
}

/** `user:***@host/db` — what an operator needs to recognise the database, with no password. */
function masked(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:***@").replace(/\?.*$/, "");
}

/** Prisma delegate name: `VendorFaq` -> `vendorFaq`. */
function delegate(client: object, model: string) {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  return (
    client as unknown as Record<
      string,
      {
        findMany: (args?: object) => Promise<Row[]>;
        createMany: (args: { data: Row[] }) => Promise<{ count: number }>;
        count: (args?: object) => Promise<number>;
        deleteMany: (args: object) => Promise<{ count: number }>;
      }
    >
  )[name];
}

type Plan = {
  order: string[];
  rows: Map<string, Row[]>;
  dropped: Map<string, number>;
  nulled: Map<string, number>;
  domains: Row[];
};

/** Read the source and decide every row. Pure apart from the reads; writes nothing. */
async function buildPlan(source: PrismaClient, target: Target): Promise<Plan> {
  const allFks = parseForeignKeys(readFileSync("prisma/schema.prisma", "utf8"));
  const copiedModels = Object.keys(MODEL_PLAN).filter((m) => MODEL_PLAN[m].class !== "skip");
  const fks: Record<string, ForeignKey[]> = Object.fromEntries(
    copiedModels.map((m) => [m, allFks[m] ?? []]),
  );
  const order = insertOrder(fks);

  // Which columns of each model other models point at, so only those values are remembered.
  const referenced = new Map<string, Set<string>>();
  for (const list of Object.values(fks)) {
    for (const fk of list) {
      const set = referenced.get(fk.target) ?? new Set<string>();
      fk.references.forEach((r) => set.add(r));
      referenced.set(fk.target, set);
    }
  }
  const copiedValues = new Map<string, Set<unknown>>();
  const remember = (model: string, row: Row) => {
    for (const field of referenced.get(model) ?? []) {
      const key = `${model}.${field}`;
      const set = copiedValues.get(key) ?? new Set<unknown>();
      set.add(row[field]);
      copiedValues.set(key, set);
    }
  };
  const isCopied = (model: string, field: string, value: unknown) =>
    copiedValues.get(`${model}.${field}`)?.has(value) ?? false;

  // Bundles come before products in foreign-key order (a bundle does not reference a product),
  // but whether a bundle survives depends on its items' products — so decide products up front.
  const keptSlugs = new Set(VENDOR_SLUGS[target]);
  const vendors = (await delegate(source, "Vendor").findMany()) as Row[];
  const keptVendorIds = new Set(
    vendors.filter((v) => keptSlugs.has(String(v.slug))).map((v) => v.id),
  );
  const selectedProductIds = new Set(
    ((await delegate(source, "Product").findMany()) as Row[])
      .filter((p) => keptVendorIds.has(p.vendorId) && isSelectedProductSlug(String(p.slug)))
      .map((p) => p.id),
  );
  const bundlesWithItems = new Set(
    ((await delegate(source, "BundleItem").findMany()) as Row[])
      .filter((i) => selectedProductIds.has(i.productId))
      .map((i) => i.bundleId),
  );

  const ownRule: Record<string, (row: Row) => boolean> = {
    Vendor: (r) => keptSlugs.has(String(r.slug)),
    User: (r) => !isDemoEmail(String(r.email)),
    Product: (r) => selectedProductIds.has(r.id),
    Bundle: (r) => bundlesWithItems.has(r.id),
  };

  const rows = new Map<string, Row[]>();
  const dropped = new Map<string, number>();
  const nulled = new Map<string, number>();

  for (const model of order) {
    let pending = (await delegate(source, model).findMany()) as Row[];
    const rule = ownRule[model];
    const kept: Row[] = [];
    let drop = pending.filter((r) => rule && !rule(r)).length;
    if (rule) pending = pending.filter(rule);
    let nulls = 0;

    // Rows of a self-referencing model (Category.parentId) go in parents-first: repeat passes
    // until nothing new is accepted; whatever is left points at a parent that never arrived.
    const selfFks = fks[model].filter((fk) => fk.target === model);
    const otherFks = fks[model].filter((fk) => fk.target !== model);
    for (;;) {
      const next: Row[] = [];
      let progressed = false;
      for (const row of pending) {
        const outer = applyForeignKeys(row, otherFks, isCopied);
        if (!outer.row) {
          drop += 1;
          continue;
        }
        const waiting = selfFks.some((fk) =>
          fk.fields.some((f, i) => {
            const v = outer.row![f];
            return (
              v !== null &&
              v !== undefined &&
              !isCopied(model, fk.references[i], v) &&
              pending.some((p) => p[fk.references[i]] === v)
            );
          }),
        );
        if (waiting) {
          next.push(row);
          continue;
        }
        const inner = applyForeignKeys(outer.row, selfFks, isCopied);
        if (!inner.row) {
          drop += 1;
          continue;
        }
        nulls += outer.nulled + inner.nulled;
        kept.push(inner.row);
        remember(model, inner.row);
        progressed = true;
      }
      if (next.length === 0) break;
      if (!progressed) {
        drop += next.length; // a parent cycle or a parent that was itself dropped
        break;
      }
      pending = next;
    }

    rows.set(model, kept);
    dropped.set(model, drop);
    nulled.set(model, nulls);
  }

  const vendorBySlug = new Map(vendors.map((v) => [String(v.slug), v.id]));
  const domains = Object.entries(VENDOR_HOSTS[target]).map(([slug, host]) => ({
    id: randomUUID(),
    vendorId: vendorBySlug.get(slug),
    host,
    isCanonical: true,
  }));
  if (domains.some((d) => !d.vendorId)) {
    fail(`the source has no store for one of ${Object.keys(VENDOR_HOSTS[target]).join(", ")}`);
  }

  return { order, rows, dropped, nulled, domains };
}

function printPlan(plan: Plan) {
  console.log(
    "\nmodel                         copy   dropped(missing parent/rule)   nulled(missing parent)",
  );
  for (const model of plan.order) {
    const line = `${model.padEnd(28)}${String(plan.rows.get(model)!.length).padStart(6)}`;
    console.log(
      `${line}   ${String(plan.dropped.get(model)).padStart(8)}   ${String(plan.nulled.get(model)).padStart(8)}`,
    );
  }
  console.log(
    `${"VendorDomain (generated)".padEnd(28)}${String(plan.domains.length).padStart(6)}   ${plan.domains.map((d) => d.host).join(", ")}`,
  );
  // R31 — the move frees the nocaped.com domain, so any copied value still naming it (store
  // sender and contact emails on old staging) is listed for the owner to replace after cut-over
  // at /staff/storefront. Copied unchanged: inventing replacement addresses is not ours to do.
  const stale = new Map<string, number>();
  for (const model of plan.order) {
    for (const row of plan.rows.get(model)!) {
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === "string" && value.toLowerCase().includes("nocaped")) {
          stale.set(`${model}.${field}`, (stale.get(`${model}.${field}`) ?? 0) + 1);
        }
      }
    }
  }
  if (stale.size > 0) {
    console.log("\nWARNING: copied values still naming nocaped (replace after the cut-over):");
    for (const [where, count] of stale) console.log(`  ${where}: ${count}`);
  }

  const skipped = Object.entries(MODEL_PLAN).filter(([, p]) => p.class === "skip");
  console.log(`\nskipped models (${skipped.length}):`);
  for (const [model, p] of skipped) console.log(`  ${model}: ${p.reason}`);
}

/** R17 — every copied model's count in the target equals the plan. */
async function verifyCounts(targetDb: PrismaClient, plan: Plan): Promise<boolean> {
  let ok = true;
  console.log("\nverification (target count vs plan):");
  const expected: Array<[string, number]> = [
    ...plan.order.map((m) => [m, plan.rows.get(m)!.length] as [string, number]),
    ["VendorDomain", plan.domains.length],
  ];
  for (const [model, want] of expected) {
    const got = await delegate(targetDb, model).count();
    const match = got === want;
    if (!match) ok = false;
    console.log(
      `  ${model.padEnd(28)} ${String(got).padStart(6)} / ${String(want).padStart(6)}  ${match ? "match" : "MISMATCH"}`,
    );
  }
  return ok;
}

/** R18 — copy every object the copied rows reference, key for key. */
async function copyImages(plan: Plan, from: Side, to: Side): Promise<boolean> {
  for (const side of [from, to]) {
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) {
      if (!side.vars[k]) fail(`--copy-images needs ${k} in ${side.path}`);
    }
  }
  if (from.vars.S3_ENDPOINT === to.vars.S3_ENDPOINT && from.vars.S3_BUCKET === to.vars.S3_BUCKET) {
    fail("source and destination name the same bucket");
  }

  // getStorage() reads lib/config at construction; swapping process.env between two calls gives
  // two independent clients (the pattern scripts/copy-product-images.ts established).
  const { getStorage } = await import("@/lib/storage");
  Object.assign(process.env, from.vars);
  const source: StorageService = getStorage();
  Object.assign(process.env, to.vars);
  const dest: StorageService = getStorage();

  const keys = new Set<string>();
  for (const { model, field } of IMAGE_KEY_FIELDS) {
    for (const row of plan.rows.get(model) ?? []) {
      const key = row[field];
      if (typeof key === "string" && key.trim()) keys.add(key);
    }
  }

  const placeholder = readFileSync("prisma/seed-assets/placeholder-product.svg");
  let copied = 0;
  const restored: string[] = [];
  const missing: string[] = [];
  for (const key of [...keys].sort()) {
    const body = await source.getObject(key);
    if (body) {
      await dest.putObject(key, body, contentTypeOf(key));
      copied += 1;
    } else if (isPlaceholderKey(key)) {
      await dest.putObject(key, placeholder, "image/svg+xml");
      restored.push(key);
    } else {
      missing.push(key);
    }
  }
  console.log(
    `\nimages: ${keys.size} referenced, ${copied} copied, ${restored.length} placeholders restored, ${missing.length} missing`,
  );
  for (const key of restored) console.log(`  restored placeholder: ${key}`);
  for (const key of missing) console.log(`  MISSING in source: ${key}`);
  return missing.length === 0;
}

function contentTypeOf(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  return (
    {
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
    }[ext ?? ""] ?? "application/octet-stream"
  );
}

async function main() {
  const simulateFailure = flag("--simulate-failure");
  if (simulateFailure && (!flag("--apply") || flag("--verify-only"))) {
    fail("--simulate-failure needs --apply and cannot be combined with --verify-only");
  }
  const target = flagValue("--target");
  if (target !== "staging" && target !== "production")
    fail("--target staging|production is required");
  const from = loadSide("from", flagValue("--from"));
  const to = loadSide("to", flagValue("--to"));
  const apply = flag("--apply");
  const verifyOnly = flag("--verify-only");
  const images = flag("--copy-images");

  console.log(`source (read only): ${from.path}  ${masked(from.url)}`);
  console.log(`target (${target}):     ${to.path}  ${masked(to.url)}`);
  console.log(
    `mode: ${verifyOnly ? "verify only" : apply ? "APPLY" : "dry run"}${images ? " + copy images" : ""}\n`,
  );

  if (from.host === to.host) fail(`--from and --to are the same host (${to.host})`);
  try {
    assertNotDeployedDatabase(to.url);
  } catch (error) {
    fail((error as Error).message);
  }

  const sourceDb = new PrismaClient({ adapter: new PrismaNeon({ connectionString: from.url }) });
  const targetDb = new PrismaClient({ adapter: new PrismaNeon({ connectionString: to.url }) });
  try {
    // R8a-R8b. A verify-only run compares a target that is already filled, so it skips both.
    let targetState: "empty" | "seeded-only" = "empty";
    if (!verifyOnly) {
      const rows = (await delegate(targetDb, "Vendor").findMany({
        select: { id: true, slug: true },
      })) as Array<{ id: string; slug: string }>;
      const state = classifyTargetVendors(rows);
      if (state === "occupied") {
        fail(
          `the target already holds ${rows.length} store(s) (${rows.map((r) => r.slug).join(", ")}) ` +
            `beyond the migration-seeded ${SEEDED_VENDOR.slug}; this only fills a freshly migrated database`,
        );
      }
      targetState = state;
      if (state === "seeded-only") {
        const models = parseForeignKeys(readFileSync("prisma/schema.prisma", "utf8"));
        for (const { model, field } of vendorDependents(models)) {
          const owned = await delegate(targetDb, model).count({
            where: { [field]: SEEDED_VENDOR.id },
          });
          if (owned > 0) {
            fail(
              `the migration-seeded vendor ${SEEDED_VENDOR.slug} already owns ${owned} ${model} row(s); ` +
                `deleting it would remove them. Reset the target from a fresh migrate deploy.`,
            );
          }
        }
      }
    }

    const plan = await buildPlan(sourceDb, target);
    console.log(`target vendors: ${targetState}`);
    if (targetState === "seeded-only") {
      console.log(
        `  --apply will replace the migration-seeded vendor ${SEEDED_VENDOR.slug} (${SEEDED_VENDOR.id}) with the copied one.`,
      );
    }
    printPlan(plan);

    if (!apply && !verifyOnly) {
      console.log("\nDry run: nothing was written. Re-run with --apply to copy.");
      return;
    }

    if (apply) {
      // #1333: every target write (R8c's seeded-vendor delete included) happens inside this one
      // interactive transaction on the WebSocket client, so a failure rolls all of it back.
      const started = Date.now();
      try {
        await targetDb.$transaction(
          (tx) =>
            applyPlan((model) => delegate(tx, model), plan, {
              replaceSeeded: targetState === "seeded-only",
              seededVendorId: SEEDED_VENDOR.id,
              simulateFailure,
              log: (line) => console.log(`\n${line}`),
            }),
          APPLY_TRANSACTION_OPTIONS,
        );
      } catch (error) {
        console.error(`\nROLLED BACK: ${(error as Error).message}`);
        console.error("The target is as migrate deploy left it; re-running is safe.");
        process.exitCode = 1;
        return;
      }
      console.log(`committed: ${Date.now() - started} ms`);
    }

    // A verify-only run regenerates domain ids, but compares counts only, so that is harmless.
    const countsOk = await verifyCounts(targetDb, plan);
    const imagesOk = images ? await copyImages(plan, from, to) : true;
    if (!countsOk || !imagesOk) {
      console.error(
        `\nFAILED: ${!countsOk ? "row counts differ from the plan" : "images missing in the source"}`,
      );
      process.exitCode = 1;
    } else {
      console.log("\nOK: every copied model matches the plan.");
    }
  } finally {
    await sourceDb.$disconnect();
    await targetDb.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
