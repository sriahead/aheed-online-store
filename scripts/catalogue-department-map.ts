import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { csvLines, parseCsvLine } from "@/lib/reference-data/csv";
import { readVar } from "./aheed-data-inventory";
import { csvField, mapLine, normalise, type DepartmentRules } from "./lib/department-map";
import { readSourceGrid } from "./lib/read-spreadsheet";

/**
 * Aheed catalogue S1b (#1330) — move imported products out of the till's catch-all departments
 * (Groceries 3,229, DEFAULT 1,060) into the store's real departments, through a REVIEWED mapping.
 *
 *   propose: npx tsx scripts/catalogue-department-map.ts propose <secrets file> <URL key> \
 *              --vendor-slug <slug> --source docs/StockList.xls --rules prisma/manifests/aheed-department-map.json \
 *              [--out .import-reports/department-map-review.csv]
 *   apply:   npx tsx scripts/catalogue-department-map.ts apply <secrets file> <URL key> \
 *              --vendor-slug <slug> --rules <rules.json> --map <reviewed.csv> \
 *              [--apply --confirm-host <db host> [--production]]
 *
 * `propose` only reads (the client's file and the database) and writes a review CSV outside the
 * repository: PLU, name, current category, till department, till sub-department, proposed target,
 * rule. The owner may edit the `proposed` column. `apply` moves each product whose `proposed` is a
 * category slug different from its current one, creating a missing category from the rules'
 * `newCategories` INACTIVE. It writes `Product.categoryId` and nothing else. Dry run by default;
 * `--apply` needs `--confirm-host`; a production secrets file also needs `--production`.
 */

export const CSV_HEADER = [
  "plu",
  "name",
  "current",
  "till_department",
  "till_sub_department",
  "proposed",
  "rule",
] as const;

/** PLU → (department, sub-department) from the client's stock export. */
export function tillLinesByPlu(
  grid: readonly (readonly string[])[],
): Map<string, { dept: string; sub: string }> {
  const h = grid.findIndex(
    (r) => r.some((c) => normalise(c) === "PLU") && r.some((c) => normalise(c) === "DEPT"),
  );
  if (h < 0) throw new Error("no header row with PLU and Dept in the source file");
  const head = grid[h].map(normalise);
  const iPlu = head.indexOf("PLU");
  const iDept = head.indexOf("DEPT");
  const iSub = head.indexOf("SUBDEPT");
  const out = new Map<string, { dept: string; sub: string }>();
  for (const r of grid.slice(h + 1)) {
    const plu = String(r[iPlu] ?? "").trim();
    if (plu)
      out.set(plu, {
        dept: String(r[iDept] ?? "").trim(),
        sub: iSub >= 0 ? String(r[iSub] ?? "").trim() : "",
      });
  }
  return out;
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    mode: argv[0],
    file: argv[1],
    key: argv[2],
    vendorSlug: at("--vendor-slug"),
    source: at("--source"),
    rulesPath: at("--rules"),
    out: at("--out") ?? ".import-reports/department-map-review.csv",
    map: at("--map"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (
    !["propose", "apply"].includes(f.mode ?? "") ||
    !f.file ||
    !f.key ||
    !f.vendorSlug ||
    !f.rulesPath
  ) {
    throw new Error("usage: see the header of scripts/catalogue-department-map.ts");
  }
  const rules = JSON.parse(readFileSync(f.rulesPath, "utf8")) as DepartmentRules;
  const url = readVar(f.file, f.key);
  if (!url) throw new Error(`${f.key} not found in ${f.file}`);
  const host = new URL(url).hostname;
  console.log(`database host: ${host}`);

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const vendor = await p.vendor.findUnique({
      where: { slug: f.vendorSlug },
      select: { id: true },
    });
    if (!vendor) throw new Error(`no vendor with slug ${f.vendorSlug}`);
    const categories = await p.category.findMany({
      where: { vendorId: vendor.id },
      select: { id: true, slug: true, name: true },
    });
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    if (f.mode === "propose") {
      if (!f.source) throw new Error("propose needs --source <stock file>");
      const till = tillLinesByPlu(readSourceGrid(f.source).grid);
      const products = await p.product.findMany({
        where: { vendorId: vendor.id },
        select: { plu: true, name: true, category: { select: { slug: true, name: true } } },
        orderBy: { name: "asc" },
      });
      const lines = [CSV_HEADER.join(",")];
      const summary: Record<string, number> = {};
      for (const prod of products) {
        const t = prod.plu ? till.get(prod.plu) : undefined;
        const dept = t?.dept ?? prod.category.name;
        const sub = t?.sub ?? "";
        const m = t
          ? mapLine(dept, sub, prod.name, rules)
          : { target: "keep", rule: "no line in the source file" };
        const proposed = m.target === prod.category.slug ? "keep" : m.target;
        summary[proposed] = (summary[proposed] ?? 0) + 1;
        lines.push(
          [prod.plu, prod.name, prod.category.slug, dept, sub, proposed, m.rule]
            .map(csvField)
            .join(","),
        );
      }
      mkdirSync(dirname(f.out), { recursive: true });
      writeFileSync(f.out, lines.join("\n") + "\n", "utf8");
      console.log(`\nproducts: ${products.length}; review CSV: ${f.out}`);
      for (const [target, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
        const known =
          target === "keep" || target === "review" || bySlug.has(target)
            ? ""
            : "  (new, created inactive)";
        console.log(`  ${n.toString().padStart(5)}  ${target}${known}`);
      }
      return;
    }

    // apply
    if (!f.map) throw new Error("apply needs --map <reviewed CSV>");
    console.log(f.apply ? "MODE: APPLY" : "MODE: dry run (writes nothing)");
    if (f.apply && f.confirmHost !== host) {
      throw new Error(`--apply needs --confirm-host ${host} (got ${f.confirmHost ?? "nothing"})`);
    }
    if (f.apply && /production/i.test(f.file) && !f.production) {
      throw new Error("REFUSED: a production secrets file also needs --production (staging first)");
    }
    const rows = [...csvLines(readFileSync(f.map, "utf8"))].map(parseCsvLine);
    const head = rows[0].map((c) => c.trim());
    const iPlu = head.indexOf("plu");
    const iProposed = head.indexOf("proposed");
    if (iPlu < 0 || iProposed < 0) throw new Error("the map CSV needs plu and proposed columns");
    const wanted = new Map<string, string>();
    for (const r of rows.slice(1)) {
      const plu = (r[iPlu] ?? "").trim();
      const target = (r[iProposed] ?? "").trim();
      if (plu && target && target !== "keep" && target !== "review") wanted.set(plu, target);
    }
    const unknown = [...new Set(wanted.values())].filter(
      (s) => !bySlug.has(s) && !rules.newCategories[s],
    );
    if (unknown.length) throw new Error(`unknown target slug(s) in the CSV: ${unknown.join(", ")}`);

    const products = await p.product.findMany({
      where: { vendorId: vendor.id, plu: { in: [...wanted.keys()] } },
      select: { id: true, plu: true, categoryId: true },
    });
    const byTarget = new Map<string, string[]>();
    for (const prod of products) {
      const target = wanted.get(prod.plu!)!;
      if (bySlug.get(target)?.id === prod.categoryId) continue;
      byTarget.set(target, [...(byTarget.get(target) ?? []), prod.id]);
    }
    const toCreate = [...byTarget.keys()].filter((s) => !bySlug.has(s));
    console.log(
      `\nproducts to move: ${[...byTarget.values()].reduce((n, ids) => n + ids.length, 0)}`,
    );
    for (const [target, ids] of [...byTarget].sort((a, b) => b[1].length - a[1].length)) {
      console.log(
        `  ${ids.length.toString().padStart(5)}  → ${target}${bySlug.has(target) ? "" : " (new, inactive)"}`,
      );
    }
    if (!f.apply) {
      console.log(`\ndry run only. To apply: --apply --confirm-host ${host}`);
      return;
    }
    for (const slug of toCreate) {
      const def = rules.newCategories[slug];
      const parentId = def.parent ? (bySlug.get(def.parent)?.id ?? null) : null;
      if (def.parent && !parentId)
        throw new Error(`parent ${def.parent} of ${slug} does not exist`);
      const created = await p.category.create({
        data: { vendorId: vendor.id, slug, name: def.name, parentId, isActive: false },
        select: { id: true, slug: true, name: true },
      });
      bySlug.set(slug, created);
    }
    let moved = 0;
    for (const [target, ids] of byTarget) {
      const categoryId = bySlug.get(target)!.id;
      const r = await p.$transaction((tx) =>
        tx.product.updateMany({
          where: { vendorId: vendor.id, id: { in: ids } },
          data: { categoryId },
        }),
      );
      moved += r.count;
    }
    console.log(
      `\nAPPLIED: ${toCreate.length} category(ies) created inactive, ${moved} product(s) moved`,
    );
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-department-map.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
