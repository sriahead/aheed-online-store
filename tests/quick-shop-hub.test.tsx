// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * #1187 — the Quick Shop hub's four tiles, and the header link that opens it.
 * #1186 — the Regulars placeholder, and the fact that a guest never reaches it.
 *
 * WHY THIS TEST EXISTS. Both pages are almost entirely copy and destinations, and copy is exactly
 * what drifts. The programme has already renamed this surface twice (`#1145` collapsed three names
 * into one, `#1187` deliberately re-split it into two), so the thing worth pinning is not that a
 * tile renders but that each tile's label still matches the page it opens. `#1187`'s own scope asks
 * the spec to name every call site rather than relying on grep, and this is the executable half of
 * that: a renamed destination heading with a stale tile label fails here.
 *
 * WHY IT RENDERS RATHER THAN READING SOURCE. A `grep` for a tile label passes as soon as the string
 * appears anywhere in the file, including in the comment explaining the naming rule. It also cannot
 * see ORDER, and the hub's tile order is a requirement (`requirements.md` R3). Rendering is the
 * only version that fails when a tile is reordered, relabelled or dropped.
 *
 * The hub is a synchronous server component; the Regulars page is async with no nested async
 * children, so awaiting it yields an ordinary element tree (the pattern
 * `tests/help-vendor-facts.test.tsx` uses).
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({ api: { getSession } }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

/** `redirect()` throws in Next so execution stops; the sentinel lets the test assert it was hit. */
const REDIRECTED = new Error("NEXT_REDIRECT");
const redirect = vi.fn(() => {
  throw REDIRECTED;
});
vi.mock("next/navigation", () => ({ redirect }));

const { default: QuickShopPage } = await import("@/app/(storefront)/quick-shop/page");
const { default: AccountRegularsPage } = await import("@/app/(storefront)/account/regulars/page");
const { ShoppingListLink } = await import("@/components/layout/ShoppingListLink");
const { REGULARS_PLACEHOLDER_MESSAGE } = await import("@/lib/regulars");

const TILE_CLASS =
  "rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block";

/** The four tiles, in the order `requirements.md` R3 and R4 fix them. */
const TILES = [
  {
    href: "/account/favourites",
    label: "Your favourites",
    description: "Everything you have tapped the heart on, ready to add to your basket again.",
  },
  {
    href: "/account/regulars",
    label: "Your regulars",
    description: "The items you order most often, in one place.",
  },
  {
    href: "/shop-your-list",
    label: "Smart Lists",
    description: "Paste or type a list and match it to what is in stock.",
  },
  { href: "/bundles", label: "Value Bundles", description: "Multi-item bundles at a set price." },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("#1187 Quick Shop hub", () => {
  it("renders exactly four tiles, in the fixed order (R3)", () => {
    const { container } = render(QuickShopPage());
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    // Exact array equality, so a fifth tile or a reorder both fail rather than one of them passing.
    expect(hrefs).toEqual(TILES.map((t) => t.href));
  });

  it("labels each tile with its destination page's own name (R4)", () => {
    const { container } = render(QuickShopPage());
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors).toHaveLength(TILES.length);
    TILES.forEach((tile, i) => {
      const paragraphs = [...anchors[i].querySelectorAll("p")].map((p) =>
        p.textContent?.replace(/\s+/g, " ").trim(),
      );
      expect(paragraphs).toEqual([tile.label, tile.description]);
    });
  });

  it("gives every tile the shared tile class, not a hand-written one (R5)", () => {
    const { container } = render(QuickShopPage());
    for (const anchor of container.querySelectorAll("a")) {
      expect(anchor.getAttribute("class")).toBe(TILE_CLASS);
    }
  });

  it("heads the page Quick Shop (R2)", () => {
    const { container } = render(QuickShopPage());
    expect(container.querySelector("h1")?.textContent).toBe("Quick Shop");
  });
});

describe("#1186 Regulars placeholder", () => {
  /**
   * Two assertions, because either alone is vacuous. The page and this test import the SAME
   * constant, so a containment check passes however the sentence is reworded; and a literal check
   * alone cannot tell whether the page renders the constant or its own second copy of the words.
   * Together: the literal pins the wording `#1186` specifies, the containment pins that the page
   * renders the import.
   */
  it("holds the exact sentence #1186 specifies (R11)", () => {
    expect(REGULARS_PLACEHOLDER_MESSAGE).toBe(
      "Your regularly ordered items will appear here once you start shopping.",
    );
  });

  it("renders the one placeholder string for a signed-in shopper (R10, R11)", async () => {
    getSession.mockResolvedValue({ user: { id: "user_1" } });
    const { container } = render(await AccountRegularsPage());

    expect(container.querySelector("h1")?.textContent).toBe("Your regulars");
    expect(container.textContent).toContain(REGULARS_PLACEHOLDER_MESSAGE);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a guest to /login rather than an empty state (R9)", async () => {
    getSession.mockResolvedValue(null);
    await expect(AccountRegularsPage()).rejects.toBe(REDIRECTED);
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

describe("#1187 header link", () => {
  it("opens the hub, not the paste page (R15)", () => {
    const { container } = render(<ShoppingListLink />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/quick-shop");
  });

  it("keeps its accessible name identical to its visible text (R16, WCAG 2.5.3)", () => {
    const { container } = render(<ShoppingListLink />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("aria-label")).toBe("Quick Shop");
    expect(link.textContent?.trim()).toBe("Quick Shop");
    expect(link.getAttribute("aria-label")).toBe(link.textContent?.trim());
  });
});
