import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { listCategorySpotlights } from "@/lib/repositories/products";
import { listTopLevelCategories } from "@/lib/repositories/categories";
import type { getPrisma } from "@/lib/db";

/**
 * #1096 validation harness — proves what
 * `specs/2026-10-14-p1096-1030-department-spotlights/requirements.md` asserts against REAL Postgres.
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its clients from the bare `@prisma/client`, like
 * `scripts/verify-referral-code-integrity.ts`. The code under test runs on `PrismaNeonHttp` — the
 * adapter `getPrisma()` uses at runtime — because `product.groupBy` over that adapter is exactly
 * what an in-memory double cannot vouch for. Fixture writes use the WebSocket adapter.
 *
 * Usage:
 *   npx tsx scripts/verify-department-spotlights.ts fixture
 *     R9. Writes a throwaway vendor to `.env`'s database (which must be DEV — compare it against
 *     `secrets/*.vars` first), checks each case, and deletes every row it created before exiting,
 *     including after a failed check. Leftovers from an interrupted run are removed first.
 *   npx tsx scripts/verify-department-spotlights.ts expected <vendor-slug>
 *     R10. READ-ONLY. Prints each active department of that vendor, in `sortOrder`, with the
 *     spotlight product name `listCategorySpotlights` returns, or `(none)`.
 */

const FIXTURE_SLUG_PREFIX = "p1096-fixture-";

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env against secrets/*.vars");
  return url;
}

const httpClient = (url: string) => new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
const wsClient = (url: string) =>
  new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

/** The repository takes the runtime client type; the bare and wasm clients share one shape. */
const asRuntime = (client: PrismaClient) => client as unknown as ReturnType<typeof getPrisma>;

async function removeFixtures(ws: PrismaClient): Promise<void> {
  const vendors = await ws.vendor.findMany({
    where: { slug: { startsWith: FIXTURE_SLUG_PREFIX } },
    select: { id: true },
  });
  for (const { id } of vendors) {
    await ws.product.deleteMany({ where: { vendorId: id } });
    // Children before parents: `Category.parentId` is a foreign key. Three levels at most.
    for (let pass = 0; pass < 3; pass += 1) {
      const leaves = await ws.category.findMany({
        where: { vendorId: id, children: { none: {} } },
        select: { id: true },
      });
      if (leaves.length === 0) break;
      await ws.category.deleteMany({ where: { id: { in: leaves.map((leaf) => leaf.id) } } });
    }
    await ws.vendor.delete({ where: { id } });
  }
}

const minute = (m: number) => new Date(Date.UTC(2026, 0, 1, 12, m));

async function fixture(): Promise<void> {
  const url = databaseUrl();
  const ws = wsClient(url);
  const http = httpClient(url);

  try {
    await removeFixtures(ws);

    const vendor = await ws.vendor.create({
      data: { slug: `${FIXTURE_SLUG_PREFIX}${crypto.randomUUID()}`, name: "p1096 fixture" },
    });
    const vendorId = vendor.id;

    const categoryIds = new Map<string, string>();
    const addCategory = async (slug: string, parent: string | null, isActive = true) => {
      const row = await ws.category.create({
        data: {
          vendorId,
          slug,
          name: slug,
          isActive,
          parentId: parent ? categoryIds.get(parent) : null,
        },
      });
      categoryIds.set(slug, row.id);
    };

    // Seven departments: the old `take: departments x 4` window was 28 rows.
    for (const slug of ["a", "b", "c", "d", "e", "f", "g"]) await addCategory(slug, null);
    await addCategory("c-child", "c");
    await addCategory("d-child-off", "d", false);
    await addCategory("e-child", "e");
    await addCategory("e-grandchild", "e-child");
    await addCategory("g-child", "g");

    const products: {
      slug: string;
      category: string;
      at: number;
      isFeatured?: boolean;
      isActive?: boolean;
    }[] = [
      // Starvation: thirty featured, newer products in A outnumber the whole old window.
      ...Array.from({ length: 30 }, (_, i) => ({
        slug: `a-${String(i).padStart(2, "0")}`,
        category: "a",
        at: 20 + i,
        isFeatured: true,
      })),
      { slug: "b-only", category: "b", at: 1 },
      // Subcategory-only: C has no product of its own.
      { slug: "c-child-product", category: "c-child", at: 2 },
      // Inactive child: D's only product sits in an inactive child, so D is absent.
      { slug: "d-hidden", category: "d-child-off", at: 59, isFeatured: true },
      // Grandchild: a newer, featured grandchild product must not beat E's own.
      { slug: "e-own", category: "e", at: 3 },
      { slug: "e-grandchild-product", category: "e-grandchild", at: 58, isFeatured: true },
      // Inactive product: F's newer featured product is inactive.
      { slug: "f-active", category: "f", at: 4 },
      { slug: "f-inactive", category: "f", at: 57, isFeatured: true, isActive: false },
      // Featured beats newer: G's own featured product against a newer non-featured child product.
      { slug: "g-featured", category: "g", at: 5, isFeatured: true },
      { slug: "g-child-newer", category: "g-child", at: 56 },
    ];
    await ws.product.createMany({
      data: products.map((p) => ({
        vendorId,
        slug: p.slug,
        name: p.slug,
        description: "p1096 fixture",
        categoryId: categoryIds.get(p.category)!,
        basePrice: 100,
        unitLabel: "each",
        isFeatured: p.isFeatured ?? false,
        isActive: p.isActive ?? true,
        createdAt: minute(p.at),
      })),
    });

    const departments = ["a", "b", "c", "d", "e", "f", "g"].map((slug) => categoryIds.get(slug)!);
    const result = await listCategorySpotlights(asRuntime(http), vendorId, departments);
    const nameOf = (slug: string) => result.get(categoryIds.get(slug)!)?.name ?? "(none)";

    console.log("R9 — listCategorySpotlights on PrismaNeonHttp against a real database");
    check(
      "starvation: B keeps its spotlight beside 30 featured A products",
      nameOf("a") === "a-29" && nameOf("b") === "b-only",
      `a=${nameOf("a")} b=${nameOf("b")}`,
    );
    check(
      "subcategory-only: C's spotlight comes from its child, keyed by C",
      nameOf("c") === "c-child-product" &&
        result.get(categoryIds.get("c")!)?.categoryId === categoryIds.get("c-child"),
      `c=${nameOf("c")}`,
    );
    check("inactive child: D is absent", !result.has(categoryIds.get("d")!), `d=${nameOf("d")}`);
    check("grandchild: E's own product wins", nameOf("e") === "e-own", `e=${nameOf("e")}`);
    check("inactive product: F's active product wins", nameOf("f") === "f-active");
    check(
      "featured beats newer: G's featured product beats a newer child product",
      nameOf("g") === "g-featured",
      `g=${nameOf("g")}`,
    );
    check(
      "keys are departments only",
      [...result.keys()].every((key) => departments.includes(key)),
    );
  } finally {
    await removeFixtures(ws);
    await ws.$disconnect();
    await http.$disconnect();
  }
}

async function expected(slug: string | undefined): Promise<void> {
  if (!slug) throw new Error("usage: expected <vendor-slug>");
  const http = httpClient(databaseUrl());
  try {
    const vendor = await http.vendor.findUnique({ where: { slug }, select: { id: true } });
    if (!vendor) throw new Error(`no vendor with slug ${slug}`);
    const departments = await listTopLevelCategories(asRuntime(http), vendor.id);
    const spotlights = await listCategorySpotlights(
      asRuntime(http),
      vendor.id,
      departments.map((d) => d.id),
    );
    console.log(`R10 — expected spotlights for ${slug}`);
    for (const department of departments) {
      console.log(`  ${department.name}: ${spotlights.get(department.id)?.name ?? "(none)"}`);
    }
  } finally {
    await http.$disconnect();
  }
}

const [mode, arg] = process.argv.slice(2);

const run = mode === "fixture" ? fixture() : mode === "expected" ? expected(arg) : null;
if (!run) {
  console.error("usage: verify-department-spotlights.ts fixture | expected <vendor-slug>");
  process.exit(2);
}
run
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed`);
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
