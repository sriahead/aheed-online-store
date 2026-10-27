// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * #1302 — the order history page is a card grid with Reorder / Save as list on every card.
 *
 * WHY IT RENDERS. The risk is structural: a `<form>` inside the card's `<Link>` is invalid HTML and
 * the old markup made the whole card one link. Only a rendered tree can assert that no button sits
 * inside an anchor, and that the grid classes and the equal-height classes are on the right nodes.
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
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({
    api: { getSession: async () => ({ user: { id: "user-1" } }) },
  }),
}));

const listForUser = vi.fn();
vi.mock("@/lib/orders-service", () => ({ getOrderRepository: () => ({ listForUser }) }));
vi.mock("@/features/orders/reorder-items", () => ({ reorderItems: vi.fn() }));
vi.mock("@/features/lists/save-order-as-list", () => ({ saveOrderAsList: vi.fn() }));

const { default: OrdersPage } = await import("@/app/(storefront)/account/orders/page");
const { MAX_SAVED_LISTS } = await import("@/lib/saved-list");

const order = (orderNumber: string) => ({
  orderNumber,
  status: "CONFIRMED",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  totalPence: 1250,
  itemCount: 3,
  previewItems: [{ productName: "Whole Milk 2L", quantity: 3 }],
});

async function renderPage(searchParams: { list?: string } = {}) {
  listForUser.mockResolvedValue({
    items: [order("AH-1001"), order("AH-1002"), order("AH-1003")],
    nextCursor: null,
  });
  return render(await OrdersPage({ searchParams: Promise.resolve(searchParams) }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("#1302 orders list grid", () => {
  it("lays orders out 1 column, then 2 from sm — never 3 (#1305 R7)", async () => {
    const { container } = await renderPage();
    const ul = container.querySelector("ul");
    expect(ul?.className).toContain("grid");
    expect(ul?.className).toContain("sm:grid-cols-2");
    expect(ul?.className).not.toContain("lg:grid-cols-3");
    expect(ul?.className).not.toContain("xl:grid-cols-3");
  });

  it("keeps a detail link carrying the card's facts (R6)", async () => {
    const { container } = await renderPage();
    const link = container.querySelector('a[href="/account/orders/AH-1001"]');
    expect(link?.textContent).toContain("AH-1001");
    expect(link?.textContent).toContain("3 × Whole Milk 2L");
    expect(link?.textContent).toContain("3 items");
    expect(link?.textContent).toContain("£12.50");
  });

  it("puts Reorder items and Save as list on each card (R7)", async () => {
    const { container } = await renderPage();
    const cards = container.querySelectorAll("li");
    expect(cards).toHaveLength(3);
    cards.forEach((li, i) => {
      const forms = li.querySelectorAll("form");
      expect(forms).toHaveLength(2);
      const n = `AH-100${i + 1}`;
      expect(forms[0].querySelector('input[name="orderNumber"]')?.getAttribute("value")).toBe(n);
      expect(forms[0].querySelector("button")?.textContent?.trim()).toBe("Reorder items");
      expect(forms[1].querySelector('input[name="orderNumber"]')?.getAttribute("value")).toBe(n);
      expect(forms[1].querySelector('input[name="from"]')?.getAttribute("value")).toBe(
        "orders-list",
      );
      expect(forms[1].querySelector("button")?.textContent?.trim()).toBe("Save as list");
    });
  });

  it("never nests a form or button inside a link (R8)", async () => {
    const { container } = await renderPage();
    expect(container.querySelectorAll("a form, a button")).toHaveLength(0);
  });

  it("keeps cards equal height with the actions pinned low (R12)", async () => {
    const { container } = await renderPage();
    const li = container.querySelector("li");
    expect(li?.className).toContain("flex");
    expect(li?.firstElementChild?.className).toContain("flex-1");
    expect(li?.querySelector("form")?.parentElement?.className).toContain("mt-auto");
    const preview = li?.querySelector("p.text-sm");
    expect(preview?.className).toContain("line-clamp-2");
    expect(preview?.className).not.toContain("truncate");
  });

  it("explains the Save as list outcome it was sent back with (R11)", async () => {
    const texts = async (list?: string) => {
      const { container } = await renderPage({ list });
      const out = [...container.querySelectorAll('[role="status"]')].map((p) => p.textContent);
      cleanup();
      return out;
    };
    expect(await texts("saved")).toEqual(["Saved — find it under Your lists."]);
    expect(await texts("capped")).toEqual([
      `You already have ${MAX_SAVED_LISTS} saved lists. Delete one to save another.`,
    ]);
    expect(await texts("empty")).toEqual(["There is nothing in that order to save."]);
    expect(await texts("bogus")).toEqual([]);
    expect(await texts(undefined)).toEqual([]);
  });
});
