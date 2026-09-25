import { describe, expect, it, vi } from "vitest";
import {
  createDeliveryAreaForVendor,
  createDeliveryAreasForVendor,
  listDeliveryAreasForVendor,
  removeDeliveryAreaForVendor,
  updateDeliveryAreaChargesForVendor,
} from "@/lib/repositories/delivery-areas";

/**
 * P9.2 (#612), R7, R8 and R10.
 *
 * Two failure results carry real weight here and are the reason this file exists:
 *
 * 1. A DUPLICATE prefix must come back as a typed failure, not a 500. `isUniqueViolation` covers
 *    both driver codes because the HTTP adapter `getPrisma()` returns throws the raw SQLSTATE
 *    `23505` while the WebSocket adapter normalises the same violation to `P2002`. This create runs
 *    through the HTTP client, so `23505` is the shape that actually reaches it in production — the
 *    case a test written only against `P2002` would miss, exactly as `upsertBundle` did.
 * 2. Removing the LAST remaining area must refuse. An empty prefix list makes `isDeliverable()`
 *    return false for every postcode, so checkout stops for every customer of that vendor.
 */

const VENDOR = "vendor-1";
const OTHER_VENDOR_AREA = "area-belonging-to-someone-else";

function uniqueViolation(code: "P2002" | "23505") {
  return Object.assign(new Error("Unique constraint failed"), { code });
}

function makeClient(overrides: {
  count?: number;
  deletedCount?: number;
  createImpl?: () => Promise<{ id: string }>;
}) {
  const count = vi.fn(async (_args: unknown) => overrides.count ?? 0);
  const deleteMany = vi.fn(async (_args: unknown) => ({
    count: overrides.deletedCount ?? 0,
  }));
  const create = vi.fn(
    overrides.createImpl ?? (async (_args: unknown) => ({ id: "created-area" })),
  );
  const findMany = vi.fn(async (_args: unknown) => []);

  let transactionOptions: unknown;
  const model = { count, deleteMany, create, findMany };
  const client = {
    vendorDeliveryArea: model,
    // The transaction callback is executed immediately against the same stub, so the last-area
    // guard inside it runs for real rather than being mocked away — the isolation level it was
    // opened with is captured here and asserted separately.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown, options: unknown) => {
      transactionOptions = options;
      return fn({ vendorDeliveryArea: model });
    }),
  };

  return {
    client: client as never,
    count,
    deleteMany,
    create,
    findMany,
    transaction: client.$transaction,
    options: () => transactionOptions,
  };
}

describe("createDeliveryAreaForVendor (R7)", () => {
  it("returns a typed duplicate failure for the HTTP adapter's raw SQLSTATE 23505", async () => {
    const stub = makeClient({
      createImpl: async () => {
        throw uniqueViolation("23505");
      },
    });

    const result = await createDeliveryAreaForVendor(stub.client, VENDOR, "MK");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("prefix");
  });

  it("returns the same typed failure for the WebSocket adapter's normalised P2002", async () => {
    const stub = makeClient({
      createImpl: async () => {
        throw uniqueViolation("P2002");
      },
    });

    const result = await createDeliveryAreaForVendor(stub.client, VENDOR, "MK");
    expect(result.ok).toBe(false);
  });

  it("rethrows anything that is not a unique violation, rather than swallowing it", async () => {
    const stub = makeClient({
      createImpl: async () => {
        throw Object.assign(new Error("connection lost"), { code: "P1001" });
      },
    });

    await expect(createDeliveryAreaForVendor(stub.client, VENDOR, "MK")).rejects.toThrow(
      "connection lost",
    );
  });

  it("scopes the written row to the vendor (R10)", async () => {
    const stub = makeClient({});
    await createDeliveryAreaForVendor(stub.client, VENDOR, "MK");

    const args = stub.create.mock.calls[0][0] as { data: { vendorId: string; prefix: string } };
    expect(args.data.vendorId).toBe(VENDOR);
    expect(args.data.prefix).toBe("MK");
  });
});

describe("removeDeliveryAreaForVendor (R8, R9, R10)", () => {
  it("refuses to remove the vendor's only remaining area, and issues no delete", async () => {
    const stub = makeClient({ count: 1 });

    const result = await removeDeliveryAreaForVendor(stub.client, VENDOR, "area-1");

    expect(result.ok).toBe(false);
    expect(stub.deleteMany).not.toHaveBeenCalled();
  });

  it("removes an area when others remain", async () => {
    const stub = makeClient({ count: 2, deletedCount: 1 });

    const result = await removeDeliveryAreaForVendor(stub.client, VENDOR, "area-1");

    expect(result.ok).toBe(true);
    expect(stub.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("runs the count and the delete in one Serializable transaction (R9)", async () => {
    const stub = makeClient({ count: 2, deletedCount: 1 });
    await removeDeliveryAreaForVendor(stub.client, VENDOR, "area-1");

    expect(stub.transaction).toHaveBeenCalledTimes(1);
    expect(stub.options()).toMatchObject({ isolationLevel: "Serializable" });
  });

  it("scopes both the count and the delete by vendor, so another vendor's id deletes nothing (R10)", async () => {
    const stub = makeClient({ count: 2, deletedCount: 0 });

    const result = await removeDeliveryAreaForVendor(stub.client, VENDOR, OTHER_VENDOR_AREA);

    expect(result.ok).toBe(false);
    const countArgs = stub.count.mock.calls[0][0] as { where: { vendorId: string } };
    const deleteArgs = stub.deleteMany.mock.calls[0][0] as {
      where: { id: string; vendorId: string };
    };
    expect(countArgs.where.vendorId).toBe(VENDOR);
    expect(deleteArgs.where.vendorId).toBe(VENDOR);
    expect(deleteArgs.where.id).toBe(OTHER_VENDOR_AREA);
  });
});

describe("createDeliveryAreasForVendor (#613 R9)", () => {
  it("issues one createMany, skipping duplicates, every row scoped and carrying the charges", async () => {
    const createMany = vi.fn(async (_args: unknown) => ({ count: 7 }));
    const client = { vendorDeliveryArea: { createMany } } as never;
    const prefixes = Array.from({ length: 10 }, (_, i) => `MK${i + 1}`);
    const charges = {
      deliveryFeePence: 599,
      minimumOrderPence: null,
      freeDeliveryThresholdPence: 0,
    };

    const result = await createDeliveryAreasForVendor(client, VENDOR, prefixes, charges);

    expect(createMany).toHaveBeenCalledTimes(1);
    const args = createMany.mock.calls[0][0] as {
      skipDuplicates: boolean;
      data: { vendorId: string; prefix: string; deliveryFeePence: number | null }[];
    };
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toHaveLength(10);
    for (const row of args.data) {
      expect(row).toMatchObject({ vendorId: VENDOR, ...charges });
    }
    expect(result).toEqual({ added: 7, alreadyListed: 3 });
  });
});

describe("updateDeliveryAreaChargesForVendor (#890 R24)", () => {
  it("updates by id AND vendor, so another vendor's id changes nothing", async () => {
    const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
    const client = { vendorDeliveryArea: { updateMany } } as never;
    const charges = {
      deliveryFeePence: 599,
      minimumOrderPence: 3000,
      freeDeliveryThresholdPence: 0,
    };

    const result = await updateDeliveryAreaChargesForVendor(client, VENDOR, "area-1", charges);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "area-1", vendorId: VENDOR },
      data: charges,
    });
    expect(result).toEqual({ ok: true, id: "area-1" });
  });

  it("zero rows updated is the 'no longer exists' failure", async () => {
    const updateMany = vi.fn(async (_args: unknown) => ({ count: 0 }));
    const client = { vendorDeliveryArea: { updateMany } } as never;

    const result = await updateDeliveryAreaChargesForVendor(client, VENDOR, OTHER_VENDOR_AREA, {
      deliveryFeePence: null,
      minimumOrderPence: null,
      freeDeliveryThresholdPence: null,
    });

    expect(result).toEqual({
      ok: false,
      error: "That delivery area no longer exists.",
      field: "id",
    });
  });
});

describe("listDeliveryAreasForVendor (R10)", () => {
  it("scopes the read to the vendor", async () => {
    const stub = makeClient({});
    await listDeliveryAreasForVendor(stub.client, VENDOR);

    const args = stub.findMany.mock.calls[0][0] as { where: { vendorId: string } };
    expect(args.where.vendorId).toBe(VENDOR);
  });
});
