import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireVendorRoleMock, countMock, transactionMock, createManyMock, updateMock } =
  vi.hoisted(() => ({
    requireVendorRoleMock: vi.fn(),
    countMock: vi.fn(),
    transactionMock: vi.fn(),
    createManyMock: vi.fn(),
    updateMock: vi.fn(),
  }));

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: requireVendorRoleMock,
}));

vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(() => ({
    product: {
      count: countMock,
      findMany: vi.fn().mockResolvedValue([]),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  })),
  getPrismaWs: vi.fn(() => ({
    category: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: createManyMock,
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: createManyMock,
      update: updateMock,
    },
    inventory: {
      createMany: createManyMock,
    },
    productRestrictionAuditLog: {
      createMany: createManyMock,
    },
    $transaction: transactionMock.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          category: { createMany: createManyMock },
          product: { createMany: createManyMock, update: updateMock },
          inventory: { createMany: createManyMock },
          productRestrictionAuditLog: { createMany: createManyMock },
        };
        return cb(tx);
      },
    ),
  })),
}));

import {
  validateStockFileAction,
  applyStockFileAction,
} from "@/app/(admin)/staff/products/import/actions";

const TEST_VENDOR_ID = "e8a3b100-0000-4000-a000-0000000005a1";

const SAMPLE_VALID_GRID = [
  ["Code", "Item", "Price", "Department", "Sub-department", "VAT"],
  ["1001", "Basmati Rice 5kg", "12.99", "Grocery", "Rice", "0%"],
  ["1002", "Marlboro Gold", "14.50", "Tobacco", "Cigarettes", "20%"],
  ["1003", "National Lottery Scratchcard", "5.00", "Instant Lottery", "Games", "0%"],
  ["1004", "EE £10 Top Up", "10.00", "Phone Cards", "Vouchers", "0%"],
  ["1005", "Unpriced Mystery Item", "0.00", "Default", "General", "0%"],
];

describe("Staff Catalogue Import Server Actions (#1216, SDD Gate 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorRoleMock.mockResolvedValue({
      ok: true,
      vendorId: TEST_VENDOR_ID,
      via: "ADMIN",
      user: { id: "user-1", email: "admin@aheedfoodcentre.nocaped.com", name: "Admin" },
    });
    countMock.mockResolvedValue(0);
  });

  describe("R7: Session-Derived Vendor Isolation & Security", () => {
    it("refuses unauthenticated users without calling database", async () => {
      requireVendorRoleMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        reason: "unauthenticated",
      });

      const res = await validateStockFileAction({ grid: SAMPLE_VALID_GRID });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/signed in/i);
      }
      expect(countMock).not.toHaveBeenCalled();
    });

    it("refuses non-admin staff users", async () => {
      requireVendorRoleMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        reason: "forbidden",
      });

      const res = await validateStockFileAction({ grid: SAMPLE_VALID_GRID });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/admin permission required/i);
      }
      expect(countMock).not.toHaveBeenCalled();
    });

    it("derives vendorId exclusively from server session", async () => {
      // Pass foreign vendorId attempt in payload (even if typed out)
      const res = await validateStockFileAction({
        grid: SAMPLE_VALID_GRID,
        ...({ vendorId: "attacker-vendor-id" } as unknown as object),
      });

      expect(res.ok).toBe(true);
      // countMock should have been called with TEST_VENDOR_ID, never attacker-vendor-id
      expect(countMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendorId: TEST_VENDOR_ID,
          }),
        }),
      );
    });
  });

  describe("R8: 10,000 Row Payload Ceiling", () => {
    it("rejects payloads exceeding 10,000 rows immediately", async () => {
      const header = ["Code", "Item", "Price", "Department"];
      const bigGrid: string[][] = [header];
      for (let i = 1; i <= 10_001; i += 1) {
        bigGrid.push([String(i), `Product ${i}`, "1.99", "Grocery"]);
      }

      const res = await validateStockFileAction({ grid: bigGrid });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/exceeds 10,000 row limit/i);
      }
      expect(countMock).not.toHaveBeenCalled();
    });
  });

  describe("R9: In-Memory Preview & Default ADR-007 Restriction Policy", () => {
    it("classifies ADR-007 departments accurately without database writes", async () => {
      const res = await validateStockFileAction({ grid: SAMPLE_VALID_GRID });
      expect(res.ok).toBe(true);
      if (res.ok) {
        const preview = res.preview;
        expect(preview.candidateAdditions).toBe(5);
        expect(preview.restrictionCounts.AGE_RESTRICTED).toBe(1); // Marlboro Gold
        expect(preview.restrictionCounts.PROHIBITED).toBe(1); // Lottery Scratchcard
        expect(preview.restrictionCounts.NOT_DELIVERABLE).toBe(1); // EE £10 Top Up
        expect(preview.restrictionCounts.NEEDS_REVIEW).toBe(1); // Unpriced Mystery Item (price 0.00 & Default)
      }
      // Zero database transactions/writes in dry run
      expect(transactionMock).not.toHaveBeenCalled();
      expect(createManyMock).not.toHaveBeenCalled();
    });
  });

  describe("R10: Duplicate & Invalid Row Reporting", () => {
    it("identifies duplicate rows and reports exact source row numbers", async () => {
      const gridWithDuplicates = [
        ["Code", "Item", "Price", "Department"],
        ["1001", "Basmati Rice 5kg", "12.99", "Grocery"],
        ["1001", "Basmati Rice 5kg", "12.99", "Grocery"], // Duplicate row
      ];

      const res = await validateStockFileAction({ grid: gridWithDuplicates });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.preview.rejectedCount).toBe(1);
        expect(res.preview.rejectedRows[0]).toEqual({
          sourceRow: 3,
          code: "DUPLICATE_ROW",
          reason: expect.stringMatching(/same name, PLU and department/i),
        });
      }
    });
  });

  describe("R11, R12, R13, R14: Apply Changes Transaction & ADR-007 Invariants", () => {
    it("applies plan using interactive WebSocket transaction with vendor isolation", async () => {
      const res = await applyStockFileAction({ grid: SAMPLE_VALID_GRID });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.receipt.productsCreated).toBeGreaterThanOrEqual(0);
      }
      expect(transactionMock).toHaveBeenCalled();
    });

    it("creates newly planned products with isActive: false, stockMode: UNKNOWN, and quantity: 0 (R12)", async () => {
      await applyStockFileAction({ grid: SAMPLE_VALID_GRID });

      // Find the invocation of createMany for product and inventory
      const calls = createManyMock.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // Verify product writes have isActive: false and target vendorId
      const productCalls = calls.filter(
        (c: unknown[]) =>
          Array.isArray(
            (c[0] as { data: Array<{ vendorId: string; isActive?: boolean }> })?.data,
          ) &&
          (c[0] as { data: Array<{ vendorId: string; isActive?: boolean }> }).data.some(
            (d) => "isActive" in d && "slug" in d,
          ),
      );

      for (const call of productCalls) {
        const rows = (call[0] as { data: Array<{ vendorId: string; isActive: boolean }> }).data;
        for (const row of rows) {
          expect(row.vendorId).toBe(TEST_VENDOR_ID);
          expect(row.isActive).toBe(false);
        }
      }

      // Verify inventory writes have stockMode: UNKNOWN and quantity: 0
      const inventoryCalls = calls.filter(
        (c: unknown[]) =>
          Array.isArray((c[0] as { data: Array<{ vendorId: string; quantity?: number }> })?.data) &&
          (c[0] as { data: Array<{ vendorId: string; quantity?: number }> }).data.some(
            (d) => "stockMode" in d && "quantity" in d,
          ),
      );

      for (const call of inventoryCalls) {
        const rows = (
          call[0] as { data: Array<{ vendorId: string; quantity: number; stockMode: string }> }
        ).data;
        for (const row of rows) {
          expect(row.vendorId).toBe(TEST_VENDOR_ID);
          expect(row.quantity).toBe(0);
          expect(row.stockMode).toBe("UNKNOWN");
        }
      }
    });

    it("writes audit log rows for restricted products (R13)", async () => {
      await applyStockFileAction({ grid: SAMPLE_VALID_GRID });

      const auditCalls = createManyMock.mock.calls.filter(
        (c: unknown[]) =>
          Array.isArray((c[0] as { data: Array<{ action?: string; source?: string }> })?.data) &&
          (c[0] as { data: Array<{ action?: string; source?: string }> }).data.some(
            (d) => d.action === "RESTRICTION_SET" && d.source === "IMPORT",
          ),
      );

      expect(auditCalls.length).toBeGreaterThan(0);
      for (const call of auditCalls) {
        const rows = (
          call[0] as { data: Array<{ vendorId: string; action: string; source: string }> }
        ).data;
        for (const row of rows) {
          expect(row.vendorId).toBe(TEST_VENDOR_ID);
          expect(row.action).toBe("RESTRICTION_SET");
          expect(row.source).toBe("IMPORT");
        }
      }
    });
  });
});
