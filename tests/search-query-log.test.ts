import { afterEach, describe, expect, it, vi } from "vitest";
import { recordSearchQuery } from "@/lib/repositories/search-query-log";

const VENDOR = "vendor-1";

function makeStub() {
  const create = vi.fn(async (_args: unknown) => undefined);
  const deleteMany = vi.fn(async (_args: unknown) => ({ count: 0 }));
  const client = { searchQueryLog: { create, deleteMany } };
  return { client: client as never, spies: { create, deleteMany } };
}

describe("recordSearchQuery (R18)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates exactly one row per call", async () => {
    const { client, spies } = makeStub();
    await recordSearchQuery(client, VENDOR, "203.0.113.5", "basmati rice", 4, null);
    expect(spies.create).toHaveBeenCalledTimes(1);
  });

  it("trims, lowercases and truncates the query to 200 characters", async () => {
    const { client, spies } = makeStub();
    const long = "  RICE ".repeat(50); // well over 200 chars once trimmed/repeated

    await recordSearchQuery(client, VENDOR, "203.0.113.5", long, 0, "none");

    const data = spies.create.mock.calls[0][0] as { data: { query: string } };
    expect(data.data.query.length).toBeLessThanOrEqual(200);
    expect(data.data.query).toBe(data.data.query.toLowerCase());
    expect(data.data.query.startsWith(" ")).toBe(false);
  });

  it("stores a hashed IP, never the raw address", async () => {
    const { client, spies } = makeStub();
    await recordSearchQuery(client, VENDOR, "203.0.113.5", "rice", 3, null);

    const data = spies.create.mock.calls[0][0] as { data: { ipHash: string } };
    expect(data.data.ipHash).not.toBe("203.0.113.5");
    expect(data.data.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passes directResultCount and recoveryRung straight through", async () => {
    const { client, spies } = makeStub();
    await recordSearchQuery(client, VENDOR, "203.0.113.5", "rice", 0, "broad");

    const data = spies.create.mock.calls[0][0] as {
      data: { directResultCount: number; recoveryRung: string | null; vendorId: string };
    };
    expect(data.data.directResultCount).toBe(0);
    expect(data.data.recoveryRung).toBe("broad");
    expect(data.data.vendorId).toBe(VENDOR);
  });
});

describe("retention sweep (R19)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sweeps rows older than 90 days when the low-probability roll succeeds", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, spies } = makeStub();

    await recordSearchQuery(client, VENDOR, "203.0.113.5", "rice", 3, null);

    expect(spies.deleteMany).toHaveBeenCalledTimes(1);
    const arg = spies.deleteMany.mock.calls[0][0] as { where: { createdAt: { lt: Date } } };
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const expected = Date.now() - ninetyDaysMs;
    expect(Math.abs(arg.where.createdAt.lt.getTime() - expected)).toBeLessThan(5000);
  });

  it("does not sweep when the roll fails", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { client, spies } = makeStub();

    await recordSearchQuery(client, VENDOR, "203.0.113.5", "rice", 3, null);

    expect(spies.deleteMany).not.toHaveBeenCalled();
  });
});
