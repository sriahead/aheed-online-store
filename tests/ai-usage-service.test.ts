import { beforeEach, describe, expect, it, vi } from "vitest";

/** #1295 R9: the platform-wide Workers AI read behind the running-costs page. */

const getPrisma = vi.fn(() => ({ marker: "client" }));
const sumPlatformMilliNeuronsSince = vi.fn();
const getAiEnv = vi.fn();

vi.mock("@/lib/db", () => ({ getPrisma }));
vi.mock("@/lib/config", () => ({ getAiEnv }));
vi.mock("@/lib/repositories/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/ai-usage")>()),
  sumPlatformMilliNeuronsSince,
}));

const { getPlatformAiNeuronsToday } = await import("@/lib/ai-usage-service");

beforeEach(() => {
  getPrisma.mockClear();
  sumPlatformMilliNeuronsSince.mockReset();
  getAiEnv.mockReset();
});

describe("getPlatformAiNeuronsToday (#1295 R9)", () => {
  it("returns the configured plan and the platform's milli-neurons as neurons", async () => {
    sumPlatformMilliNeuronsSince.mockResolvedValue(12500);
    getAiEnv.mockReturnValue({ WORKERS_AI_PLAN: "paid" });

    await expect(getPlatformAiNeuronsToday()).resolves.toEqual({ plan: "paid", neurons: 12.5 });
  });

  it("reads from 00:00 UTC today", async () => {
    sumPlatformMilliNeuronsSince.mockResolvedValue(0);
    getAiEnv.mockReturnValue({ WORKERS_AI_PLAN: "free" });

    await getPlatformAiNeuronsToday();

    const since = sumPlatformMilliNeuronsSince.mock.calls[0][1] as Date;
    const now = new Date();
    expect(since.getTime()).toBe(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  });

  it("builds a fresh client on every call and never caches one", async () => {
    sumPlatformMilliNeuronsSince.mockResolvedValue(0);
    getAiEnv.mockReturnValue({ WORKERS_AI_PLAN: "free" });

    await getPlatformAiNeuronsToday();
    await getPlatformAiNeuronsToday();

    expect(getPrisma).toHaveBeenCalledTimes(2);
  });
});
