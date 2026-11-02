import { describe, it, expect, vi } from "vitest";

/**
 * #1399 R9 — several receiving addresses of one store may forward to the same mailbox. Only the
 * receiving address is unique (`VendorInboundAddress.address @unique`); `forwardTo` is not. This
 * pins that at the service boundary so a later "dedupe" cannot quietly remove it.
 *
 * The Prisma double keeps rows in memory and enforces uniqueness on `address` only, as the schema
 * does. The real database is exercised by the slice's live check (validation.md, R8).
 */

type Row = {
  id: string;
  vendorId: string;
  address: string;
  purpose: "ORDERS" | "SUPPORT";
  forwardTo: string;
  createdAt: Date;
};

const rows: Row[] = [];
const prismaDouble = {
  vendorInboundAddress: {
    findUnique: vi.fn(async ({ where }: { where: { address: string } }) => {
      return rows.find((r) => r.address === where.address) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
      if (rows.some((r) => r.address === data.address)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      const row = { ...data, id: `id-${rows.length}`, createdAt: new Date(0) };
      rows.push(row);
      return row;
    }),
  },
};

vi.mock("@/lib/db", () => ({ getPrisma: () => prismaDouble }));

const { addInboundAddress } = await import("@/lib/client-setup-service");

describe("addInboundAddress: many addresses to one mailbox (R9)", () => {
  it("saves two addresses of one store with the same forward-to", async () => {
    const first = await addInboundAddress("v1", {
      address: "info@shop.test",
      purpose: "SUPPORT",
      forwardTo: "hub@inbox.test",
    });
    const second = await addInboundAddress("v1", {
      address: "orders@shop.test",
      purpose: "ORDERS",
      forwardTo: "Hub@Inbox.test",
    });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(rows.filter((r) => r.forwardTo === "hub@inbox.test")).toHaveLength(2);
  });

  it("still refuses a forward-to that is itself a receiving address", async () => {
    const looped = await addInboundAddress("v1", {
      address: "help@shop.test",
      purpose: "SUPPORT",
      forwardTo: "info@shop.test",
    });
    expect(looped).toEqual({ ok: false, reason: "loop" });
  });
});
