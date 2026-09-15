import { describe, expect, it, vi } from "vitest";
import {
  deleteCustomerAddress,
  findCustomerAddress,
  listCustomerAddresses,
  saveCustomerAddress,
  touchCustomerAddress,
} from "@/lib/repositories/customer-addresses";
import type { getPrisma, getPrismaWs } from "@/lib/db";

/**
 * Saved-address scoping (#764).
 *
 * `CustomerAddress` is domain data, not reference data, so ADR-004's mandatory `vendorId` filter
 * applies in full — and `userId` alongside it. These tests capture the `where` clause every query
 * actually issues, because that is where the guard lives: not in which host served the page, and
 * not in the caller remembering to check.
 *
 * Capturing the arguments rather than running against a live database is deliberate. A live test
 * would need `it.skipIf(!process.env.DATABASE_URL)` and would therefore report as SKIPPED in CI
 * (which sets no `DATABASE_URL`), so the isolation property would go unverified on exactly the runs
 * that gate a merge. A stub proves the scoping deterministically, everywhere.
 */

const VENDOR = "vendor-a";
const OTHER_VENDOR = "vendor-b";
const USER = "user-1";

function makeClient() {
  const calls: Record<string, unknown[]> = {
    findMany: [],
    findFirst: [],
    create: [],
    update: [],
    updateMany: [],
    deleteMany: [],
    count: [],
  };

  const row = {
    id: "addr-1",
    label: null,
    recipientName: "A Shopper",
    phone: "07000 000000",
    line1: "1 Silbury Boulevard",
    line2: null,
    city: "Milton Keynes",
    county: null,
    postcode: "MK9 2NW",
    notes: null,
    isDefault: true,
  };

  const customerAddress = {
    findMany: vi.fn(async (args: unknown) => {
      calls.findMany.push(args);
      return [row];
    }),
    findFirst: vi.fn(async (args: unknown) => {
      calls.findFirst.push(args);
      return null;
    }),
    create: vi.fn(async (args: unknown) => {
      calls.create.push(args);
      return row;
    }),
    update: vi.fn(async (args: unknown) => {
      calls.update.push(args);
      return row;
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
      return 0;
    }),
  };

  return {
    calls,
    client: { customerAddress } as unknown as ReturnType<typeof getPrisma>,
    wsClient: { customerAddress } as unknown as ReturnType<typeof getPrismaWs>,
  };
}

/** Every `where` a call site issued, flattened, so a missing scope cannot hide in one of them. */
function wheres(calls: unknown[]): Record<string, unknown>[] {
  return calls.map((call) => (call as { where: Record<string, unknown> }).where);
}

describe("customer address scoping", () => {
  it("scopes a list by BOTH vendor and user", async () => {
    const { client, calls } = makeClient();

    await listCustomerAddresses(client, VENDOR, USER);

    expect(wheres(calls.findMany)[0]).toEqual({ vendorId: VENDOR, userId: USER });
  });

  it("scopes a single read by vendor and user, not by id alone", async () => {
    // Reading by primary key alone would let a crafted id fetch somebody else's address.
    const { client, calls } = makeClient();

    await findCustomerAddress(client, VENDOR, USER, "addr-1");

    expect(wheres(calls.findFirst)[0]).toEqual({ id: "addr-1", vendorId: VENDOR, userId: USER });
  });

  it("scopes a delete by vendor and user", async () => {
    const { client, calls } = makeClient();

    await deleteCustomerAddress(client, VENDOR, USER, "addr-1");

    expect(wheres(calls.deleteMany)[0]).toEqual({ id: "addr-1", vendorId: VENDOR, userId: USER });
  });

  it("scopes a touch by vendor and user", async () => {
    const { wsClient, calls } = makeClient();

    await touchCustomerAddress(wsClient, VENDOR, USER, "addr-1");

    expect(wheres(calls.updateMany)[0]).toEqual({ id: "addr-1", vendorId: VENDOR, userId: USER });
  });

  it("never issues a query scoped to only one of vendor or user", async () => {
    const { client, wsClient, calls } = makeClient();

    await listCustomerAddresses(client, VENDOR, USER);
    await findCustomerAddress(client, VENDOR, USER, "addr-1");
    await saveCustomerAddress(client, VENDOR, USER, {
      recipientName: "A Shopper",
      phone: "07000 000000",
      line1: "1 Silbury Boulevard",
      city: "Milton Keynes",
      postcode: "MK9 2NW",
    });
    await touchCustomerAddress(wsClient, VENDOR, USER, "addr-1");
    await deleteCustomerAddress(client, VENDOR, USER, "addr-1");

    const all = [
      ...wheres(calls.findMany),
      ...wheres(calls.findFirst),
      ...wheres(calls.updateMany),
      ...wheres(calls.deleteMany),
      ...wheres(calls.count),
    ];

    expect(all.length).toBeGreaterThan(0);
    for (const where of all) {
      expect(where.vendorId).toBe(VENDOR);
      expect(where.userId).toBe(USER);
    }
  });

  it("writes the vendor and user onto a newly created row", async () => {
    const { client, calls } = makeClient();

    await saveCustomerAddress(client, VENDOR, USER, {
      recipientName: "A Shopper",
      phone: "07000 000000",
      line1: "1 Silbury Boulevard",
      city: "Milton Keynes",
      postcode: "MK9 2NW",
    });

    const created = (calls.create[0] as { data: Record<string, unknown> }).data;
    expect(created.vendorId).toBe(VENDOR);
    expect(created.userId).toBe(USER);
  });

  it("cannot be tricked into reading another vendor's row by passing its id", async () => {
    const { client, calls } = makeClient();

    await findCustomerAddress(client, OTHER_VENDOR, USER, "addr-belonging-to-vendor-a");

    // The query is scoped to vendor B, so vendor A's row is simply not in scope — the guard is in
    // the WHERE clause, not in a check the caller could forget.
    expect(wheres(calls.findFirst)[0]).toMatchObject({ vendorId: OTHER_VENDOR });
  });
});

describe("saveCustomerAddress", () => {
  it("normalises the postcode into its canonical spaced form", async () => {
    const { client, calls } = makeClient();

    await saveCustomerAddress(client, VENDOR, USER, {
      recipientName: "A Shopper",
      phone: "07000 000000",
      line1: "1 Silbury Boulevard",
      city: "Milton Keynes",
      postcode: "mk9  2nw",
    });

    expect((calls.create[0] as { data: Record<string, unknown> }).data.postcode).toBe("MK9 2NW");
  });

  it("trims whitespace and stores an empty optional field as null, not as a blank string", async () => {
    const { client, calls } = makeClient();

    await saveCustomerAddress(client, VENDOR, USER, {
      recipientName: "  A Shopper  ",
      phone: "07000 000000",
      line1: "  1 Silbury Boulevard  ",
      line2: "   ",
      city: "Milton Keynes",
      postcode: "MK9 2NW",
    });

    const created = (calls.create[0] as { data: Record<string, unknown> }).data;
    expect(created.recipientName).toBe("A Shopper");
    expect(created.line1).toBe("1 Silbury Boulevard");
    expect(created.line2).toBeNull();
  });

  it("marks a shopper's first saved address as their default", async () => {
    const { client, calls } = makeClient();

    await saveCustomerAddress(client, VENDOR, USER, {
      recipientName: "A Shopper",
      phone: "07000 000000",
      line1: "1 Silbury Boulevard",
      city: "Milton Keynes",
      postcode: "MK9 2NW",
    });

    expect((calls.create[0] as { data: Record<string, unknown> }).data.isDefault).toBe(true);
  });
});
