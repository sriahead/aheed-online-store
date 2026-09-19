import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The saved-list facade (#116) — two properties no other test covers.
 *
 * 1. **Guests are refused, not served and not thrown at.** A guest has no durable identity to own
 *    a saved record. Every method has to return an empty/null/false result so a caller never has
 *    to distinguish "signed out" from "went wrong", and — the part that matters — so no write is
 *    ever attempted without an owner.
 *
 * 2. **The right client reaches the right repository function.** `create` and `rename` crash
 *    unconditionally on the HTTP adapter (#382) while every stub-based test passes, so the ONE
 *    place that choice is made is asserted here by identity. This does not prove the WS client
 *    works — only the live rows do that — but it does prove the wiring cannot silently swap.
 */

// vi.mock factories are hoisted above every const in this file, so the shared doubles have to be
// created inside vi.hoisted() or the factory closes over a temporal-dead-zone binding.
const { HTTP, WS, repo, userId } = vi.hoisted(() => ({
  HTTP: { tag: "http" },
  WS: { tag: "ws" },
  // Signatures spelled out rather than inferred: these tests assert on `mock.calls[0][0]`, and a
  // zero-argument inferred signature makes every recorded call an empty tuple with no index 0.
  repo: {
    listShoppingLists: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
    findShoppingList: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null),
    createShoppingList: vi.fn<(...args: unknown[]) => Promise<string | null>>(async () => "list-1"),
    renameShoppingList: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
    deleteShoppingList: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
  },
  userId: vi.fn<() => Promise<string | null>>(async () => "user-1"),
}));

vi.mock("@/lib/db", () => ({ getPrisma: () => HTTP, getPrismaWs: () => WS }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: async () => "vendor-a" }));
vi.mock("@/lib/cart-identity", () => ({ getUserId: () => userId() }));
vi.mock("@/lib/repositories/shopping-lists", () => repo);

import { getShoppingListService } from "@/lib/shopping-lists-service";

const ITEMS = [
  { rawText: "milk", terms: "milk", quantity: 1, measure: null, brand: null, position: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  userId.mockResolvedValue("user-1");
});

describe("guests are not served", () => {
  beforeEach(() => userId.mockResolvedValue(null));

  it("returns empty, null or false for every method and never throws", async () => {
    const service = getShoppingListService();

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.find("list-1")).resolves.toBeNull();
    await expect(service.save("Weekly shop", ITEMS)).resolves.toBeNull();
    await expect(service.rename("list-1", "New name")).resolves.toBe(false);
    await expect(service.remove("list-1")).resolves.toBe(false);
  });

  it("attempts no repository call at all", async () => {
    const service = getShoppingListService();

    await service.list();
    await service.find("list-1");
    await service.save("Weekly shop", ITEMS);
    await service.rename("list-1", "New name");
    await service.remove("list-1");

    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("client injection", () => {
  it("gives the WEBSOCKET client to the two writes that cannot run on HTTP", async () => {
    const service = getShoppingListService();

    await service.save("Weekly shop", ITEMS);
    await service.rename("list-1", "New name");

    expect(repo.createShoppingList.mock.calls[0][0]).toBe(WS);
    expect(repo.renameShoppingList.mock.calls[0][0]).toBe(WS);
  });

  it("gives the ordinary client to the reads and the delete", async () => {
    const service = getShoppingListService();

    await service.list();
    await service.find("list-1");
    await service.remove("list-1");

    expect(repo.listShoppingLists.mock.calls[0][0]).toBe(HTTP);
    expect(repo.findShoppingList.mock.calls[0][0]).toBe(HTTP);
    expect(repo.deleteShoppingList.mock.calls[0][0]).toBe(HTTP);
  });

  it("passes the resolved vendor and user through as data", async () => {
    const service = getShoppingListService();

    await service.list();

    expect(repo.listShoppingLists.mock.calls[0].slice(1, 3)).toEqual(["vendor-a", "user-1"]);
  });
});
