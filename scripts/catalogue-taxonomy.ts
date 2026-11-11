import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { readVar } from "./aheed-data-inventory";

/**
 * Aheed catalogue S1b (#1330) — restructure a cell's categories into a declared department tree
 * (`prisma/manifests/aheed-taxonomy.json`).
 *
 *   npx tsx scripts/catalogue-taxonomy.ts <secrets file> <URL key> --vendor-slug <slug> --taxonomy <json>
 *   … --apply --confirm-host <db host> [--production]
 *
 * Per node, in tree order: an existing category (by slug) is REUSED — renamed, re-parented and
 * re-ordered, keeping its id, images and products; a missing one is created, inactive unless the node
 * says `active: true`. `absorb` moves the products sitting directly in the named categories into the
 * node. Every category the tree does not name is moved under the `archive` node and switched off;
 * one still holding products is refused, so nothing is hidden by accident. Products, prices and
 * restrictions are untouched except for `categoryId` via `absorb`. Dry run by default; `--apply`
 * needs `--confirm-host`; a production secrets file also needs `--production`.
 */

export interface TaxonomyNode {
  slug: string;
  name: string;
  active?: boolean;
  absorb?: string[];
  children?: TaxonomyNode[];
}
export interface Taxonomy {
  archive: { slug: string; name: string };
  departments: TaxonomyNode[];
}

export interface PlannedNode {
  slug: string;
  name: string;
  parentSlug: string | null;
  sortOrder: number;
  active?: boolean;
  absorb: string[];
}

/** The tree flattened parent-first, with sort order and parent slug; throws on a duplicate slug. */
export function flatten(t: Taxonomy): PlannedNode[] {
  const out: PlannedNode[] = [];
  const seen = new Set<string>();
  const visit = (n: TaxonomyNode, parentSlug: string | null, sortOrder: number) => {
    if (seen.has(n.slug)) throw new Error(`slug ${n.slug} appears twice in the taxonomy`);
    seen.add(n.slug);
    out.push({
      slug: n.slug,
      name: n.name,
      parentSlug,
      sortOrder,
      active: n.active,
      absorb: n.absorb ?? [],
    });
    (n.children ?? []).forEach((c, i) => visit(c, n.slug, (i + 1) * 10));
  };
  t.departments.forEach((d, i) => visit(d, null, (i + 1) * 10));
  if (seen.has(t.archive.slug)) throw new Error("the archive slug is also a department");
  return out;
}

/** The naming rule (owner, 2026-11-11): Title Case — every word but "&" starts upper-case, the rest lower. */
export function isTitleCase(name: string): boolean {
  return name
    .split(/\s+/)
    .every((w) => w === "&" || /^[A-Z(][a-z),]*(-[A-Z][a-z]*)*$/.test(w) || /^To$/.test(w));
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file: argv[0],
    key: argv[1],
    vendorSlug: at("--vendor-slug"),
    taxonomyPath: at("--taxonomy"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (!f.file || !f.key || !f.vendorSlug || !f.taxonomyPath) {
    throw new Error("usage: see the header of scripts/catalogue-taxonomy.ts");
  }
  const taxonomy = JSON.parse(readFileSync(f.taxonomyPath, "utf8")) as Taxonomy;
  const plan = flatten(taxonomy);
  const url = readVar(f.file, f.key);
  if (!url) throw new Error(`${f.key} not found in ${f.file}`);
  const host = new URL(url).hostname;
  console.log(`database host: ${host}`);
  console.log(f.apply ? "MODE: APPLY" : "MODE: dry run (writes nothing)");
  if (f.apply && f.confirmHost !== host) {
    throw new Error(`--apply needs --confirm-host ${host} (got ${f.confirmHost ?? "nothing"})`);
  }
  if (f.apply && /production/i.test(f.file) && !f.production) {
    throw new Error("REFUSED: a production secrets file also needs --production (staging first)");
  }

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const vendor = await p.vendor.findUnique({
      where: { slug: f.vendorSlug },
      select: { id: true },
    });
    if (!vendor) throw new Error(`no vendor with slug ${f.vendorSlug}`);
    const vendorId = vendor.id;
    const cats = await p.category.findMany({
      where: { vendorId },
      select: {
        id: true,
        slug: true,
        name: true,
        parentId: true,
        isActive: true,
        _count: { select: { products: true } },
      },
    });
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    const named = new Set([...plan.map((n) => n.slug), taxonomy.archive.slug]);
    const absorbed = new Set(plan.flatMap((n) => n.absorb));
    const toArchive = cats.filter((c) => !named.has(c.slug));
    const blocked = toArchive.filter((c) => c._count.products > 0 && !absorbed.has(c.slug));
    if (blocked.length) {
      throw new Error(
        `REFUSED: these categories are not in the taxonomy but still hold products: ${blocked
          .map((c) => `${c.slug} (${c._count.products})`)
          .join(", ")}`,
      );
    }

    for (const n of plan) {
      const c = bySlug.get(n.slug);
      const moves = n.absorb.map((s) => `${s} (${bySlug.get(s)?._count.products ?? 0})`).join(", ");
      console.log(
        `${n.parentSlug ? "    └ " : ""}${n.name} [${n.slug}] ${c ? (c.name !== n.name ? `rename from "${c.name}"` : "") : "NEW (inactive)"}${moves ? `  absorbs ${moves}` : ""}`,
      );
    }
    console.log(
      `\narchive under "${taxonomy.archive.name}": ${toArchive.map((c) => c.slug).join(", ") || "nothing"}`,
    );
    if (!f.apply) {
      console.log(`\ndry run only. To apply: --apply --confirm-host ${host}`);
      return;
    }

    const idOf = new Map(cats.map((c) => [c.slug, c.id]));
    const upsert = async (
      slug: string,
      name: string,
      parentSlug: string | null,
      sortOrder: number,
      active?: boolean,
    ) => {
      const parentId = parentSlug ? idOf.get(parentSlug)! : null;
      const existing = idOf.get(slug);
      if (existing) {
        await p.category.update({
          where: { id: existing },
          data: {
            name,
            parentId,
            sortOrder,
            ...(active === undefined ? {} : { isActive: active }),
          },
        });
      } else {
        const created = await p.category.create({
          data: { vendorId, slug, name, parentId, sortOrder, isActive: active ?? false },
          select: { id: true },
        });
        idOf.set(slug, created.id);
      }
    };
    for (const n of plan) await upsert(n.slug, n.name, n.parentSlug, n.sortOrder, n.active);
    await upsert(taxonomy.archive.slug, taxonomy.archive.name, null, 9999, false);

    let moved = 0;
    for (const n of plan) {
      for (const from of n.absorb) {
        const fromId = idOf.get(from);
        if (!fromId || from === n.slug) continue;
        const r = await p.$transaction((tx) =>
          tx.product.updateMany({
            where: { vendorId, categoryId: fromId },
            data: { categoryId: idOf.get(n.slug)! },
          }),
        );
        moved += r.count;
      }
    }
    const archiveId = idOf.get(taxonomy.archive.slug)!;
    for (const c of toArchive) {
      await p.category.update({
        where: { id: c.id },
        data: { parentId: archiveId, isActive: false },
      });
    }
    console.log(
      `\nAPPLIED: ${plan.length} departments/sub-departments set, ${moved} product(s) absorbed, ${toArchive.length} archived`,
    );
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-taxonomy.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
