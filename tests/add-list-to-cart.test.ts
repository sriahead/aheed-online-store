import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `#1088` (R13, R14) — what `/cart` is told after a shop-list submission.
 *
 * WHY THIS FILE IS NEW. `tests/shopping-list*.test.ts` cover the pure parsing and matching modules
 * and `tests/shop-list-review-copy.test.tsx` covers the review step's rendering; nothing covered the
 * action in between, which is where the defect was — a bare `redirect("/cart")` that said nothing
 * about a line the shopper had left unresolved.
 *
 * WHAT IT CAN AND CANNOT PROVE. It proves the redirect target: which entries the notice carries, how
 * they are named, and that an untouched submission still lands on plain `/cart`. The cart repository
 * is a stub, so it proves nothing about stock resolution or what is actually written — that is
 * `addItems`' own contract, covered by `tests/cart-bulk-add-report.test.ts`.
 */

const addItems = vi.fn();
const redirect = vi.fn((url: string) => {
  // Next's `redirect` throws to unwind; the real action never returns past it.
  throw new Error(`REDIRECT:${url}`);
});
const issueGuestToken = vi.fn(async () => "guest-token");
const getUserId = vi.fn(async (): Promise<string | null> => "user-1");
const revalidateCartSurfaces = vi.fn(async () => {});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/cart-service", () => ({ getCartRepository: () => ({ addItems }) }));
vi.mock("@/lib/cart-identity", () => ({
  getUserId: () => getUserId(),
  issueGuestToken: () => issueGuestToken(),
}));
vi.mock("@/features/cart/shared", () => ({
  revalidateCartSurfaces: () => revalidateCartSurfaces(),
}));

const { addListToCart } = await import("@/features/cart/add-list-to-cart");

afterEach(() => {
  vi.clearAllMocks();
  getUserId.mockResolvedValue("user-1");
});

/** Build the positionally-aligned form the review step submits. */
const form = (rows: { productId: string; quantity: string; lineLabel?: string }[]): FormData => {
  const data = new FormData();
  for (const row of rows) {
    data.append("productId", row.productId);
    data.append("quantity", row.quantity);
    if (row.lineLabel !== undefined) data.append("lineLabel", row.lineLabel);
  }
  return data;
};

/** The URL the action redirected to, read off the thrown unwind. */
const redirectedTo = async (data: FormData): Promise<string> => {
  await expect(addListToCart(data)).rejects.toThrow(/^REDIRECT:/);
  return redirect.mock.calls.at(-1)![0];
};

const query = (url: string) => {
  const search = new URL(url, "http://x").searchParams;
  return {
    restored: search.get("restored"),
    of: search.get("of"),
    lines: search.get("lines"),
  };
};

describe("addListToCart (#1088)", () => {
  it("R13: reports the skipped line and adds only the resolved one", async () => {
    addItems.mockResolvedValue([{ productId: "p-1", requested: 2, added: 2, kind: "added" }]);

    const url = await redirectedTo(
      form([
        { productId: "p-1", quantity: "2", lineLabel: "Milk" },
        { productId: "", quantity: "3", lineLabel: "Apple juice" },
      ]),
    );

    expect(addItems).toHaveBeenCalledWith({ userId: "user-1", guestToken: null }, [
      { productId: "p-1", quantity: 2 },
    ]);
    expect(query(url)).toEqual({
      restored: "list",
      of: "2",
      lines: "s~0~3~Apple juice",
    });
  });

  it("R13: reports the per-line outcome the bulk add returns, which this action used to discard", async () => {
    addItems.mockResolvedValue([{ productId: "p-1", requested: 2, added: 1, kind: "partial" }]);

    const url = await redirectedTo(
      form([
        { productId: "p-1", quantity: "2", lineLabel: "Milk" },
        { productId: "", quantity: "3", lineLabel: "Apple juice" },
      ]),
    );

    expect(query(url).lines).toBe("p~1~2~Milk|s~0~3~Apple juice");
  });

  it("R14: lands on exactly /cart when every line went in in full", async () => {
    addItems.mockResolvedValue([
      { productId: "p-1", requested: 2, added: 2, kind: "added" },
      { productId: "p-2", requested: 1, added: 1, kind: "added" },
    ]);

    const url = await redirectedTo(
      form([
        { productId: "p-1", quantity: "2", lineLabel: "Milk" },
        { productId: "p-2", quantity: "1", lineLabel: "Bread" },
      ]),
    );

    expect(url).toBe("/cart");
  });

  it("R14: a skipped line with no usable label is still reported, under a neutral name", async () => {
    addItems.mockResolvedValue([]);

    const blank = await redirectedTo(form([{ productId: "", quantity: "1", lineLabel: "   " }]));
    expect(query(blank).lines).toBe("s~0~1~An item from your list");

    // And with the field absent altogether, which only a crafted post produces.
    const missing = await redirectedTo(form([{ productId: "", quantity: "1" }]));
    expect(query(missing).lines).toBe("s~0~1~An item from your list");
  });

  it("does not issue a guest token when there is nothing to add", async () => {
    // The pre-#1088 action was careful about this and it must stay true: a shopper who skips every
    // line gets a notice, not a cart.
    getUserId.mockResolvedValue(null);
    addItems.mockResolvedValue([]);

    const url = await redirectedTo(form([{ productId: "", quantity: "1", lineLabel: "Milk" }]));

    expect(issueGuestToken).not.toHaveBeenCalled();
    expect(addItems).not.toHaveBeenCalled();
    expect(revalidateCartSurfaces).not.toHaveBeenCalled();
    expect(query(url).lines).toBe("s~0~1~Milk");
  });

  it("issues a guest token on a real add, as before", async () => {
    getUserId.mockResolvedValue(null);
    addItems.mockResolvedValue([{ productId: "p-1", requested: 1, added: 1, kind: "added" }]);

    await redirectedTo(form([{ productId: "p-1", quantity: "1", lineLabel: "Milk" }]));

    expect(issueGuestToken).toHaveBeenCalledTimes(1);
    expect(addItems).toHaveBeenCalledWith({ userId: null, guestToken: "guest-token" }, [
      { productId: "p-1", quantity: 1 },
    ]);
    expect(revalidateCartSurfaces).toHaveBeenCalledTimes(1);
  });

  it("drops a line whose quantity is unusable, and says nothing about it", async () => {
    // Unchanged from before this slice: the review step writes the quantity itself, so only a
    // crafted post produces one, and no notice wording would be true of it.
    addItems.mockResolvedValue([{ productId: "p-1", requested: 1, added: 1, kind: "added" }]);

    const url = await redirectedTo(
      form([
        { productId: "p-1", quantity: "1", lineLabel: "Milk" },
        { productId: "p-9", quantity: "0", lineLabel: "Crafted" },
      ]),
    );

    expect(addItems).toHaveBeenCalledWith({ userId: "user-1", guestToken: null }, [
      { productId: "p-1", quantity: 1 },
    ]);
    expect(url).toBe("/cart");
  });
});
