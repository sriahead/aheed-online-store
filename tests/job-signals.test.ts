import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The application's half of the job activity markers (#1324, R10–R13).
 *
 * `getCloudflareContext` is the one seam: each test decides what the request
 * context holds — a KV double, no binding, or no context at all.
 */

const ctx = vi.hoisted(() => ({ env: {} as Record<string, unknown>, throws: false }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (ctx.throws) throw new Error("no request context");
    return { env: ctx.env };
  },
}));

const { markPaymentSweepDue, setPaymentSweepDue, markErrorEvent } =
  await import("@/lib/job-signals");

const DUE = "payment-sweep:due-at";
const ERR = "error-events:last-at";
const NOW = new Date("2026-10-28T12:00:00.000Z");
const minutes = (m: number) => new Date(NOW.getTime() + m * 60 * 1000);

function memoryKv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => void data.set(key, value)),
    delete: vi.fn(async (key: string) => void data.delete(key)),
  };
}

function throwingKv() {
  const fail = vi.fn(async () => {
    throw new Error("kv down");
  });
  return { get: fail, put: fail, delete: fail };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ctx.env = {};
  ctx.throws = false;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("R10 — never fails its caller", () => {
  const calls = [
    () => markPaymentSweepDue(NOW),
    () => setPaymentSweepDue(NOW),
    () => setPaymentSweepDue(null),
    () => markErrorEvent(NOW),
  ];

  it("resolves silently when the binding is absent", async () => {
    for (const call of calls) await expect(call()).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("resolves silently outside a Worker request context", async () => {
    ctx.throws = true;
    for (const call of calls) await expect(call()).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("resolves and logs a job-signal line when every KV call throws", async () => {
    ctx.env.JOB_SIGNALS = throwingKv();
    for (const call of calls) await expect(call()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(calls.length);
    for (const [line] of errorSpy.mock.calls) expect(String(line)).toContain("job-signal");
  });
});

describe("R11 — markPaymentSweepDue only brings the due time forward", () => {
  it.each([
    ["nothing is stored", {}, true],
    ["the stored value is unparseable", { [DUE]: "garbage" }, true],
    ["the stored instant is later", { [DUE]: minutes(30).toISOString() }, true],
    ["the stored instant is earlier", { [DUE]: minutes(-30).toISOString() }, false],
    ["the stored instant is the same", { [DUE]: minutes(10).toISOString() }, false],
  ])("%s → writes: %s", async (_label, initial, writes) => {
    const store = memoryKv(initial as Record<string, string>);
    ctx.env.JOB_SIGNALS = store;
    await markPaymentSweepDue(minutes(10));
    expect(store.put).toHaveBeenCalledTimes(writes ? 1 : 0);
    if (writes) expect(store.data.get(DUE)).toBe(minutes(10).toISOString());
  });
});

describe("R12 — setPaymentSweepDue is unconditional", () => {
  it("overwrites an earlier stored value", async () => {
    const store = memoryKv({ [DUE]: minutes(-30).toISOString() });
    ctx.env.JOB_SIGNALS = store;
    await setPaymentSweepDue(minutes(45));
    expect(store.data.get(DUE)).toBe(minutes(45).toISOString());
  });

  it("deletes the key when nothing is pending", async () => {
    const store = memoryKv({ [DUE]: minutes(-30).toISOString() });
    ctx.env.JOB_SIGNALS = store;
    await setPaymentSweepDue(null);
    expect(store.delete).toHaveBeenCalledWith(DUE);
    expect(store.data.has(DUE)).toBe(false);
  });
});

describe("R13 — markErrorEvent is throttled to one write per 5 minutes", () => {
  it.each([
    ["nothing is stored", {}, true],
    ["the stored value is unparseable", { [ERR]: "garbage" }, true],
    ["the last write was 6 minutes ago", { [ERR]: minutes(-6).toISOString() }, true],
    ["the last write was 4 minutes ago", { [ERR]: minutes(-4).toISOString() }, false],
  ])("%s → writes: %s", async (_label, initial, writes) => {
    const store = memoryKv(initial as Record<string, string>);
    ctx.env.JOB_SIGNALS = store;
    await markErrorEvent(NOW);
    expect(store.put).toHaveBeenCalledTimes(writes ? 1 : 0);
    if (writes) expect(store.data.get(ERR)).toBe(NOW.toISOString());
  });
});
