import { describe, expect, it, vi } from "vitest";
import { countOtherVendorData, exportPersonalData } from "@/lib/repositories/data-rights";
import type { getPrisma } from "@/lib/db";

/**
 * Saved lists in the data-subject-rights surfaces (#116).
 *
 * A new user-owned table is personal data, and it has to reach THREE places in
 * `lib/repositories/data-rights.ts` — the export, the other-vendor count, and the erasure. Nothing
 * in `lint`, `typecheck` or `build` enforces that: a new table simply goes undisclosed, and both
 * Art. 15 and Art. 20 silently under-report. That is the failure mode P7b (#216) exists to
 * prevent, so the two read paths are pinned here.
 *
 * The erasure half is proved live, by this slice's `verify-saved-lists.ts --erase` row, because
 * `eraseVendorData` runs inside an interactive `$transaction` that a stub cannot honestly
 * reproduce — a fake `$transaction` would prove the call was made, not that it was atomic.
 *
 * The stub is a Proxy so this file states only the models it actually cares about. Every other
 * model answers with the empty shape `exportPersonalData` maps over, which keeps the test focused
 * on the new field instead of re-describing thirteen unrelated queries.
 */

const VENDOR = "vendor-a";
const USER = "user-1";

const SAVED_LISTS = [
  {
    name: "Weekly shop",
    createdAt: new Date("2026-09-18T10:00:00Z"),
    items: [
      { rawText: "2x chicken breast", quantity: 2 },
      { rawText: "5kg basmati rice", quantity: 1 },
    ],
  },
];

function makeClient(counts: Record<string, number> = {}) {
  const calls: { model: string; args: unknown }[] = [];

  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) =>
          vi.fn(async (args: unknown) => {
            calls.push({ model: name, args });
            switch (method) {
              case "count":
                return counts[name] ?? 0;
              case "findUnique":
                return null;
              case "findUniqueOrThrow":
                return name === "vendor"
                  ? { id: VENDOR, name: "Aheed Food Centre" }
                  : {
                      id: USER,
                      name: "A Shopper",
                      email: "shopper@example.com",
                      emailVerified: true,
                      role: "CUSTOMER",
                      createdAt: new Date("2026-01-01T00:00:00Z"),
                    };
              case "findMany":
                return name === "shoppingList" ? SAVED_LISTS : [];
              default:
                return { count: 0 };
            }
          }),
      },
    );

  const client = new Proxy({}, { get: (_t, name: string) => model(name) });
  return { calls, client: client as unknown as ReturnType<typeof getPrisma> };
}

describe("saved lists are disclosed in a data export", () => {
  it("includes each list's name, date and the shopper's own lines", async () => {
    const { client } = makeClient();

    const exported = await exportPersonalData(client, VENDOR, USER);

    expect(exported.savedLists).toEqual(SAVED_LISTS);
  });

  it("discloses rawText and quantity but not the derived search terms", async () => {
    // `terms` is our tokenisation, not something the subject supplied. Handing it back as though
    // it were their data would overstate what they gave us.
    const { client } = makeClient();

    const exported = await exportPersonalData(client, VENDOR, USER);

    expect(Object.keys(exported.savedLists[0].items[0]).sort()).toEqual(["quantity", "rawText"]);
  });

  it("reads the shopper's lists scoped to this vendor, in position order", async () => {
    const { client, calls } = makeClient();

    await exportPersonalData(client, VENDOR, USER);

    const call = calls.find((c) => c.model === "shoppingList");
    expect(call).toBeDefined();
    const args = call!.args as {
      where: unknown;
      select: { items: { orderBy: unknown } };
    };
    expect(args.where).toEqual({ vendorId: VENDOR, userId: USER });
    expect(args.select.items.orderBy).toEqual({ position: "asc" });
  });
});

describe("saved lists count as data held elsewhere", () => {
  it("counts lists held for this user by OTHER vendors", async () => {
    // If they did not count, a shopper whose only remaining data at another vendor was a saved
    // list would have their shared identity deleted out from under them.
    const { client } = makeClient({ shoppingList: 2 });

    const total = await countOtherVendorData(client, USER, VENDOR);

    expect(total).toBe(2);
  });

  it("excludes the vendor being erased", async () => {
    const { client, calls } = makeClient({ shoppingList: 2 });

    await countOtherVendorData(client, USER, VENDOR);

    const call = calls.find((c) => c.model === "shoppingList");
    expect(call!.args).toEqual({ where: { vendorId: { not: VENDOR }, userId: USER } });
  });
});
