import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultListName } from "@/lib/saved-list";

/**
 * The three "save as a list" entry points (#116).
 *
 * All three converge on one service call, so what these tests actually pin down is the part that
 * differs: how each surface turns its own data into lines, and that none of them writes anything
 * it shouldn't. The positional-array decoding in `saveListFromMatch` gets the most attention
 * because it is the only one where a misalignment would be silent — quantities and measures would
 * attach to the wrong lines and the list would still save cleanly.
 */

const { service, redirect, cart, order, session } = vi.hoisted(() => ({
  service: {
    save: vi.fn<(name: string, items: readonly unknown[]) => Promise<string | null>>(
      async () => "list-1",
    ),
    rename: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    list: vi.fn(async () => []),
    find: vi.fn(async () => null),
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  cart: { getSummary: vi.fn(async () => ({ lines: [] as { name: string; quantity: number }[] })) },
  order: { getForUser: vi.fn(async () => null as unknown) },
  session: vi.fn<() => Promise<unknown>>(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/shopping-lists-service", () => ({ getShoppingListService: () => service }));
vi.mock("@/lib/cart-service", () => ({ getCartRepository: () => cart }));
vi.mock("@/lib/orders-service", () => ({ getOrderRepository: () => order }));
vi.mock("@/lib/cart-identity", () => ({
  getCartIdentity: async () => ({ userId: "user-1", guestToken: null }),
  getUserId: async () => "user-1",
}));
vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({ api: { getSession: () => session() } }),
}));

import { saveListFromMatch } from "@/features/lists/save-list-from-match";
import { saveCartAsList } from "@/features/lists/save-cart-as-list";
import { saveOrderAsList } from "@/features/lists/save-order-as-list";
import { renameList } from "@/features/lists/rename-list";
import { deleteList } from "@/features/lists/delete-list";
import { EMPTY_SAVE_STATE } from "@/lib/saved-list";

/** Run an action that ends in a redirect, and report where it went. */
async function whereItRedirected(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("expected a redirect, got none");
}

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  service.save.mockResolvedValue("list-1");
  session.mockResolvedValue({ user: { id: "user-1" } });
});

describe("saveListFromMatch", () => {
  /** Four lines, one of which carries no terms and must be dropped without shifting the others. */
  function fourLines(): FormData {
    const data = new FormData();
    const rows = [
      { text: "2x chicken breast", terms: "chicken breast", qty: "2", measure: "", brand: "" },
      { text: "5kg basmati rice", terms: "basmati rice", qty: "1", measure: "5kg", brand: "" },
      { text: "???", terms: "", qty: "1", measure: "", brand: "" },
      { text: "shan masala", terms: "shan masala", qty: "3", measure: "", brand: "Shan" },
    ];
    for (const row of rows) {
      data.append("lineText", row.text);
      data.append("lineTerms", row.terms);
      data.append("lineQuantity", row.qty);
      data.append("lineMeasure", row.measure);
      data.append("lineBrand", row.brand);
    }
    return data;
  }

  it("keeps the five positional arrays aligned, and drops only the termless line", async () => {
    const state = await saveListFromMatch(EMPTY_SAVE_STATE, fourLines());

    expect(state.outcome).toBe("saved");
    const items = service.save.mock.calls[0][1] as {
      rawText: string;
      quantity: number;
      measure: string | null;
      brand: string | null;
    }[];
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.rawText)).toEqual([
      "2x chicken breast",
      "5kg basmati rice",
      "shan masala",
    ]);
    // The measure belonged to line 2 and the brand to line 4; a misalignment would move them.
    expect(items.map((i) => i.quantity)).toEqual([2, 1, 3]);
    expect(items.map((i) => i.measure)).toEqual([null, "5kg", null]);
    expect(items.map((i) => i.brand)).toEqual([null, null, "Shan"]);
  });

  it("uses the submitted name, trimmed", async () => {
    const data = fourLines();
    data.append("name", "  Weekly  shop  ");

    await saveListFromMatch(EMPTY_SAVE_STATE, data);

    expect(service.save.mock.calls[0][0]).toBe("Weekly shop");
  });

  it("falls back to the generated name when the box was left empty", async () => {
    const data = fourLines();
    data.append("name", "   ");

    await saveListFromMatch(EMPTY_SAVE_STATE, data);

    expect(service.save.mock.calls[0][0]).toBe(defaultListName(new Date()));
  });

  it("reports the cap rather than failing silently", async () => {
    service.save.mockResolvedValue(null);

    const state = await saveListFromMatch(EMPTY_SAVE_STATE, fourLines());

    expect(state.outcome).toBe("capped");
  });

  it("reports an empty list and never reaches the database", async () => {
    const state = await saveListFromMatch(EMPTY_SAVE_STATE, form([["lineTerms", "   "]]));

    expect(state.outcome).toBe("empty");
    expect(service.save).not.toHaveBeenCalled();
  });
});

describe("saveCartAsList", () => {
  it("saves the cart's product names and quantities", async () => {
    cart.getSummary.mockResolvedValue({
      lines: [
        { name: "Basmati Rice 5kg", quantity: 2 },
        { name: "Whole Milk 2L", quantity: 1 },
      ],
    });

    const to = await whereItRedirected(() => saveCartAsList(form([["name", "Weekly shop"]])));

    expect(to).toBe("/cart?list=saved");
    const items = service.save.mock.calls[0][1] as { rawText: string; quantity: number }[];
    expect(items.map((i) => i.rawText)).toEqual(["Basmati Rice 5kg", "Whole Milk 2L"]);
    expect(items.map((i) => i.quantity)).toEqual([2, 1]);
  });

  it("writes nothing when the cart is empty", async () => {
    cart.getSummary.mockResolvedValue({ lines: [] });

    const to = await whereItRedirected(() => saveCartAsList(new FormData()));

    expect(to).toBe("/cart?list=empty");
    expect(service.save).not.toHaveBeenCalled();
  });

  it("says so when the shopper is at the cap", async () => {
    cart.getSummary.mockResolvedValue({ lines: [{ name: "Whole Milk 2L", quantity: 1 }] });
    service.save.mockResolvedValue(null);

    expect(await whereItRedirected(() => saveCartAsList(new FormData()))).toBe("/cart?list=capped");
  });
});

describe("saveOrderAsList", () => {
  it("saves a past order's item names and quantities", async () => {
    order.getForUser.mockResolvedValue({
      items: [
        { productName: "Basmati Rice 5kg", quantity: 1 },
        { productName: "Chicken Breast", quantity: 2 },
      ],
    });

    const to = await whereItRedirected(() => saveOrderAsList(form([["orderNumber", "AH-1001"]])));

    expect(to).toBe("/account/orders/AH-1001?list=saved");
    const items = service.save.mock.calls[0][1] as { rawText: string }[];
    expect(items.map((i) => i.rawText)).toEqual(["Basmati Rice 5kg", "Chicken Breast"]);
  });

  it("writes nothing when the order does not belong to this shopper", async () => {
    // getForUser scopes by the signed-in user, so somebody else's order number resolves to null.
    order.getForUser.mockResolvedValue(null);

    const to = await whereItRedirected(() => saveOrderAsList(form([["orderNumber", "AH-9999"]])));

    expect(to).toBe("/account/orders");
    expect(service.save).not.toHaveBeenCalled();
  });

  it("writes nothing when nobody is signed in", async () => {
    session.mockResolvedValue(null);

    const to = await whereItRedirected(() => saveOrderAsList(form([["orderNumber", "AH-1001"]])));

    expect(to).toBe("/login");
    expect(service.save).not.toHaveBeenCalled();
  });
});

describe("rename and delete", () => {
  it("ignores a blank rename rather than replacing the name with a generated one", async () => {
    const to = await whereItRedirected(() =>
      renameList(
        form([
          ["listId", "list-1"],
          ["name", "   "],
        ]),
      ),
    );

    expect(to).toBe("/account/lists");
    expect(service.rename).not.toHaveBeenCalled();
  });

  it("applies a normalised rename", async () => {
    await whereItRedirected(() =>
      renameList(
        form([
          ["listId", "list-1"],
          ["name", "  New   name "],
        ]),
      ),
    );

    expect(service.rename).toHaveBeenCalledWith("list-1", "New name");
  });

  it("deletes by id and returns to the list index", async () => {
    const to = await whereItRedirected(() => deleteList(form([["listId", "list-1"]])));

    expect(to).toBe("/account/lists");
    expect(service.remove).toHaveBeenCalledWith("list-1");
  });

  it("does nothing when no id was submitted", async () => {
    await whereItRedirected(() => deleteList(new FormData()));

    expect(service.remove).not.toHaveBeenCalled();
  });
});
