// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { pageCountFor, pageWindow, parsePageParam, rowRange } from "@/lib/pagination";
import { staffProductsFilterFields, staffProductsHref } from "@/lib/staff-products-query";

/**
 * Owner request, 2026-11-12: the /staff/products pagination bar is the standard, and one reusable
 * component renders it on every paginated page. Numbered where a list is bounded, sequential
 * (same design, no total) where it pages by keyset cursor (specs/architecture.md, "Pagination").
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Pagination } = await import("@/components/ui/Pagination");

afterEach(cleanup);

describe("lib/pagination", () => {
  it("windows the page list around the current page", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 250)).toEqual([1, 2, 3, "gap", 250]);
    expect(pageWindow(50, 250)).toEqual([1, "gap", 48, 49, 50, 51, 52, "gap", 250]);
  });

  it("counts pages and rows", () => {
    expect(pageCountFor(0, 25)).toBe(1);
    expect(pageCountFor(6238, 25)).toBe(250);
    expect(rowRange(2, 25, 25, 6238)).toEqual({ first: 26, last: 50 });
    expect(rowRange(1, 25, 0, 0)).toEqual({ first: 0, last: 0 });
  });

  it("parses ?page= safely: digits only, clamped, arrays read as their first value", () => {
    expect(parsePageParam("3", 10)).toBe(3);
    expect(parsePageParam("99", 10)).toBe(10);
    expect(parsePageParam("0", 10)).toBe(1);
    expect(parsePageParam("-2", 10)).toBe(1);
    expect(parsePageParam("2abc", 10)).toBe(1);
    expect(parsePageParam(undefined, 10)).toBe(1);
    expect(parsePageParam(["4", "5"], 10)).toBe(4);
  });
});

describe("numbered Pagination", () => {
  const base = {
    mode: "numbered" as const,
    label: "Product pages",
    total: 6238,
    perPage: 25,
    shown: 25,
    noun: ["product", "products"] as const,
    hrefFor: (p: number) => `/list?page=${p}`,
  };

  it("summarises, marks the current page, and links Previous, numbers and Next", () => {
    const { container, getByText } = render(
      <Pagination {...base} page={50} pageCount={250} position="top" />,
    );
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Product pages (top)");
    expect(nav.getAttribute("data-pagination")).toBe("top");
    expect(nav.getAttribute("data-tap-surface")).toBe("pagination");
    expect(nav.textContent).toContain("Page 50 of 250");
    expect(nav.textContent).toContain("Showing 1,226–1,250 of 6,238 products");
    expect(container.querySelector('[aria-current="page"]')!.textContent).toBe("50");
    expect(container.querySelector('a[rel="prev"]')!.getAttribute("href")).toBe("/list?page=49");
    expect(container.querySelector('a[rel="next"]')!.getAttribute("href")).toBe("/list?page=51");
    expect(getByText("250").getAttribute("href")).toBe("/list?page=250");
  });

  it("offers a jump box past 7 pages, carrying the filters as hidden fields", () => {
    const { container } = render(
      <Pagination
        {...base}
        page={1}
        pageCount={250}
        jump={{ action: "/staff/products", hidden: [["q", "rice"]] }}
      />,
    );
    const form = container.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/staff/products");
    expect(form.querySelector('input[type="hidden"][name="q"]')!.getAttribute("value")).toBe(
      "rice",
    );
    expect(form.querySelector('input[name="page"]')).not.toBeNull();
    // No Previous on page 1.
    expect(container.querySelector('a[rel="prev"]')).toBeNull();
  });

  it("shows only the summary for a single page, using the singular noun", () => {
    const { container } = render(
      <Pagination {...base} page={1} pageCount={1} total={1} shown={1} />,
    );
    expect(container.textContent).toContain("Showing 1–1 of 1 product");
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("sequential Pagination", () => {
  it("renders the same controls with Page N and no total", () => {
    const { container } = render(
      <Pagination
        mode="sequential"
        label="Product pages"
        page={3}
        prevHref="/c?cursor=a"
        nextHref="/c?cursor=b"
      />,
    );
    expect(container.textContent).toContain("Page 3");
    expect(container.textContent).not.toContain(" of ");
    expect(container.querySelector('a[rel="prev"]')!.getAttribute("href")).toBe("/c?cursor=a");
    expect(container.querySelector('a[rel="next"]')!.getAttribute("href")).toBe("/c?cursor=b");
  });

  it("offers First page on a next-only list once past the start, and renders nothing with no links", () => {
    const { container, getByText } = render(
      <Pagination mode="sequential" label="Order pages" firstHref="/orders" nextHref={null} />,
    );
    expect(getByText("First page").getAttribute("href")).toBe("/orders");
    cleanup();
    const empty = render(<Pagination mode="sequential" label="Order pages" />);
    expect(empty.container.innerHTML).toBe("");
  });
});

describe("staff products jump fields", () => {
  it("are exactly the filters the page links carry, without the page", () => {
    const query = {
      status: "inactive",
      search: "rice",
      category: "all",
      perPage: 50,
      sort: "price-desc",
      needs: "price",
    } as unknown as Parameters<typeof staffProductsHref>[0];
    const fields = staffProductsFilterFields(query);
    expect(fields).toEqual(
      [...new URL(staffProductsHref(query, 7), "http://x").searchParams].filter(
        ([name]) => name !== "page",
      ),
    );
    expect(fields.some(([name]) => name === "page")).toBe(false);
  });
});

describe("every paginated page uses the shared component", () => {
  const pages = [
    "app/(admin)/staff/products/page.tsx",
    "app/(admin)/staff/customers/page.tsx",
    "app/(admin)/staff/orders/page.tsx",
    "app/(storefront)/account/orders/page.tsx",
    "app/(storefront)/categories/[slug]/page.tsx",
    "app/(storefront)/search/page.tsx",
  ];
  for (const page of pages) {
    it(page, () => {
      const source = readFileSync(page, "utf8");
      expect(source).toContain('from "@/components/ui/Pagination"');
      expect(source).not.toMatch(/>\s*(Older orders|Next page|Previous page)\s*</);
    });
  }

  it("the staff products search row sits below Apply filters", () => {
    const source = readFileSync("app/(admin)/staff/products/page.tsx", "utf8");
    expect(source.indexOf('id="product-search"')).toBeGreaterThan(source.indexOf("Apply filters"));
  });
});
