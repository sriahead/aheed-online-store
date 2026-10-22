import { describe, expect, it } from "vitest";
import { getCatalogueHealth } from "@/lib/repositories/reports";

/**
 * #1211 (R14) — the staff report's stock-health figures count TRACKED rows only. An UNTRACKED row's
 * quantity is ignored by design, and an UNKNOWN one means nobody has said, so neither is "out of
 * stock" or "low". The double below APPLIES the `where` it receives (vendorId and stockMode), so
 * the test fails if the repository stops filtering — not merely if it stops passing a key.
 */

type Row = { vendorId: string; stockMode: string; quantity: number; lowStockThreshold: number };

const VENDOR = "vendor-1";
const ROWS: Row[] = [
  // TRACKED: one out, one low, one healthy
  { vendorId: VENDOR, stockMode: "TRACKED", quantity: 0, lowStockThreshold: 3 },
  { vendorId: VENDOR, stockMode: "TRACKED", quantity: 2, lowStockThreshold: 3 },
  { vendorId: VENDOR, stockMode: "TRACKED", quantity: 40, lowStockThreshold: 3 },
  // UNTRACKED and UNKNOWN rows whose quantities WOULD count if they were read
  { vendorId: VENDOR, stockMode: "UNTRACKED", quantity: 0, lowStockThreshold: 3 },
  { vendorId: VENDOR, stockMode: "UNTRACKED", quantity: 1, lowStockThreshold: 3 },
  { vendorId: VENDOR, stockMode: "UNKNOWN", quantity: 0, lowStockThreshold: 3 },
  { vendorId: VENDOR, stockMode: "UNKNOWN", quantity: 2, lowStockThreshold: 3 },
  // another vendor's tracked, out-of-stock row
  { vendorId: "vendor-2", stockMode: "TRACKED", quantity: 0, lowStockThreshold: 3 },
];

function stubPrisma() {
  return {
    product: { count: async () => 7 },
    inventory: {
      findMany: async ({ where }: { where: Partial<Row> }) =>
        ROWS.filter(
          (row) =>
            row.vendorId === where.vendorId &&
            (where.stockMode === undefined || row.stockMode === where.stockMode),
        ).map(({ quantity, lowStockThreshold }) => ({ quantity, lowStockThreshold })),
    },
  };
}

describe("getCatalogueHealth — TRACKED rows only (R14)", () => {
  it("counts exactly one out-of-stock and one low-stock row", async () => {
    const health = await getCatalogueHealth(stubPrisma() as never, VENDOR);
    expect(health.outOfStock).toBe(1);
    expect(health.lowStock).toBe(1);
  });
});
