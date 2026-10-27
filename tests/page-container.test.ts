import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageContainer, type PageWidth } from "../components/layout/PageContainer";

/**
 * #1180 — the pages must not hand-roll their own width containers again.
 *
 * Before this slice there was no shared page container at all: `app/layout.tsx` says so in a
 * comment, and neither route-group layout adds one. Sixty pages each chose a `max-width` on their
 * own while every chrome element above them was `max-w-7xl`, so the admin hub sat 128px inboard of
 * the nav heading it and the admin's tables rendered in as little as 672px.
 *
 * Fixing that once is a tidy-up; it drifts back without a guard. `tests/staff-nav-parity.test.ts`
 * exists because the same class of drift bit the nav twice (#612, #626).
 *
 * WHAT IS CHECKED AND WHAT IS DELIBERATELY NOT. The expected width per page is a written-down map
 * (`EXPECTED`) rather than something derived, because there is nothing in the filesystem to derive
 * it from — "is this page a table or a form" is a judgment, not a fact about the tree. The map is
 * therefore maintained by hand, and the first two tests make that safe: a new page that is missing
 * from the map fails, and a page in the map that no longer exists fails. Neither can rot silently.
 *
 * THE TOP-LEVEL CHECK IS DEPTH-AWARE ON PURPOSE. Four auth pages keep a `mx-auto max-w-sm` card
 * INSIDE their container (spec R8) — a card is not a page container, and stretching a sign-in form
 * to 672px would be a visible downgrade sold as consistency. So this rejects `mx-auto` + `max-w-`
 * only on the element a page RETURNS, not anywhere in the file.
 */

const REPO_ROOT = join(__dirname, "..");
const GROUPS = ["app/(admin)", "app/(storefront)", "app/(landing)"];

/** Straight from `specs/2026-10-20-p1180-shared-page-container/requirements.md` R6 and R7. */
const EXPECTED: Record<string, { width: string; padY: string }> = {
  // --- admin: wide
  "app/(admin)/staff/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/orders/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/products/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/inventory/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/customers/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/fulfilment/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/payments/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/errors/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/runbook/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/reports/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/categories/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/icons/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/promotions/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/brands/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/attributes/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/net-content/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/search-synonyms/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/bundles/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/feedback/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/team/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/platform/vendors/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/platform/domains/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/platform/onboarding/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/platform/settings/page.tsx": { width: "wide", padY: "default" },
  "app/(admin)/staff/platform/health/page.tsx": { width: "wide", padY: "default" },
  // --- admin: standard
  "app/(admin)/staff/faqs/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/discounts/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/loyalty/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/delivery-areas/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/storefront/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/assistant/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/ai-usage/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/products/import/page.tsx": { width: "standard", padY: "default" },
  "app/(admin)/staff/onboarding/page.tsx": { width: "standard", padY: "default" },
  // --- admin: narrow
  "app/(admin)/staff/orders/[orderNumber]/page.tsx": { width: "narrow", padY: "default" },
  "app/(admin)/staff/products/[id]/page.tsx": { width: "narrow", padY: "default" },
  "app/(admin)/staff/products/new/page.tsx": { width: "narrow", padY: "default" },
  "app/(admin)/staff/categories/[id]/page.tsx": { width: "narrow", padY: "default" },
  "app/(admin)/staff/bundles/[bundleId]/page.tsx": { width: "narrow", padY: "default" },
  "app/(admin)/staff/promotions/[categoryId]/page.tsx": { width: "narrow", padY: "default" },
  // --- storefront + landing: wide
  "app/(landing)/page.tsx": { width: "wide", padY: "tight" },
  "app/(storefront)/categories/page.tsx": { width: "wide", padY: "tight" },
  "app/(storefront)/categories/[slug]/page.tsx": { width: "wide", padY: "tight" },
  "app/(storefront)/search/page.tsx": { width: "wide", padY: "tight" },
  "app/(storefront)/bundles/page.tsx": { width: "wide", padY: "tight" },
  "app/(storefront)/whatsapp-offers/page.tsx": { width: "wide", padY: "tight" },
  // --- storefront: standard
  "app/(storefront)/account/page.tsx": { width: "standard", padY: "default" },
  "app/(storefront)/account/data/page.tsx": { width: "standard", padY: "default" },
  // #1187 — the Quick Shop hub. `standard` because it is the same tile grid as `/account`, which it
  // borrows its tile markup from, not a listing like `/categories` or `/bundles`.
  "app/(storefront)/quick-shop/page.tsx": { width: "standard", padY: "default" },
  // #1186 — Regulars. `standard` with its account siblings, NOT `wide` like `/account/favourites`:
  // that page is wide because it renders a `ProductGrid`, and this one renders one placeholder
  // sentence. When the derivation lands and a grid appears, this row moves to `wide` with it — and
  // this registry is what makes that an explicit decision rather than a drift.
  "app/(storefront)/account/regulars/page.tsx": { width: "standard", padY: "default" },
  // #232 — `wide`, not `standard` like its sibling account pages: this one renders a product GRID
  // through `ProductGrid`, so it belongs with the other listings (`/categories`, `/search`,
  // `/bundles`) rather than with the record-detail pages around it. A `standard` 1024px column
  // would drop the grid a column against every other place the same cards appear.
  "app/(storefront)/account/favourites/page.tsx": { width: "wide", padY: "default" },
  "app/(storefront)/account/lists/page.tsx": { width: "standard", padY: "default" },
  "app/(storefront)/account/lists/[listId]/page.tsx": { width: "standard", padY: "default" },
  "app/(storefront)/account/loyalty/page.tsx": { width: "standard", padY: "default" },
  "app/(storefront)/account/orders/page.tsx": { width: "standard", padY: "default" },
  "app/(storefront)/account/orders/[orderNumber]/page.tsx": {
    width: "standard",
    padY: "default",
  },
  "app/(storefront)/cart/page.tsx": { width: "standard", padY: "tight" },
  "app/(storefront)/icon-credits/page.tsx": { width: "standard", padY: "default" },
  "app/(storefront)/products/[slug]/page.tsx": { width: "standard", padY: "default" },
  // --- storefront: narrow
  "app/(storefront)/checkout/page.tsx": { width: "narrow", padY: "tight" },
  "app/(storefront)/checkout/[orderNumber]/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/checkout/[orderNumber]/cancel/page.tsx": {
    width: "narrow",
    padY: "default",
  },
  "app/(storefront)/shop-your-list/page.tsx": { width: "narrow", padY: "tight" },
  "app/(storefront)/orders/lookup/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/feedback/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/help/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/privacy/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/terms/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/login/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/register/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/forgot-password/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/reset-password/page.tsx": { width: "narrow", padY: "default" },
  "app/(storefront)/dev/page.tsx": { width: "narrow", padY: "default" },
};

function pagesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") found.push(relative(REPO_ROOT, full).replace(/\\/g, "/"));
    }
  };
  for (const group of GROUPS) walk(join(REPO_ROOT, group));
  return found.sort();
}

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

/** The element a page returns, i.e. the first JSX tag after a top-level `return (`. */
function returnedElements(source: string): string[] {
  return [...source.matchAll(/\n {2}return \(\s*\n\s*(<[^\n]*)/g)].map((m) => m[1]);
}

/**
 * Rendered, not read. The source-parsing cases below prove which width each PAGE asks for; these
 * prove what the component actually EMITS for that ask. Added at validation (#1180): the first
 * version of this file had no rendering case at all, so `max-w-7xl` and `py-6` were never asserted
 * against real output — only inferred from a template literal.
 *
 * `renderToStaticMarkup` rather than `@testing-library/react`: this needs the emitted class string,
 * not a DOM, so it keeps the file a plain `.ts` and needs no jsdom environment.
 */
const markup = (props: Parameters<typeof PageContainer>[0]) =>
  renderToStaticMarkup(createElement(PageContainer, props));

const classOf = (html: string) => html.match(/^<main class="([^"]*)"/)?.[1] ?? null;

describe("#1180 PageContainer renders", () => {
  const widths: Array<[PageWidth, string]> = [
    ["wide", "max-w-7xl"],
    ["standard", "max-w-5xl"],
    ["narrow", "max-w-2xl"],
  ];

  it.each(widths)("%s emits exactly one width class, on a <main>", (width, expected) => {
    const html = markup({ width, children: "x" });
    expect(html.startsWith("<main ")).toBe(true);
    expect(html.endsWith("</main>")).toBe(true);
    expect(classOf(html)).toBe(`mx-auto w-full px-4 ${expected} py-8`);
    // Exactly one width class — not the right one plus a stray.
    expect(classOf(html)!.match(/\bmax-w-\S+/g)).toEqual([expected]);
  });

  it("padY defaults to py-8 and tight gives py-6, never both", () => {
    expect(classOf(markup({ width: "wide", children: "x" }))).toBe(
      "mx-auto w-full px-4 max-w-7xl py-8",
    );
    expect(classOf(markup({ width: "wide", padY: "tight", children: "x" }))).toBe(
      "mx-auto w-full px-4 max-w-7xl py-6",
    );
    const tight = classOf(markup({ width: "narrow", padY: "tight", children: "x" }))!;
    expect(tight.match(/\bpy-\d+\b/g)).toEqual(["py-6"]);
  });

  it("className is appended after the layout classes, which all survive", () => {
    const cls = classOf(markup({ width: "standard", className: "text-primary", children: "x" }))!;
    expect(cls.endsWith("text-primary")).toBe(true);
    expect(cls).toContain("px-4");
    expect(cls).toBe("mx-auto w-full px-4 max-w-5xl py-8 text-primary");
  });

  it("renders its children inside the main element", () => {
    expect(markup({ width: "narrow", children: "hello" })).toBe(
      '<main class="mx-auto w-full px-4 max-w-2xl py-8">hello</main>',
    );
  });
});

describe("#1180 page containers", () => {
  it("every page on disk has an expected width recorded", () => {
    const missing = pagesOnDisk().filter((p) => !(p in EXPECTED));
    expect(missing, `add these to EXPECTED in ${relative(REPO_ROOT, __filename)}`).toEqual([]);
  });

  it("every recorded page still exists", () => {
    const onDisk = new Set(pagesOnDisk());
    expect(Object.keys(EXPECTED).filter((p) => !onDisk.has(p))).toEqual([]);
  });

  it("each page renders PageContainer with the width its spec row says", () => {
    const wrong: string[] = [];
    for (const [rel, want] of Object.entries(EXPECTED)) {
      const source = read(rel);
      const open = source.match(/<PageContainer\b[^>]*>/);
      if (!open) {
        wrong.push(`${rel}: no <PageContainer>`);
        continue;
      }
      const width = open[0].match(/width="([^"]+)"/)?.[1] ?? null;
      const padY = open[0].match(/padY="([^"]+)"/)?.[1] ?? "default";
      if (width !== want.width) wrong.push(`${rel}: width ${width}, expected ${want.width}`);
      if (padY !== want.padY) wrong.push(`${rel}: padY ${padY}, expected ${want.padY}`);
    }
    expect(wrong).toEqual([]);
  });

  it("no page hand-rolls its own top-level width container", () => {
    const offenders: string[] = [];
    for (const rel of pagesOnDisk()) {
      for (const el of returnedElements(read(rel))) {
        if (el.includes("mx-auto") && el.includes("max-w-")) offenders.push(`${rel}: ${el.trim()}`);
      }
    }
    expect(offenders, "use <PageContainer width=…> instead").toEqual([]);
  });

  it("no PageContainer className smuggles layout classes back in", () => {
    // The repo has no clsx and no tailwind-merge, so a competing `max-w-*` in className would
    // resolve by stylesheet source order rather than by intent — silently, and per build.
    const offenders: string[] = [];
    for (const rel of pagesOnDisk()) {
      for (const open of read(rel).matchAll(/<PageContainer\b[^>]*>/g)) {
        const className = open[0].match(/className="([^"]*)"/)?.[1] ?? "";
        for (const banned of ["max-w-", "mx-auto", "px-"]) {
          if (className.includes(banned)) offenders.push(`${rel}: className has ${banned}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
