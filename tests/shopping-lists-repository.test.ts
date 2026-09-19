import { describe, expect, it, vi } from "vitest";
import {
  createShoppingList,
  deleteShoppingList,
  findShoppingList,
  listShoppingLists,
  renameShoppingList,
} from "@/lib/repositories/shopping-lists";
import { MAX_SAVED_LISTS, type SavedListItemInput } from "@/lib/saved-list";
import type { getPrisma, getPrismaWs } from "@/lib/db";

/**
 * Saved-list scoping and refusal behaviour (#116).
 *
 * `ShoppingList` is domain data, so ADR-004's mandatory `vendorId` filter applies in full — and
 * `userId` alongside it. These tests capture the `where` clause every query actually issues,
 * because that is where the guard lives: not in which route resolved the id, and not in the caller
 * remembering to check. Same shape and same reasoning as
 * `tests/customer-addresses-repository.test.ts`.
 *
 * NOTE ON WHAT A FAKE CLIENT CANNOT PROVE. These stubs answer every call happily, so they cannot
 * tell whether `create` and `rename` were given the HTTP or the WebSocket client — through
 * `getPrisma()` both crash unconditionally in production while passing here (#382). That property
 * is proved by the slice's live script and its `npm run preview` rows, not by this file. What
 * lives here is scoping and refusal logic, which a stub proves deterministically, everywhere,
 * including on CI runs that set no `DATABASE_URL`.
 */

const VENDOR = "vendor-a";
const USER = "user-1";

function makeClient(overrides: { count?: number } = {}) {
  const calls: Record<string, unknown[]> = {
    findMany: [],
    findFirst: [],
    create: [],
    updateMany: [],
    deleteMany: [],
    count: [],
  };

  const shoppingList = {
    findMany: vi.fn(async (args: unknown) => {
      calls.findMany.push(args);
      return [{ id: "list-1", name: "Weekly shop", updatedAt: new Date(), _count: { items: 3 } }];
    }),
    // Return type widened deliberately: one case overrides it with null to stand for "no row
    // matched all three of id, vendor and user", which the narrow inferred type would reject.
    findFirst: vi.fn(
      async (args: unknown): Promise<{ id: string; name: string; items: unknown[] } | null> => {
        calls.findFirst.push(args);
        return { id: "list-1", name: "Weekly shop", items: [] };
      },
    ),
    create: vi.fn(async (args: unknown) => {
      calls.create.push(args);
      return { id: "list-new" };
    }),
    updateMany: vi.fn(async (args: unknown) => {
      calls.updateMany.push(args);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async (args: unknown) => {
      calls.deleteMany.push(args);
      return { count: 1 };
    }),
    count: vi.fn(async (args: unknown) => {
      calls.count.push(args);
      return overrides.count ?? 0;
    }),
  };

  return {
    calls,
    stub: shoppingList,
    client: { shoppingList } as unknown as ReturnType<typeof getPrisma>,
    wsClient: { shoppingList } as unknown as ReturnType<typeof getPrismaWs>,
  };
}

function wheres(calls: unknown[]): Record<string, unknown>[] {
  return calls.map((call) => (call as { where: Record<string, unknown> }).where);
}

const ITEMS: SavedListItemInput[] = [
  { rawText: "milk", terms: "milk", quantity: 1, measure: null, brand: null, position: 0 },
];

describe("saved list scoping", () => {
  it("scopes a list by BOTH vendor and user, newest first", async () => {
    const { client, calls } = makeClient();

    const rows = await listShoppingLists(client, VENDOR, USER);

    expect(wheres(calls.findMany)[0]).toEqual({ vendorId: VENDOR, userId: USER });
    expect((calls.findMany[0] as { orderBy: unknown }).orderBy).toEqual({ updatedAt: "desc" });
    expect(rows[0]).toMatchObject({ id: "list-1", name: "Weekly shop", itemCount: 3 });
  });

  it("scopes a single read by vendor and user, not by id alone", async () => {
    // Reading by primary key alone would let a crafted id open somebody else's list.
    const { client, calls } = makeClient();

    await findShoppingList(client, VENDOR, USER, "list-1");

    expect(wheres(calls.findFirst)[0]).toEqual({ id: "list-1", vendorId: VENDOR, userId: USER });
  });

  it("reads a list's items in position order", async () => {
    const { client, calls } = makeClient();

    await findShoppingList(client, VENDOR, USER, "list-1");

    const select = (calls.findFirst[0] as { select: { items: { orderBy: unknown } } }).select;
    expect(select.items.orderBy).toEqual({ position: "asc" });
  });

  it("returns null when no row matches all three of id, vendor and user", async () => {
    const { client, stub } = makeClient();
    stub.findFirst.mockResolvedValueOnce(null);

    expect(await findShoppingList(client, VENDOR, USER, "someone-elses")).toBeNull();
  });

  it("scopes a rename by vendor and user", async () => {
    const { wsClient, calls } = makeClient();

    await renameShoppingList(wsClient, VENDOR, USER, "list-1", "New name");

    expect(wheres(calls.updateMany)[0]).toEqual({ id: "list-1", vendorId: VENDOR, userId: USER });
  });

  it("reports a rename that matched nothing as false", async () => {
    const { wsClient, stub } = makeClient();
    stub.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await renameShoppingList(wsClient, VENDOR, USER, "someone-elses", "Mine now")).toBe(
      false,
    );
  });

  it("scopes a delete by vendor and user", async () => {
    const { client, calls } = makeClient();

    await deleteShoppingList(client, VENDOR, USER, "list-1");

    expect(wheres(calls.deleteMany)[0]).toEqual({ id: "list-1", vendorId: VENDOR, userId: USER });
  });

  it("reports a delete that matched nothing as false, so a repeat is idempotent", async () => {
    const { client, stub } = makeClient();
    stub.deleteMany.mockResolvedValueOnce({ count: 0 });

    expect(await deleteShoppingList(client, VENDOR, USER, "list-1")).toBe(false);
  });

  it("counts against the cap scoped to this vendor and user", async () => {
    const { wsClient, calls } = makeClient();

    await createShoppingList(wsClient, VENDOR, USER, "Weekly shop", ITEMS);

    expect(wheres(calls.count)[0]).toEqual({ vendorId: VENDOR, userId: USER });
  });
});

describe("saved list refusals", () => {
  it("refuses a save at the cap, and writes nothing", async () => {
    const { wsClient, stub } = makeClient({ count: MAX_SAVED_LISTS });

    const created = await createShoppingList(wsClient, VENDOR, USER, "One too many", ITEMS);

    expect(created).toBeNull();
    expect(stub.create).not.toHaveBeenCalled();
  });

  it("refuses an empty list without even asking the database", async () => {
    // An empty list is what a paste of pure punctuation produces — an ordinary outcome, so it is
    // refused rather than thrown, and cheaply.
    const { wsClient, stub } = makeClient();

    const created = await createShoppingList(wsClient, VENDOR, USER, "Nothing", []);

    expect(created).toBeNull();
    expect(stub.create).not.toHaveBeenCalled();
    expect(stub.count).not.toHaveBeenCalled();
  });

  it("writes the list and its items together, scoped to this vendor and user", async () => {
    const { wsClient, calls } = makeClient();

    const created = await createShoppingList(wsClient, VENDOR, USER, "Weekly shop", ITEMS);

    expect(created).toBe("list-new");
    const data = (calls.create[0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ vendorId: VENDOR, userId: USER, name: "Weekly shop" });
    expect((data.items as { create: unknown[] }).create).toHaveLength(1);
  });
});
