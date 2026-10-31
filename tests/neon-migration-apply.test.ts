import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPLY_TRANSACTION_OPTIONS,
  SimulatedFailure,
  applyPlan,
  type ApplyClient,
  type ApplyPlan,
} from "../scripts/lib/neon-migration-apply";

// #1333 — specs/2026-10-31-atomic-neon-copy/ (R1-R5).

type Call = { model: string; op: "createMany" | "deleteMany"; size?: number };

function recorder(failOn?: { model: string; call: number }) {
  const calls: Call[] = [];
  let createCount = 0;
  const client: ApplyClient = (model) => ({
    createMany: async ({ data }) => {
      createCount += 1;
      if (failOn && failOn.model === model && failOn.call === createCount) {
        throw new Error(`duplicate key in ${model}`);
      }
      calls.push({ model, op: "createMany", size: data.length });
    },
    deleteMany: async () => {
      calls.push({ model, op: "deleteMany" });
    },
  });
  return { client, calls };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

function plan(counts: Record<string, number>, domains = 2): ApplyPlan {
  return {
    order: Object.keys(counts),
    rows: new Map(Object.entries(counts).map(([m, n]) => [m, rows(n)])),
    domains: rows(domains),
  };
}

const SEEDED = { replaceSeeded: true, seededVendorId: "seeded-id" };

describe("applyPlan (#1333)", () => {
  it("(a) deletes the seeded vendor first, then copies in plan order, then VendorDomain", async () => {
    const { client, calls } = recorder();
    await applyPlan(client, plan({ User: 1, Vendor: 2, Product: 3 }), SEEDED);
    expect(calls.map((c) => `${c.op}:${c.model}`)).toEqual([
      "deleteMany:Vendor",
      "createMany:User",
      "createMany:Vendor",
      "createMany:Product",
      "createMany:VendorDomain",
    ]);
  });

  it("(b) writes 1,201 rows as chunks of 500, 500 and 201", async () => {
    const { client, calls } = recorder();
    await applyPlan(client, plan({ Product: 1201 }, 0), SEEDED);
    expect(calls.filter((c) => c.model === "Product").map((c) => c.size)).toEqual([500, 500, 201]);
  });

  it("(c) leaves the seeded vendor alone when replaceSeeded is false", async () => {
    const { client, calls } = recorder();
    await applyPlan(client, plan({ Vendor: 1 }), { ...SEEDED, replaceSeeded: false });
    expect(calls.some((c) => c.op === "deleteMany")).toBe(false);
  });

  it("(d) makes no call for a zero-row model or empty domains", async () => {
    const { client, calls } = recorder();
    await applyPlan(client, plan({ User: 0, Vendor: 1 }, 0), SEEDED);
    expect(calls.map((c) => `${c.op}:${c.model}`)).toEqual([
      "deleteMany:Vendor",
      "createMany:Vendor",
    ]);
  });

  it("(e) simulateFailure rejects with SimulatedFailure only after the VendorDomain write", async () => {
    const { client, calls } = recorder();
    await expect(
      applyPlan(client, plan({ Vendor: 1, Product: 2 }), { ...SEEDED, simulateFailure: true }),
    ).rejects.toBeInstanceOf(SimulatedFailure);
    expect(calls.at(-1)).toEqual({ model: "VendorDomain", op: "createMany", size: 2 });
  });

  it("(f) a rejected write propagates unchanged and stops every later write", async () => {
    const { client, calls } = recorder({ model: "Product", call: 2 });
    await expect(
      applyPlan(client, plan({ Vendor: 1, Product: 3, Inventory: 3 }), SEEDED),
    ).rejects.toThrow("duplicate key in Product");
    expect(calls.map((c) => `${c.op}:${c.model}`)).toEqual([
      "deleteMany:Vendor",
      "createMany:Vendor",
    ]);
  });

  it("(g) the transaction options are 30 s wait and a 10 min timeout", () => {
    expect(APPLY_TRANSACTION_OPTIONS).toEqual({ maxWait: 30_000, timeout: 600_000 });
  });
});

describe("migrate-to-new-neon.ts writes only inside its transaction (#1333 R5)", () => {
  const source = readFileSync("scripts/migrate-to-new-neon.ts", "utf8");
  const count = (needle: string) => source.split(needle).length - 1;

  it("has exactly one $transaction, with APPLY_TRANSACTION_OPTIONS", () => {
    expect(count("$transaction(")).toBe(1);
    expect(source).toMatch(
      /\$transaction\(\s*\(tx\) =>[\s\S]*?\}\),\s*APPLY_TRANSACTION_OPTIONS,?\s*\)/,
    );
  });

  it("calls applyPlan once, inside the callback, on the transaction client", () => {
    expect(count("applyPlan(")).toBe(1);
    expect(source).toMatch(/\(tx\) =>\s*applyPlan\(\(model\) => delegate\(tx, model\)/);
  });

  it("makes no direct write call", () => {
    for (const write of [
      ".createMany(",
      ".deleteMany(",
      ".create(",
      ".update(",
      ".updateMany(",
      ".upsert(",
      ".delete(",
    ]) {
      expect(count(write), write).toBe(0);
    }
  });
});
