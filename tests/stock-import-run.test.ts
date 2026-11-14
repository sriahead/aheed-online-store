import { describe, expect, it, vi } from "vitest";
import {
  applyImportChunk,
  decideImportLine,
  reopenFailedLines,
} from "@/lib/repositories/stock-import";
import { readyToApply, reviewGroup } from "@/lib/stock-import/review";
import {
  buildLookups,
  cellsToGrid,
  gridToCells,
  plannedLineData,
} from "@/lib/stock-import/run-lines";
import type { PlanLine } from "@/lib/stock-import/plan";
import type { NormalisedRow } from "@/lib/stock-import/normalise";

/** #1578 R3–R7 — stored runs: the grid, plan lines, review groups, decisions and the apply guards. */

describe("grid cells", () => {
  it("keeps non-empty cells only and rebuilds the same grid, trailing empty rows included", () => {
    const grid = [
      ["Laziza", "", ""],
      ["Pasanda masala", "100grm", "£2.79"],
      ["", "", ""],
    ];
    const cells = gridToCells(grid);
    expect(cells).toHaveLength(4);
    expect(cellsToGrid(cells, 3)).toEqual(grid);
  });
});

describe("plan line → stored line", () => {
  it("keeps what the review screen shows", () => {
    const row = {
      key: "Laziza.xlsx#12",
      rowNumber: 12,
      sourceText: "Haleem Masala 100grm £2.79",
      displayName: "Laziza Haleem Masala – 100g",
      brand: "Laziza",
      sizeLabel: "100g",
      pricePence: 279,
      category: { slug: "spices-masalas" },
      issues: [],
    } as unknown as NormalisedRow;
    const line = {
      row,
      listRow: row,
      decision: "UPDATE",
      confidence: "HIGH",
      reason: "brand, size and name match (1.00)",
      target: { id: "p1", name: "LAZIZA HALEEM MASALA 100G", plu: "3668" },
      runnerUp: null,
      otherSizes: [{ name: "LAZIZA(HALEEM)375G", plu: "5922" }],
      changes: [{ field: "basePrice", from: "£2.69", to: "£2.79" }],
      kept: [],
      tillWords: [],
    } as unknown as PlanLine;
    const lookups = buildLookups(
      { brands: [] } as never,
      [],
      [{ id: "c1", slug: "spices-masalas", name: "Spices & Masalas" }],
    );
    expect(plannedLineData(line, 3, lookups)).toMatchObject({
      key: "Laziza.xlsx#12",
      position: 3,
      suggestion: "UPDATE",
      categoryName: "Spices & Masalas",
      targetProductId: "p1",
      otherSizes: "LAZIZA(HALEEM)375G (5922)",
      changeSummary: "basePrice: £2.69 → £2.79",
    });
  });
});

describe("review groups", () => {
  const line = (over: Partial<Parameters<typeof reviewGroup>[0]>) => ({
    decision: "UPDATE",
    status: "OPEN",
    changeSummary: "",
    decidedAt: null,
    ...over,
  });
  it("puts each line where the store looks for it", () => {
    expect(reviewGroup(line({ decision: "HOLD" }))).toBe("decide");
    expect(reviewGroup(line({ decision: "REVIEW" }))).toBe("decide");
    expect(reviewGroup(line({ decision: "CREATE" }))).toBe("create");
    expect(reviewGroup(line({}))).toBe("unchanged");
    expect(reviewGroup(line({ changeSummary: "basePrice: £1 → £2" }))).toBe("update");
    expect(reviewGroup(line({ decidedAt: "2026-11-14T00:00:00Z" }))).toBe("update");
    expect(reviewGroup(line({ decision: "DUPLICATE" }))).toBe("skip");
    expect(reviewGroup(line({ status: "APPLIED" }))).toBe("applied");
    expect(reviewGroup(line({ status: "FAILED" }))).toBe("failed");
  });
  it("counts only decided, unapplied Update/Create lines as ready", () => {
    expect(
      readyToApply([
        { decision: "UPDATE", status: "OPEN" },
        { decision: "CREATE", status: "FAILED" },
        { decision: "HOLD", status: "OPEN" },
        { decision: "UPDATE", status: "APPLIED" },
      ]),
    ).toBe(2);
  });
});

describe("decisions", () => {
  it("refuses an applied line and an UPDATE without a product of this store", async () => {
    const db = {
      stockImportLine: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ status: "APPLIED" })
          .mockResolvedValue({ status: "OPEN" }),
        update: vi.fn(),
      },
      product: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const input = { decision: "UPDATE" as const, targetProductId: "other-store", note: "" };
    expect(await decideImportLine(db as never, "v1", "l1", "u1", input)).toMatchObject({
      ok: false,
    });
    expect(await decideImportLine(db as never, "v1", "l1", "u1", input)).toEqual({
      ok: false,
      error: "That product is not in this store.",
    });
    expect(db.product.findFirst).toHaveBeenCalledWith({
      where: { id: "other-store", vendorId: "v1" },
      select: { id: true },
    });
    expect(db.stockImportLine.update).not.toHaveBeenCalled();
  });

  it("records a decision with who made it", async () => {
    const db = {
      stockImportLine: {
        findFirst: vi.fn().mockResolvedValue({ status: "OPEN" }),
        update: vi.fn(),
      },
      product: { findFirst: vi.fn() },
    };
    expect(
      await decideImportLine(db as never, "v1", "l1", "u1", {
        decision: "SKIP",
        targetProductId: null,
        note: "not ours",
      }),
    ).toEqual({ ok: true });
    expect(db.stockImportLine.update.mock.calls[0][0].data).toMatchObject({
      decision: "SKIP",
      note: "not ours",
      decidedByUserId: "u1",
      status: "OPEN",
    });
  });
});

describe("apply guards", () => {
  const settingsRow = (updatedAt: Date) => ({
    id: "s1",
    vendorId: "v1",
    headerRow: "NONE",
    nameColumn: "A",
    defaultCategory: { slug: "spices-masalas" },
    presets: [],
    nameTemplate: "{brand} {name} – {size}",
    keepTillWords: true,
    renameMatched: true,
    moveMatchedToCategory: true,
    notes: "",
    updatedAt,
  });
  const fakeDb = (runVersion: Date, settingsVersion: Date, claimCount = 1) => ({
    stockImportRun: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "r1", settingsVersion: runVersion, status: "OPEN" }),
    },
    stockImportSettings: { findUnique: vi.fn().mockResolvedValue(settingsRow(settingsVersion)) },
    stockImportBrandAlias: { findMany: vi.fn().mockResolvedValue([]) },
    stockImportSpelling: { findMany: vi.fn().mockResolvedValue([]) },
    stockImportSynonymGroup: { findMany: vi.fn().mockResolvedValue([]) },
    stockImportWord: { findMany: vi.fn().mockResolvedValue([]) },
    stockImportCategoryText: { findMany: vi.fn().mockResolvedValue([]) },
    stockImportFileRule: { findMany: vi.fn().mockResolvedValue([]) },
    brand: { findMany: vi.fn().mockResolvedValue([]) },
    stockImportLine: {
      findMany: vi.fn().mockResolvedValueOnce([{ id: "l1" }]),
      updateMany: vi.fn().mockResolvedValue({ count: claimCount }),
      count: vi.fn().mockResolvedValue(0),
    },
  });

  it("refuses when the settings changed since the plan (R7)", async () => {
    const db = fakeDb(new Date("2026-11-14T10:00:00Z"), new Date("2026-11-14T11:00:00Z"));
    const result = await applyImportChunk(db as never, "v1", "r1");
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Refresh the plan/) });
    expect(db.stockImportLine.updateMany).not.toHaveBeenCalled();
  });

  it("writes nothing for a line another apply claimed first (R5)", async () => {
    const at = new Date("2026-11-14T10:00:00Z");
    const db = fakeDb(at, at, 0);
    const result = await applyImportChunk(db as never, "v1", "r1");
    expect(result).toEqual({ ok: true, applied: 0, failed: 0, remaining: 0, masterCreated: [] });
    const claim = db.stockImportLine.updateMany.mock.calls[0][0];
    expect(claim.data).toMatchObject({ status: "APPLYING" });
    expect(claim.where).toMatchObject({ id: "l1", runId: "r1" });
    // Only OPEN lines (and stale claims) are taken; a FAILED line is not retried in a loop.
    expect(JSON.stringify(claim.where.OR)).not.toContain("FAILED");
  });

  it("reopens failed lines of an open run only", async () => {
    const db = { stockImportLine: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) } };
    expect(await reopenFailedLines(db as never, "v1", "r1")).toBe(2);
    expect(db.stockImportLine.updateMany.mock.calls[0][0]).toEqual({
      where: { runId: "r1", vendorId: "v1", status: "FAILED", run: { status: "OPEN" } },
      data: { status: "OPEN" },
    });
  });
});
