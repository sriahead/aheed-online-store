import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { StorageService } from "@/lib/storage";
import { parseEnvFile } from "./lib/env-file";

/**
 * #1523 — copy one vendor's CATALOGUE from staging to production, images included, instead of
 * re-running every catalogue script (and regenerating images) against production.
 *
 *   npx tsx scripts/catalogue-copy-staging-to-production.ts \
 *     --from secrets/afc-staging.vars --to secrets/afc-production.vars \
 *     --vendor-slug aheed-food-centre --activation keep-production|copy \
 *     [--apply --confirm-host <destination db host> --production]
 *
 * WHY ROWS CAN BE MATCHED BY ID. A dedicated cell's staging database is a Neon branch of its
 * production database ("Reset from parent", #1512), so every row that existed at the last refresh
 * carries the same id in both. Rows staging created since then (new categories, bundles, images)
 * are inserted WITH their staging id. Image keys embed those ids (`products/{productId}/…`), so an
 * object can be copied key for key: unlike #518's seed-built environments, the key addresses the
 * same row on both sides. The script REFUSES when the vendor's id differs between the two
 * databases, because then that premise is false.
 *
 * WHAT IS COPIED (this vendor only): brands, attributes and their options, categories, products,
 * multi-buy tiers, stock rows, product attribute values, product images, bundles and their items,
 * promotions, category assets, and the inventory and restriction audit trails (append only).
 * NOT copied: orders, customers, accounts, carts, reviews, vendor settings, domains, anything else.
 * Product.averageRating/reviewCount stay as production has them (they derive from its reviews).
 *
 * WHAT IS NEVER DONE. Nothing in the source is written. Nothing in the destination is deleted,
 * except image rows and bundle lines, which are MIRRORED (staging replaced a placeholder image row
 * or rebuilt a bundle's lines, so leaving production's old row would show two primaries or a stale
 * line; a NetContentSuggestion on a deleted image row keeps itself, its link set null). Every other
 * row that exists only in production is reported and left alone.
 *
 * `--activation` IS REQUIRED, because it is the one decision with customer-visible effect:
 *   - keep-production: each product, bundle and promotion keeps production's on/off switch; one new
 *     to production arrives switched OFF. The pre-launch "everything hidden" state survives.
 *   - copy: on/off switches are copied from staging as they are (staging's live offers go live).
 * A restricted product is switched off in both modes (`Product_restricted_inactive_check`).
 *
 * ORDER. Image objects are copied BEFORE any row, so production never points at a missing object.
 * Rows are written parents first. The run is idempotent: a second run reports nothing to do.
 * Take a Neon backup branch of production first; this script does not open one transaction for
 * the whole copy (thousands of rows), so the backup is the rollback.
 *
 * GUARDS. Dry run by default. Both hosts and buckets are printed before anything is read. Same
 * host or same bucket on both sides is refused. `--apply` needs `--confirm-host` equal to the
 * destination host, and a destination file named like production also needs `--production`.
 * A unique-key clash or a reference to a row production lacks stops the run before any write.
 */

export type Row = Record<string, unknown>;
export type ActivationPolicy = "keep-production" | "copy";

export interface TableSpec {
  /** Prisma delegate name. */
  model: string;
  /** Vendor-scoped filter. */
  where: (vendorId: string) => object;
  /** Fields that identify the same row on both sides. */
  key: readonly string[];
  /** upsert: create or update; mirror: also delete destination-only rows; append: create only. */
  mode: "upsert" | "mirror" | "append";
  /** Never compared, never written (destination keeps its own value). */
  skip?: readonly string[];
  /** Written on create, not compared (bookkeeping timestamps). */
  compareIgnore?: readonly string[];
  /** Unique constraints other than the key, checked on the combined result. */
  unique?: readonly (readonly string[])[];
  /** isActive follows the activation policy. */
  activation?: boolean;
}

/** In write order: every table after the ones it references. */
export const TABLES: readonly TableSpec[] = [
  {
    model: "brand",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "upsert",
    unique: [["vendorId", "slug"]],
  },
  {
    model: "vendorAttribute",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "upsert",
    unique: [["vendorId", "slug"]],
  },
  {
    model: "vendorAttributeOption",
    where: (v) => ({ attribute: { vendorId: v } }),
    key: ["id"],
    mode: "upsert",
    unique: [["attributeId", "slug"]],
  },
  {
    model: "category",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "upsert",
    unique: [["vendorId", "slug"]],
  },
  {
    model: "product",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "upsert",
    skip: ["averageRating", "reviewCount"],
    unique: [
      ["vendorId", "slug"],
      ["vendorId", "plu"],
    ],
    activation: true,
  },
  {
    model: "productPriceTier",
    where: (v) => ({ vendorId: v }),
    key: ["productId"],
    mode: "upsert",
    compareIgnore: ["createdAt", "updatedAt"],
  },
  {
    model: "inventory",
    where: (v) => ({ vendorId: v }),
    key: ["productId"],
    mode: "upsert",
    skip: ["version"],
    compareIgnore: ["updatedAt"],
  },
  {
    model: "productAttributeValue",
    where: (v) => ({ vendorId: v }),
    key: ["productId", "attributeId"],
    mode: "upsert",
  },
  {
    model: "productImage",
    where: (v) => ({ product: { vendorId: v } }),
    key: ["id"],
    mode: "mirror",
  },
  {
    model: "bundle",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "upsert",
    compareIgnore: ["updatedAt"],
    unique: [["vendorId", "slug"]],
    activation: true,
  },
  {
    model: "bundleItem",
    where: (v) => ({ bundle: { vendorId: v } }),
    key: ["bundleId", "productId"],
    mode: "mirror",
  },
  {
    model: "promotion",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "upsert",
    compareIgnore: ["updatedAt"],
    activation: true,
  },
  { model: "categoryAsset", where: (v) => ({ vendorId: v }), key: ["id"], mode: "upsert" },
  { model: "inventoryAuditLog", where: (v) => ({ vendorId: v }), key: ["id"], mode: "append" },
  {
    model: "productRestrictionAuditLog",
    where: (v) => ({ vendorId: v }),
    key: ["id"],
    mode: "append",
  },
];

/** Image-key columns, per model. */
export const IMAGE_FIELDS: Readonly<Record<string, string>> = {
  brand: "imageKey",
  category: "imageKey",
  productImage: "storageKey",
  bundle: "imageKey",
  promotion: "imageKey",
  categoryAsset: "storageKey",
};

/** Comparable form of a column value: dates as ISO strings, Decimals as strings. */
export function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === "object") return String(value);
  return value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

export function keyOf(row: Row, key: readonly string[]): string {
  return key.map((f) => String(row[f])).join("|");
}

export interface RowUpdate {
  /** The DESTINATION row's id (a key-matched row keeps it). */
  id: string;
  data: Row;
  changed: string[];
}

export interface RowDiff {
  create: Row[];
  update: RowUpdate[];
  /** Destination rows with no source counterpart. */
  onlyInTarget: Row[];
  unchanged: number;
}

/** Pure: what makes the destination match the source for one table. */
export function diffRows(source: readonly Row[], target: readonly Row[], spec: TableSpec): RowDiff {
  const skip = new Set(spec.skip ?? []);
  const ignore = new Set([...(spec.compareIgnore ?? []), ...skip, "id"]);
  const targetByKey = new Map(target.map((r) => [keyOf(r, spec.key), r]));
  const sourceKeys = new Set(source.map((r) => keyOf(r, spec.key)));
  const diff: RowDiff = { create: [], update: [], onlyInTarget: [], unchanged: 0 };

  for (const row of source) {
    const existing = targetByKey.get(keyOf(row, spec.key));
    if (!existing) {
      diff.create.push(Object.fromEntries(Object.entries(row).filter(([k]) => !skip.has(k))));
      continue;
    }
    if (spec.mode === "append") {
      diff.unchanged++;
      continue;
    }
    const changed = Object.keys(row).filter((k) => !ignore.has(k) && !same(row[k], existing[k]));
    if (changed.length === 0) {
      diff.unchanged++;
      continue;
    }
    diff.update.push({
      id: existing.id as string,
      data: Object.fromEntries(changed.map((k) => [k, row[k]])),
      changed,
    });
  }
  diff.onlyInTarget = target.filter((r) => !sourceKeys.has(keyOf(r, spec.key)));
  return diff;
}

/**
 * Pure: source rows with isActive decided by the policy. keep-production keeps the destination's
 * switch, and a row new to the destination arrives off. Either way a restricted row is off.
 */
export function withActivationPolicy(
  source: readonly Row[],
  target: readonly Row[],
  key: readonly string[],
  policy: ActivationPolicy,
): Row[] {
  const targetByKey = new Map(target.map((r) => [keyOf(r, key), r]));
  return source.map((row) => {
    let isActive =
      policy === "copy"
        ? row.isActive
        : ((targetByKey.get(keyOf(row, key))?.isActive as boolean | undefined) ?? false);
    if ("restriction" in row && row.restriction !== null) isActive = false;
    return { ...row, isActive };
  });
}

/** Pure: unique-constraint clashes in the destination as it would be after the copy. */
export function uniqueClashes(
  source: readonly Row[],
  target: readonly Row[],
  spec: TableSpec,
): string[] {
  const combined = new Map<string, Row>();
  if (spec.mode !== "mirror") for (const r of target) combined.set(keyOf(r, spec.key), r);
  for (const r of source) combined.set(keyOf(r, spec.key), r);
  const clashes: string[] = [];
  for (const fields of spec.unique ?? []) {
    const seen = new Map<string, string>();
    for (const row of combined.values()) {
      if (fields.some((f) => row[f] === null || row[f] === undefined)) continue;
      const value = fields.map((f) => String(row[f])).join("|");
      const other = seen.get(value);
      if (other !== undefined && other !== row.id) {
        clashes.push(
          `${spec.model} ${fields.join("+")} "${value}": ids ${other} and ${String(row.id)}`,
        );
      }
      seen.set(value, row.id as string);
    }
  }
  return clashes;
}

/** Pure: categories ordered so a parent is always created before its children. */
export function parentsFirst(rows: readonly Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const out: Row[] = [];
  const done = new Set<string>();
  const visit = (row: Row, depth: number) => {
    const id = row.id as string;
    if (done.has(id) || depth > rows.length) return;
    const parent = row.parentId ? byId.get(row.parentId as string) : undefined;
    if (parent) visit(parent, depth + 1);
    if (!done.has(id)) {
      done.add(id);
      out.push(row);
    }
  };
  for (const row of rows) visit(row, 0);
  return out;
}

/** Pure: every distinct image key the given rows point at. */
export function imageKeys(rowsByModel: Readonly<Record<string, readonly Row[]>>): string[] {
  const keys = new Set<string>();
  for (const [model, field] of Object.entries(IMAGE_FIELDS)) {
    for (const row of rowsByModel[model] ?? []) {
      const key = row[field];
      if (typeof key === "string" && key.length > 0) keys.add(key);
    }
  }
  return [...keys].sort();
}

function changedFieldCounts(updates: readonly RowUpdate[]): string {
  const counts = new Map<string, number>();
  for (const u of updates) for (const f of u.changed) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f} ${n}`)
    .join(", ");
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    from: at("--from"),
    to: at("--to"),
    vendorSlug: at("--vendor-slug"),
    activation: at("--activation"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
    skipImages: argv.includes("--skip-images"),
  };
}

const DB_KEYS = ["AFC_DIRECT_URL", "DIRECT_URL"];
const S3_KEYS = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];

function loadEnvironment(label: string, file: string) {
  const vars = parseEnvFile(file);
  const dbKey = DB_KEYS.find((k) => vars[k]);
  if (!dbKey) throw new Error(`${label} ${file} has none of ${DB_KEYS.join(", ")}`);
  for (const k of S3_KEYS) if (!vars[k]) throw new Error(`${label} ${file} is missing ${k}`);
  return {
    file,
    vars,
    url: vars[dbKey],
    host: new URL(vars[dbKey]).hostname,
    bucket: vars.S3_BUCKET,
  };
}

export type Delegate = {
  findMany(args: object): Promise<Row[]>;
  createMany(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  deleteMany(args: object): Promise<unknown>;
};

function delegate(client: PrismaClient, model: string): Delegate {
  return (client as unknown as Record<string, Delegate>)[model];
}

/**
 * True for a dropped connection (undici's "fetch failed" with ECONNRESET and the like), which is
 * worth retrying. An HTTP error status is NOT: storage reports those as its own messages.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { cause?: { code?: unknown } }).cause?.code;
  return (
    error.message === "fetch failed" ||
    (typeof code === "string" &&
      /^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|EAI_AGAIN|UND_ERR_)/.test(code))
  );
}

/**
 * Retries a storage call on a dropped connection, with backoff. R2 reset 47 of 250 HEAD requests on
 * 2026-11-12 while the same check an hour earlier had none. The final error names the object.
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 5,
  delayMs = 500,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isNetworkError(error) || attempt >= attempts) {
        const why = error instanceof Error ? error.message : String(error);
        throw new Error(`${label}: ${why} (attempt ${attempt} of ${attempts})`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1)));
    }
  }
}

async function inBatches<T>(items: readonly T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/** Writes every table's diff, in TABLES order (parents first). Exported for tests. */
export async function writePlan(
  client: Readonly<Record<string, Delegate>>,
  diffs: ReadonlyMap<string, RowDiff>,
  onTable: (model: string) => void = () => {},
): Promise<void> {
  for (const spec of TABLES) {
    const diff = diffs.get(spec.model);
    if (!diff) continue;
    const d = client[spec.model];
    if (spec.model === "category") {
      // One row per insert, parents first, so a child never precedes its parent.
      for (const row of parentsFirst(diff.create)) await d.createMany({ data: [row] });
    } else {
      for (let i = 0; i < diff.create.length; i += 500) {
        await d.createMany({ data: diff.create.slice(i, i + 500) });
      }
    }
    await inBatches(diff.update, 8, async (u) => {
      const data = spec.model === "inventory" ? { ...u.data, version: { increment: 1 } } : u.data;
      await d.update({ where: { id: u.id }, data });
    });
    if (spec.mode === "mirror") {
      const ids = diff.onlyInTarget.map((r) => r.id as string);
      if (ids.length > 0) await d.deleteMany({ where: { id: { in: ids } } });
    }
    onTable(spec.model);
  }
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (!f.from || !f.to || !f.vendorSlug || !f.activation) {
    throw new Error("usage: see the header of scripts/catalogue-copy-staging-to-production.ts");
  }
  if (f.activation !== "keep-production" && f.activation !== "copy") {
    throw new Error(`--activation must be keep-production or copy (got ${f.activation})`);
  }
  const policy: ActivationPolicy = f.activation;
  const toProduction = /production/i.test(f.to);

  const source = loadEnvironment("source", f.from);
  const dest = loadEnvironment("destination", f.to);
  console.log(`source      ${source.file}: database ${source.host}, bucket ${source.bucket}`);
  console.log(`destination ${dest.file}: database ${dest.host}, bucket ${dest.bucket}`);
  console.log(`activation  ${policy}`);
  console.log(f.apply ? "MODE: APPLY" : "MODE: dry run (writes nothing)");
  if (source.host.replace("-pooler.", ".") === dest.host.replace("-pooler.", ".")) {
    throw new Error("REFUSED: source and destination are the same database");
  }
  if (source.bucket === dest.bucket)
    throw new Error("REFUSED: source and destination share a bucket");
  if (f.skipImages && toProduction)
    throw new Error("REFUSED: --skip-images is for test targets only");
  if (f.apply && f.confirmHost !== dest.host) {
    throw new Error(
      `--apply needs --confirm-host ${dest.host} (got ${f.confirmHost ?? "nothing"})`,
    );
  }
  if (f.apply && toProduction && !f.production) {
    throw new Error("REFUSED: a production destination also needs --production");
  }

  // getStorage() captures its env at construction (see copy-product-images.ts), so one client per
  // environment, built with process.env swapped in between, gives two independent clients. Its
  // config schema also requires DATABASE_URL, which a cell's file names AFC_DATABASE_URL; the
  // storage client never uses it, so the environment's own URL fills it.
  const { getStorage } = await import("@/lib/storage");
  const storageFor = (env: ReturnType<typeof loadEnvironment>): StorageService => {
    for (const [k, v] of Object.entries(env.vars)) process.env[k] = v;
    process.env.DATABASE_URL = env.vars.DATABASE_URL ?? env.url;
    return getStorage();
  };
  const sourceStorage = storageFor(source);
  const destStorage = storageFor(dest);

  const src = new PrismaClient({ adapter: new PrismaNeon({ connectionString: source.url }) });
  const dst = new PrismaClient({ adapter: new PrismaNeon({ connectionString: dest.url }) });
  try {
    const select = { id: true, slug: true, name: true };
    const [srcVendor, dstVendor] = await Promise.all([
      src.vendor.findUnique({ where: { slug: f.vendorSlug }, select }),
      dst.vendor.findUnique({ where: { slug: f.vendorSlug }, select }),
    ]);
    if (!srcVendor || !dstVendor) throw new Error(`vendor ${f.vendorSlug} missing on one side`);
    if (srcVendor.id !== dstVendor.id) {
      throw new Error(
        `REFUSED: vendor id differs (${srcVendor.id} vs ${dstVendor.id}); ids cannot be matched`,
      );
    }
    const vendorId = srcVendor.id;
    console.log(`vendor      ${srcVendor.name} (${vendorId})\n`);

    const sourceRows: Record<string, Row[]> = {};
    const targetRows: Record<string, Row[]> = {};
    for (const spec of TABLES) {
      const args = { where: spec.where(vendorId) };
      [sourceRows[spec.model], targetRows[spec.model]] = await Promise.all([
        delegate(src, spec.model).findMany(args),
        delegate(dst, spec.model).findMany(args),
      ]);
      if (spec.activation) {
        sourceRows[spec.model] = withActivationPolicy(
          sourceRows[spec.model],
          targetRows[spec.model],
          spec.key,
          policy,
        );
      }
    }

    // Inventory matched by productId may keep production's own id; audit rows follow it.
    const finalInventoryId = new Map<string, string>();
    for (const r of sourceRows.inventory)
      finalInventoryId.set(r.productId as string, r.id as string);
    for (const r of targetRows.inventory)
      finalInventoryId.set(r.productId as string, r.id as string);
    sourceRows.inventoryAuditLog = sourceRows.inventoryAuditLog.map((r) => ({
      ...r,
      inventoryId: finalInventoryId.get(r.productId as string) ?? r.inventoryId,
    }));

    // References to rows outside the catalogue must already exist in the destination.
    const problems: string[] = [];
    const dstDiscounts = new Set(
      (await dst.discountCode.findMany({ where: { vendorId }, select: { id: true } })).map(
        (d) => d.id,
      ),
    );
    for (const p of sourceRows.promotion) {
      if (p.discountCodeId && !dstDiscounts.has(p.discountCodeId as string)) {
        problems.push(
          `promotion ${String(p.headline)} names discount code ${String(p.discountCodeId)}, absent in destination`,
        );
      }
    }
    const actorIds = [
      ...new Set(sourceRows.productRestrictionAuditLog.map((r) => r.actorUserId).filter(Boolean)),
    ] as string[];
    const dstUsers = new Set(
      (await dst.user.findMany({ where: { id: { in: actorIds } }, select: { id: true } })).map(
        (u) => u.id,
      ),
    );
    let actorsCleared = 0;
    sourceRows.productRestrictionAuditLog = sourceRows.productRestrictionAuditLog.map((r) => {
      if (r.actorUserId && !dstUsers.has(r.actorUserId as string)) {
        actorsCleared++;
        return { ...r, actorUserId: null };
      }
      return r;
    });

    // Image objects the copied rows point at, and which the destination bucket lacks.
    const keys = imageKeys(sourceRows);
    const toCopy: { key: string; contentType: string }[] = [];
    const missingEverywhere: string[] = [];
    if (!f.skipImages) {
      await inBatches(keys, 4, async (key) => {
        if (await withRetry(`HEAD destination ${key}`, () => destStorage.headObject(key))) return;
        const head = await withRetry(`HEAD source ${key}`, () => sourceStorage.headObject(key));
        if (!head) missingEverywhere.push(key);
        else toCopy.push({ key, contentType: head.contentType ?? "application/octet-stream" });
      });
    }
    console.log(
      `\nimage objects referenced ${keys.length}: to copy ${toCopy.length}, missing in both buckets ${missingEverywhere.length}` +
        (f.skipImages ? " (--skip-images: not checked)" : ""),
    );
    for (const key of missingEverywhere.slice(0, 20))
      console.log(`  missing in both buckets: ${key}`);

    // An image ROW whose object exists in neither bucket is broken on both sides already (legacy
    // keys); it is neither copied nor deleted, so the copy spreads no broken image.
    const broken = new Set(missingEverywhere);
    const usable = (r: Row) => !broken.has(r.storageKey as string);
    const skippedImageRows = sourceRows.productImage.filter((r) => !usable(r)).length;
    sourceRows.productImage = sourceRows.productImage.filter(usable);
    targetRows.productImage = targetRows.productImage.filter(usable);
    if (skippedImageRows > 0) {
      console.log(`image rows left alone (object missing in both buckets): ${skippedImageRows}`);
    }

    const diffs = new Map<string, RowDiff>();
    for (const spec of TABLES) {
      problems.push(...uniqueClashes(sourceRows[spec.model], targetRows[spec.model], spec));
      const diff = diffRows(sourceRows[spec.model], targetRows[spec.model], spec);
      diffs.set(spec.model, diff);
      const kept = spec.mode === "mirror" ? "deleted" : "kept";
      console.log(
        `${spec.model.padEnd(27)} create ${diff.create.length}, update ${diff.update.length}` +
          `, unchanged ${diff.unchanged}, only in destination ${diff.onlyInTarget.length} (${kept})`,
      );
      if (diff.update.length > 0)
        console.log(`${"".padEnd(29)}fields: ${changedFieldCounts(diff.update)}`);
    }
    if (actorsCleared > 0)
      console.log(
        `restriction audit rows whose actor is not in destination: ${actorsCleared} (actor left empty)`,
      );

    const activeAfter = (model: string) => {
      const diff = diffs.get(model)!;
      const updated = new Map(diff.update.map((u) => [u.id, u.data]));
      const fromTarget = targetRows[model].filter((r) => {
        const data = updated.get(r.id as string);
        return data && "isActive" in data ? data.isActive === true : r.isActive === true;
      }).length;
      return fromTarget + diff.create.filter((r) => r.isActive === true).length;
    };
    console.log(
      `\nswitched on after the copy: products ${activeAfter("product")}, bundles ${activeAfter("bundle")}, promotions ${activeAfter("promotion")}` +
        ` (now ${targetRows.product.filter((r) => r.isActive).length}, ${targetRows.bundle.filter((r) => r.isActive).length}, ${targetRows.promotion.filter((r) => r.isActive).length})`,
    );

    if (problems.length > 0) {
      for (const p of problems) console.log(`  PROBLEM ${p}`);
      throw new Error(`${problems.length} problem(s) — nothing written`);
    }
    if (!f.apply) {
      console.log(
        `\nDRY RUN — nothing written. To apply: --apply --confirm-host ${dest.host}${toProduction ? " --production" : ""}`,
      );
      return;
    }

    // 1. Objects first, so no row ever points at something absent.
    let copied = 0;
    await inBatches(toCopy, 4, async ({ key, contentType }) => {
      const bytes = await withRetry(`GET source ${key}`, () => sourceStorage.getObject(key));
      if (!bytes) throw new Error(`object vanished from source: ${key}`);
      await withRetry(`PUT destination ${key}`, () =>
        destStorage.putObject(key, bytes, contentType),
      );
      copied++;
    });
    console.log(`\nimage objects copied: ${copied}`);

    // 2. Rows, parents first.
    await writePlan(dst as unknown as Record<string, Delegate>, diffs, (m) =>
      console.log(`${m}: written`),
    );
    console.log("\nAPPLIED. Re-run without --apply: it should report nothing to create or update.");
  } finally {
    await Promise.all([src.$disconnect(), dst.$disconnect()]);
  }
}

if (process.argv[1]?.endsWith("catalogue-copy-staging-to-production.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
