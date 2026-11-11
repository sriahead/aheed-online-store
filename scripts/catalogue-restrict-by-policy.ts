import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { DEFAULT_ADR007_POLICY } from "@/lib/catalogue-import/default-profile";
import { normaliseDepartment } from "@/lib/catalogue-import-policy";
import { severity, type ProductRestriction } from "@/lib/product-restriction";
import { setProductRestriction } from "@/lib/repositories/product-restrictions";
import { readVar } from "./aheed-data-inventory";

/**
 * #1200 / Aheed catalogue S1c — restrict a cell's EXISTING products that ADR-007's department policy
 * should have restricted at import, and flag restricted-looking names for a person's review.
 *
 *   npx tsx scripts/catalogue-restrict-by-policy.ts <secrets file> <URL key> --vendor-slug <slug>
 *   npx tsx scripts/catalogue-restrict-by-policy.ts … --apply --confirm-host <db host> [--production]
 *
 * The 2026-11-07 Aheed import (scripts/import-catalogue-batch.ts) bypassed the policy, so TOBACCO,
 * ALCOHOL, INSTANT LOTTERY, PHONE CARDS, NEWS, E-PAY and STAMPS arrived unrestricted. This applies
 * `DEFAULT_ADR007_POLICY.byDepartment` by each product's category (or parent category) name, and
 * marks NEEDS_REVIEW any product in an uncertain department (DEFAULT, MISC, …) whose NAME matches a
 * restricted-goods keyword — DEFAULT holds 1,060 lines, so the department alone is not a guarantee.
 *
 * Every change goes through `setProductRestriction` (source IMPORT): it only ever tightens, switches
 * the product off, and writes the append-only audit row (#1211). Dry run by default. `--apply`
 * needs `--confirm-host`; a secrets file whose name says "production" also needs `--production`,
 * because S1 runs on staging first and reaches production only after the owner approves it.
 */

/** Restricted-goods name keywords, by family. Matched on whole words against the upper-cased name. */
export const RESTRICTED_NAME_KEYWORDS: readonly {
  family: string;
  restriction: ProductRestriction;
  pattern: RegExp;
}[] = [
  {
    family: "tobacco",
    restriction: "NEEDS_REVIEW",
    pattern:
      /\b(TOBACCO|CIGARETTES?|CIGARS?|CIGARILLOS?|RIZLA|SHISHA|HOOKAH|VAPES?|E-?LIQUID|SNUFF)\b/,
  },
  {
    family: "alcohol",
    restriction: "NEEDS_REVIEW",
    pattern:
      // "CIDER VINEGAR", "WINE VINEGAR" and "WINE LEAVES" (vine leaves) are groceries, not alcohol.
      /\b(BEERS?|LAGER|ALE|STOUT|CIDER(?! VINEGAR)|WINES?(?! VINEGAR| LEAVES)|VODKA|WHISK(E)?Y|RUM|GIN|BRANDY|TEQUILA|STELLA|CARLING|BUDWEISER|COBRA BEER)\b/,
  },
  {
    family: "lottery",
    restriction: "NEEDS_REVIEW",
    pattern: /\b(LOTTO|LOTTERY|SCRATCH ?CARDS?|EUROMILLIONS)\b/,
  },
  {
    family: "phone or top-up card",
    restriction: "NEEDS_REVIEW",
    pattern:
      /\b(PHONE ?CARDS?|TOP ?UP|E-?PAY|LYCA|LEBARA|VECTONE|CALLING ?CARDS?|\d+(\.\d+)?G PHONE)\b/,
  },
  { family: "stamps", restriction: "NEEDS_REVIEW", pattern: /\b(STAMPS?|POSTAGE)\b/ },
  {
    family: "blades",
    restriction: "NEEDS_REVIEW",
    pattern: /\b(KNIF(E|VES)|BLADES?|RAZOR BLADES?|CUTTERS?|MACHETE)\b/,
  },
  {
    family: "lighter or gas refill",
    restriction: "NEEDS_REVIEW",
    pattern: /\b(LIGHTERS?|BUTANE|GAS REFILLS?|LIGHTER FUEL)\b/,
  },
];

/** The keyword family a product name matches, or null. */
export function matchRestrictedName(
  name: string,
): (typeof RESTRICTED_NAME_KEYWORDS)[number] | null {
  const upper = normaliseDepartment(name);
  return RESTRICTED_NAME_KEYWORDS.find((k) => k.pattern.test(upper)) ?? null;
}

/** The restriction ADR-007's department policy gives a product, from its category names. */
export function policyRestriction(categoryNames: readonly string[]): {
  restriction: ProductRestriction;
  department: string;
} | null {
  for (const name of categoryNames) {
    const department = normaliseDepartment(name);
    const restriction = DEFAULT_ADR007_POLICY.byDepartment[department];
    if (restriction) return { restriction, department };
  }
  return null;
}

/** True when the product sits in a department the policy calls uncertain (DEFAULT, MISC, …). */
export function inUncertainDepartment(categoryNames: readonly string[]): boolean {
  const uncertain = new Set(DEFAULT_ADR007_POLICY.uncertainDepartments.map(normaliseDepartment));
  return categoryNames.some((n) => uncertain.has(normaliseDepartment(n)));
}

export function parseArgs(argv: readonly string[]) {
  const [file, key] = argv;
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file,
    key,
    vendorSlug: at("--vendor-slug"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
    softenPlus: new Set(
      (at("--soften-plu") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  };
}

/**
 * PROHIBITED and AGE_RESTRICTED are HARD blocks: nothing in the application can ever clear them
 * (`isHardBlock`). The till files some food under those departments (e.g. a dried shrimp under
 * INSTANT LOTTERY), so a person reviews the hard-block lines first and names the misfiled ones with
 * `--soften-plu`; those get NEEDS_REVIEW instead, which an admin can clear once the line is moved.
 */
export function softened(
  to: ProductRestriction,
  plu: string | null,
  softenPlus: ReadonlySet<string>,
): ProductRestriction {
  return plu !== null && softenPlus.has(plu) ? "NEEDS_REVIEW" : to;
}

async function main() {
  const { file, key, vendorSlug, apply, production, confirmHost, softenPlus } = parseArgs(
    process.argv.slice(2),
  );
  if (!file || !key || !vendorSlug) {
    throw new Error(
      "usage: catalogue-restrict-by-policy.ts <secrets file> <URL key> --vendor-slug <slug> [--soften-plu <plu,plu>] [--apply --confirm-host <db host> [--production]]",
    );
  }
  const url = readVar(file, key);
  if (!url) throw new Error(`${key} not found in ${file}`);
  const host = new URL(url).hostname;
  console.log(`database host: ${host}`);
  console.log(apply ? "MODE: APPLY" : "MODE: dry run (writes nothing)");
  if (apply && confirmHost !== host) {
    throw new Error(`--apply needs --confirm-host ${host} (got ${confirmHost ?? "nothing"})`);
  }
  if (apply && /production/i.test(file) && !production) {
    throw new Error("REFUSED: a production secrets file also needs --production (staging first)");
  }

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const vendor = await p.vendor.findUnique({ where: { slug: vendorSlug }, select: { id: true } });
    if (!vendor) throw new Error(`no vendor with slug ${vendorSlug}`);
    const products = await p.product.findMany({
      where: { vendorId: vendor.id },
      select: {
        id: true,
        plu: true,
        name: true,
        restriction: true,
        category: { select: { name: true, parent: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    });

    const changes: {
      id: string;
      plu: string | null;
      name: string;
      from: ProductRestriction | null;
      to: ProductRestriction;
      why: string;
    }[] = [];
    for (const prod of products) {
      const names = [
        prod.category.name,
        ...(prod.category.parent ? [prod.category.parent.name] : []),
      ];
      const byDept = policyRestriction(names);
      const byName =
        !byDept && inUncertainDepartment(names) ? matchRestrictedName(prod.name) : null;
      const policyTo = byDept?.restriction ?? byName?.restriction;
      if (!policyTo) continue;
      const to = softened(policyTo, prod.plu, softenPlus);
      if (severity(to) <= severity(prod.restriction)) continue;
      const why =
        (byDept
          ? `ADR-007 department policy: ${byDept.department}`
          : `name keyword: ${byName!.family}`) +
        (to !== policyTo ? ` — softened from ${policyTo} by --soften-plu (misfiled)` : "");
      changes.push({
        id: prod.id,
        plu: prod.plu,
        name: prod.name,
        from: prod.restriction,
        to,
        why,
      });
    }

    const summary: Record<string, number> = {};
    for (const c of changes)
      summary[`${c.to} — ${c.why}`] = (summary[`${c.to} — ${c.why}`] ?? 0) + 1;
    console.log(`\nproducts scanned: ${products.length}; to restrict: ${changes.length}`);
    for (const [k, n] of Object.entries(summary).sort())
      console.log(`  ${n.toString().padStart(4)}  ${k}`);
    console.log("");
    for (const c of changes) {
      console.log(`  PLU ${c.plu ?? "-"}  ${c.name}  ${c.from ?? "none"} → ${c.to}  (${c.why})`);
    }
    if (changes.length === 0) {
      console.log("nothing to restrict");
      return;
    }
    if (!apply) {
      console.log(`\ndry run only. To apply: --apply --confirm-host ${host}`);
      return;
    }

    let changed = 0;
    for (const c of changes) {
      const r = await setProductRestriction(
        p,
        vendor.id,
        c.id,
        c.to,
        null,
        `${c.why} (#1200, S1c)`,
        "IMPORT",
      );
      if (!r.ok) throw new Error(`PLU ${c.plu}: ${r.error}`);
      if (r.changed) changed += 1;
    }
    console.log(`\nAPPLIED: ${changed} product(s) restricted, each with an audit row`);
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-restrict-by-policy.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
