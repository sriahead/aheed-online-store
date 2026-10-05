/**
 * Live proof for specs/2026-10-05-p955-996-994-crawlability/ (#955, #996).
 *
 *   npm run preview          # in one terminal — NOT `npm run dev`
 *   npx tsx scripts/verify-crawlability.ts
 *
 * DEV DATABASE ONLY, and READ-ONLY: it counts rows and fetches routes, writing nothing. It still
 * refuses to run unless DATABASE_URL points at the dev endpoint named below, so a copy-pasted
 * command can never read production by accident.
 *
 * WHY A SCRIPT AND NOT ONLY UNIT TESTS. Every interesting property of this slice is a property of
 * the SERVED DOCUMENT on a SPECIFIC HOST, and neither half survives mocking:
 *
 *  - `app/sitemap.ts` and `app/robots.ts` are Route Handlers that Next caches by default unless
 *    they read a request-time API. A unit test calling the exported function cannot tell a dynamic
 *    route from one that was evaluated once at build time with a single vendor's host baked in —
 *    which is the exact multi-tenancy defect #955 fixes, so the one thing most worth proving is
 *    the thing a unit test structurally cannot see.
 *  - `#955`'s robots defect was INVISIBLE on the first vendor's host by construction. Checking one
 *    host is how it survived to production.
 *
 * So this fetches both vendors' real documents from a running Worker and compares them against row
 * counts read from the database, rather than against each other.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

const DEV_ENDPOINT = "ep-dry-morning-zab7dx08";

/**
 * Both vendor hosts under `npm run preview`. SriMart is reached at a PORT-CARRYING host, which is
 * the `VendorDomain` row #514 added precisely so a second vendor is reachable locally.
 */
const HOSTS = [
  { label: "Aheed", origin: "http://localhost:8787", host: "localhost:8787" },
  { label: "SriMart", origin: "http://srimart.localhost:8787", host: "srimart.localhost:8787" },
];

const STATIC_PATHS = ["/", "/categories", "/bundles", "/help", "/privacy", "/terms"];

const EXCLUDED_PREFIXES = [
  "/account",
  "/cart",
  "/checkout",
  "/login",
  "/register",
  "/search",
  "/dev",
  "/orders",
  "/feedback",
  "/shop-your-list",
  "/forgot-password",
  "/reset-password",
];

const DISALLOW_PATHS = ["/account", "/cart", "/checkout", "/orders/lookup", "/dev"];

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function fetchText(
  url: string,
  host: string,
): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(url, { headers: { host } });
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes(DEV_ENDPOINT)) {
    console.error(
      `Refusing to run: DATABASE_URL does not point at the dev endpoint ${DEV_ENDPOINT}.`,
    );
    process.exit(2);
  }

  // Same two-argument form scripts/verify-delivery-areas.ts uses; reads only, so the HTTP
  // adapter is correct here (no interactive transaction, no createMany/updateMany).
  const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(databaseUrl, {}) });

  const productSlugsByHost = new Map<string, Set<string>>();

  for (const { label, origin, host } of HOSTS) {
    console.log(`\n--- ${label} (${host}) ---`);

    const domain = await prisma.vendorDomain.findUnique({
      where: { host },
      select: { vendorId: true },
    });
    if (!domain) {
      check(
        `${label}: VendorDomain row exists for ${host}`,
        false,
        "seed it before trusting any row below",
      );
      continue;
    }
    const vendorId = domain.vendorId;

    const [activeProducts, activeCategories] = await Promise.all([
      prisma.product.findMany({ where: { vendorId, isActive: true }, select: { slug: true } }),
      prisma.category.findMany({ where: { vendorId, isActive: true }, select: { slug: true } }),
    ]);

    // ---- sitemap ----------------------------------------------------------
    const sitemap = await fetchText(`${origin}/sitemap.xml`, host);
    check(
      `R7  ${label}: /sitemap.xml is 200 XML with a <urlset>`,
      sitemap.status === 200 &&
        sitemap.contentType.includes("xml") &&
        sitemap.body.includes("<urlset"),
      `status=${sitemap.status} type=${sitemap.contentType}`,
    );

    const urls = locs(sitemap.body);
    const paths = urls.map((url) => new URL(url).pathname);

    const productPaths = paths.filter((p) => p.startsWith("/products/"));
    const expectedProducts = new Set(activeProducts.map((p) => `/products/${p.slug}`));
    check(
      `R8  ${label}: every active product is listed, and only those`,
      productPaths.length === expectedProducts.size &&
        productPaths.every((p) => expectedProducts.has(p)),
      `sitemap=${productPaths.length} db=${expectedProducts.size}`,
    );

    const categoryPaths = paths.filter((p) => p.startsWith("/categories/"));
    const expectedCategories = new Set(activeCategories.map((c) => `/categories/${c.slug}`));
    check(
      `R9  ${label}: every active category is listed, and only those`,
      categoryPaths.length === expectedCategories.size &&
        categoryPaths.every((p) => expectedCategories.has(p)),
      `sitemap=${categoryPaths.length} db=${expectedCategories.size}`,
    );

    const otherPaths = paths.filter(
      (p) => !p.startsWith("/products/") && !p.startsWith("/categories/"),
    );
    check(
      `R10 ${label}: exactly the six static paths, nothing else`,
      otherPaths.length === STATIC_PATHS.length &&
        STATIC_PATHS.every((p) => otherPaths.includes(p)),
      `got ${JSON.stringify(otherPaths)}`,
    );

    const leaked = paths.filter((p) =>
      EXCLUDED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`)),
    );
    check(
      `R11 ${label}: no signed-in/transactional/dev path is listed`,
      leaked.length === 0,
      `got ${JSON.stringify(leaked)}`,
    );

    check(
      `R12 ${label}: every <loc> is on the requesting host`,
      urls.length > 0 && urls.every((url) => url.startsWith(`https://${host}/`)),
      `${urls.length} urls`,
    );
    check(
      `R14 ${label}: no vendor hostname literal leaked into the document`,
      !sitemap.body.includes("nocaped.com"),
    );
    check(`R13 ${label}: no <lastmod> anywhere`, !sitemap.body.includes("<lastmod>"));

    productSlugsByHost.set(host, new Set(activeProducts.map((p) => p.slug)));

    // ---- robots -----------------------------------------------------------
    const robots = await fetchText(`${origin}/robots.txt`, host);
    const indexable = robots.body.includes("Allow: /");
    check(
      `R20 ${label}: robots.txt allows crawling and names THIS host's sitemap`,
      indexable && robots.body.includes(`Sitemap: https://${host}/sitemap.xml`),
      indexable
        ? "allowed"
        : 'not indexable — set SEO_INDEXABLE="true" in .dev.vars and restart preview (R21 covers the off state)',
    );
    if (indexable) {
      const missing = DISALLOW_PATHS.filter((p) => !robots.body.includes(`Disallow: ${p}`));
      check(
        `R22 ${label}: robots.txt disallows the non-indexable paths`,
        missing.length === 0,
        `missing ${JSON.stringify(missing)}`,
      );
    }

    // ---- per-page metadata (#996) ----------------------------------------
    const homeTitle =
      (await fetchText(origin, host)).body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";

    const sampleProducts = activeProducts.slice(0, 2);
    const productTitles: string[] = [];
    for (const { slug } of sampleProducts) {
      const page = await fetchText(`${origin}/products/${slug}`, host);
      const title = page.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      const description = page.body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      const canonical = page.body.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "";
      productTitles.push(title);

      const record = await prisma.product.findFirst({
        where: { slug, vendorId },
        select: { name: true, description: true },
      });

      check(
        `R25 ${label}/${slug}: <title> names the product and differs from the homepage's`,
        !!record && title.includes(record.name) && title !== homeTitle,
        `title=${JSON.stringify(title)}`,
      );
      check(
        `R26 ${label}/${slug}: description derives from the product's own column, <=160 chars`,
        description.length > 0 &&
          description.length <= 160 &&
          !!record &&
          record.description.replace(/\s+/g, " ").trim().startsWith(description.replace(/…$/, "")),
        `len=${description.length}`,
      );
      check(
        `R27 ${label}/${slug}: canonical is absolute and on the requesting host`,
        canonical === `https://${host}/products/${slug}`,
        `canonical=${JSON.stringify(canonical)}`,
      );
    }
    if (productTitles.length >= 2) {
      check(
        `R28 ${label}: two products have two different <title> values`,
        productTitles[0] !== productTitles[1],
        `${JSON.stringify(productTitles)}`,
      );
    } else {
      check(
        `R28 ${label}: two products available to compare`,
        false,
        "seed a second active product",
      );
    }

    const sampleCategory = activeCategories[0];
    if (sampleCategory) {
      const page = await fetchText(`${origin}/categories/${sampleCategory.slug}`, host);
      const title = page.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      const description = page.body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      const canonical = page.body.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "";
      const record = await prisma.category.findFirst({
        where: { slug: sampleCategory.slug, vendorId },
        select: { name: true },
      });

      check(
        `R29 ${label}/${sampleCategory.slug}: category <head> carries its own title, description and canonical`,
        !!record &&
          title.includes(record.name) &&
          title !== homeTitle &&
          description.length > 0 &&
          description.length <= 160 &&
          canonical === `https://${host}/categories/${sampleCategory.slug}`,
        `title=${JSON.stringify(title)} canonical=${JSON.stringify(canonical)}`,
      );

      // R3 — the card anchor, measured on a real listing page. PAGE_SIZE is 12, so a category
      // with more products shows exactly 12 links on page 1, not all of them.
      const productCount = await prisma.product.count({
        where: { vendorId, isActive: true, category: { slug: sampleCategory.slug } },
      });
      const hrefs = new Set(
        [...page.body.matchAll(/href="(\/products\/[^"]+)"/g)].map((m) => m[1]),
      );
      const expected = Math.min(12, productCount);
      check(
        `R3  ${label}/${sampleCategory.slug}: listing links to each product card's page`,
        expected > 0 && hrefs.size === expected,
        `hrefs=${hrefs.size} expected=${expected} (category holds ${productCount} active)`,
      );
      check(
        `R4  ${label}/${sampleCategory.slug}: the title anchor is not stretched over the card`,
        !page.body.includes("after:inset-0"),
      );
    } else {
      check(`R3  ${label}: a category exists to check`, false, "seed a category");
    }
  }

  // ---- cross-host isolation (R12's second half) ---------------------------
  const [first, second] = HOSTS.map((h) => productSlugsByHost.get(h.host));
  if (first && second) {
    const shared = [...first].filter((slug) => second.has(slug));
    // Reported, NOT asserted empty: two vendors may legitimately carry the same slug, and this
    // script cannot know the seed's intent. What matters is that each document lists only its own
    // vendor's slugs, which R8 already asserts per host against the database.
    console.log(
      `\nNOTE  slugs present in BOTH vendors' catalogues: ${shared.length}${shared.length ? ` — ${JSON.stringify(shared.slice(0, 5))}` : ""}`,
    );
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
