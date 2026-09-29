import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimPaymentReconciliation,
  recordPaymentReconciliationOutcome,
  rearmPaymentReconciliation,
} from "@/lib/repositories/payment-reconciliations";

/**
 * The claim / record / re-arm queries of #945, against a recording fake client.
 *
 * These assert the SHAPE of each query — which `where` guards a write, what it
 * sets — because that shape is the whole mechanism. They cannot prove Postgres
 * evaluates it as intended; `validation.md`'s live rows (R42, R43, R45) do that
 * against a real database. No module mock is needed: every function takes its
 * client as an argument.
 */

const createMany = vi.fn();
const updateMany = vi.fn();
const client = {
  paymentReconciliation: { createMany, updateMany },
} as unknown as Parameters<typeof claimPaymentReconciliation>[0];

const CLAIMED_AT = new Date("2026-09-29T12:00:00.000Z");
const LEASE_UNTIL = new Date("2026-09-29T12:10:00.000Z");

beforeEach(() => {
  createMany.mockReset();
  updateMany.mockReset();
});

describe("claimPaymentReconciliation", () => {
  it("R8: a first claim inserts the row and needs no update", async () => {
    createMany.mockResolvedValue({ count: 1 });

    await expect(
      claimPaymentReconciliation(client, "v-aheed", "o-1", CLAIMED_AT, LEASE_UNTIL),
    ).resolves.toBe(true);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          orderId: "o-1",
          vendorId: "v-aheed",
          attemptCount: 1,
          lastAttemptAt: CLAIMED_AT,
          nextAttemptAt: LEASE_UNTIL,
        },
      ],
      skipDuplicates: true,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("R8: an existing row is claimed only while due and unexhausted", async () => {
    createMany.mockResolvedValue({ count: 0 });
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      claimPaymentReconciliation(client, "v-aheed", "o-1", CLAIMED_AT, LEASE_UNTIL),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        orderId: "o-1",
        vendorId: "v-aheed",
        exhaustedAt: null,
        nextAttemptAt: { lte: CLAIMED_AT },
      },
      data: {
        lastAttemptAt: CLAIMED_AT,
        nextAttemptAt: LEASE_UNTIL,
        attemptCount: { increment: 1 },
      },
    });
  });

  it("R8: a row another run holds is not claimed", async () => {
    createMany.mockResolvedValue({ count: 0 });
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      claimPaymentReconciliation(client, "v-aheed", "o-1", CLAIMED_AT, LEASE_UNTIL),
    ).resolves.toBe(false);
  });
});

describe("recordPaymentReconciliationOutcome", () => {
  const RECORD = {
    outcome: "RETRYABLE_ERROR" as const,
    consecutiveFailures: 2,
    nextAttemptAt: LEASE_UNTIL,
    lastErrorStatus: 503,
    exhaustedAt: null,
  };

  it("R9: writes only while the row still carries this claim's instant", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      recordPaymentReconciliationOutcome(client, "v-aheed", "o-1", CLAIMED_AT, RECORD),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { orderId: "o-1", vendorId: "v-aheed", lastAttemptAt: CLAIMED_AT },
      data: {
        lastOutcome: "RETRYABLE_ERROR",
        consecutiveFailures: 2,
        nextAttemptAt: LEASE_UNTIL,
        lastErrorStatus: 503,
        exhaustedAt: null,
      },
    });
  });

  it("R9: a re-claimed row is left alone", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      recordPaymentReconciliationOutcome(client, "v-aheed", "o-1", CLAIMED_AT, RECORD),
    ).resolves.toBe(false);
  });
});

describe("rearmPaymentReconciliation", () => {
  it("R11: re-arms only an exhausted provider failure on an order still awaiting payment", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(rearmPaymentReconciliation(client, "v-aheed", "AH-1", CLAIMED_AT)).resolves.toBe(
      true,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        vendorId: "v-aheed",
        exhaustedAt: { not: null },
        lastOutcome: { in: ["RETRYABLE_ERROR", "PERMANENT_ERROR"] },
        order: { orderNumber: "AH-1", status: "PENDING_PAYMENT" },
      },
      data: { exhaustedAt: null, consecutiveFailures: 0, nextAttemptAt: CLAIMED_AT },
    });
  });

  it("R11: reports nothing re-armed when the where matched nothing", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(rearmPaymentReconciliation(client, "v-aheed", "AH-1", CLAIMED_AT)).resolves.toBe(
      false,
    );
  });
});
