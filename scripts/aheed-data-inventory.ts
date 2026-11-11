import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { DEMO_EMAILS, LEGACY_DEMO_EMAILS } from "./lib/demo-roster";

/**
 * #1504 — READ-ONLY data inventory of one database, per vendor, before Aheed Food Centre goes live
 * on its own cell (part of #1337).
 *
 *   npx tsx scripts/aheed-data-inventory.ts <secrets file> <URL key> [--images]
 *   e.g. secrets/afc-production.vars AFC_DIRECT_URL --images
 *        secrets/merqify-production.vars DIRECT_URL
 *
 * Prints COUNTS only — no names, emails, addresses or order contents — so the output can be pasted
 * into an issue. Every query is a count or a key read; nothing is written. `--images` also sends a
 * HEAD request for every product, bundle and category image key to the file's CDN_BASE_URL and reports how many
 * are missing, which proves the catalogue's images exist in the cell's own bucket.
 *
 * Runs in Node via tsx, so it uses the bare `@prisma/client` with the HTTP adapter (the same one
 * `getPrisma()` uses at runtime). Production reads go through the owner (auto mode blocks them).
 */

/** A key's value from a secrets file; tolerates `KEY=value` and the spaced `KEY = value` form (#505). */
export function readVar(file: string, key: string): string | undefined {
  return parseVar(readFileSync(file, "utf8"), key);
}

export function parseVar(text: string, key: string): string | undefined {
  const line = text.split(/\r?\n/).find((l) => l.includes("=") && l.split("=")[0].trim() === key);
  return line
    ?.slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

/** The part after `@`, or "(none)" — a sender address is reported by domain only. */
export function emailDomain(email: string | null | undefined): string {
  const at = email?.lastIndexOf("@") ?? -1;
  return email && at > 0 ? email.slice(at + 1).toLowerCase() : "(none)";
}

/** A Stripe reference's mode, from its prefix (`cs_test_…`, `cs_live_…`); "other" if it carries none. */
export function stripeMode(ref: string | null): "test" | "live" | "none" | "other" {
  if (!ref) return "none";
  if (/^[a-z]+_test_/.test(ref)) return "test";
  if (/^[a-z]+_live_/.test(ref)) return "live";
  return "other";
}

function tally<T extends string>(values: readonly T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

async function countMissing(cdnBase: string, keys: readonly string[]): Promise<number> {
  let missing = 0;
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      const res = await fetch(`${cdnBase.replace(/\/$/, "")}/${key}`, { method: "HEAD" }).catch(
        () => null,
      );
      if (!res || !res.ok) missing += 1;
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return missing;
}

async function main() {
  const [file, key] = process.argv.slice(2);
  const checkImages = process.argv.includes("--images");
  if (!file || !key)
    throw new Error("usage: aheed-data-inventory.ts <secrets file> <URL key> [--images]");
  const url = readVar(file, key);
  if (!url) throw new Error(`${key} not found in ${file}`);
  console.log(`database host: ${new URL(url).hostname}`);

  const demo = new Set([...DEMO_EMAILS, ...LEGACY_DEMO_EMAILS].map((e) => e.toLowerCase()));
  const p = new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
  try {
    const users = await p.user.findMany({ select: { id: true, email: true, role: true } });
    const isDemo = new Map(users.map((u) => [u.id, demo.has(u.email.toLowerCase())]));
    console.log(
      `users: ${users.length} (demo ${users.filter((u) => isDemo.get(u.id)).length}, other ${
        users.filter((u) => !isDemo.get(u.id)).length
      }; platform admins ${users.filter((u) => u.role === "ADMIN").length})`,
    );

    const vendors = await p.vendor.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slug: true,
        status: true,
        domains: { select: { host: true, isCanonical: true } },
        config: { select: { senderEmail: true } },
      },
    });
    const imageKeys: string[] = [];

    for (const v of vendors) {
      const where = { vendorId: v.id };
      const [products, activeProducts, categories, bundles, images, memberships, orders, payments] =
        await Promise.all([
          p.product.count({ where }),
          p.product.count({ where: { ...where, isActive: true } }),
          p.category.findMany({ where, select: { imageKey: true } }),
          p.bundle.findMany({ where, select: { imageKey: true } }),
          p.productImage.findMany({ where: { product: where }, select: { storageKey: true } }),
          p.vendorMembership.findMany({ where, select: { userId: true, role: true } }),
          p.order.findMany({ where, select: { status: true, userId: true, guestEmail: true } }),
          p.payment.findMany({ where, select: { status: true, providerReference: true } }),
        ]);

      const customers = new Set(orders.filter((o) => o.userId).map((o) => o.userId!));
      const realCustomers = [...customers].filter((id) => !isDemo.get(id)).length;
      console.log(`\n== vendor ${v.slug} (${v.status})`);
      console.log(
        `  domains: ${v.domains.map((d) => d.host + (d.isCanonical ? "*" : "")).join(", ") || "(none)"}`,
      );
      console.log(`  sender email domain: ${emailDomain(v.config?.senderEmail)}`);
      console.log(
        `  products: ${products} (active ${activeProducts}); categories: ${categories.length}; bundles: ${bundles.length}`,
      );
      console.log(
        `  product images: ${images.length}; bundle images: ${bundles.filter((b) => b.imageKey).length}; category images: ${categories.filter((c) => c.imageKey).length}`,
      );
      console.log(
        `  staff/admin memberships: ${JSON.stringify(
          tally(memberships.map((m) => `${m.role}${isDemo.get(m.userId) ? "(demo)" : ""}`)),
        )}`,
      );
      console.log(
        `  orders: ${orders.length} ${JSON.stringify(tally(orders.map((o) => o.status)))}`,
      );
      console.log(
        `  ordering customers: signed-in ${customers.size} (non-demo ${realCustomers}); guest orders ${
          orders.filter((o) => !o.userId && o.guestEmail).length
        }`,
      );
      console.log(
        `  payments: ${payments.length} by mode ${JSON.stringify(
          tally(payments.map((x) => stripeMode(x.providerReference))),
        )} by status ${JSON.stringify(tally(payments.map((x) => x.status)))}`,
      );
      imageKeys.push(
        ...images.map((i) => i.storageKey),
        ...bundles.flatMap((b) => (b.imageKey ? [b.imageKey] : [])),
        ...categories.flatMap((c) => (c.imageKey ? [c.imageKey] : [])),
      );
    }

    if (checkImages) {
      const cdn = readVar(file, "CDN_BASE_URL");
      if (!cdn) throw new Error(`--images needs CDN_BASE_URL in ${file}`);
      const unique = [...new Set(imageKeys)];
      const missing = await countMissing(cdn, unique);
      console.log(
        `\nimages on ${new URL(cdn).hostname}: ${unique.length} keys checked, ${missing} missing`,
      );
    }
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("aheed-data-inventory.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
