import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import scheduler from "../workers/scheduler/src/index";
import {
  DAILY_CRON,
  ERROR_RATE_PATH,
  REAPER_PATH,
  SWEEP_PATH,
  selectJobs,
  type SignalRead,
} from "../workers/scheduler/src/select-jobs";

/**
 * The job scheduler (P9.2, #618).
 *
 * Imported by relative path rather than the `@/` alias because this Worker is
 * not part of the Next application's module graph — it is a second, separately
 * deployed Worker that happens to live in the same repository.
 *
 * Like `tests/payment-sweep.test.ts`, this file needs no `vi.mock`: the
 * scheduler holds no database access and no domain logic, so there is nothing to
 * stand in for beyond `fetch` itself.
 */

const ENV = {
  APP_BASE_URL: "https://staging.example.test",
  JOB_INVOCATION_TOKEN: "tok_secret",
};

/**
 * The daily ungated run calls every job, so the original #618 assertions below
 * drive it with the daily cron: they are about how a job is invoked, not about
 * which jobs a gated tick selects (that is the #1324 block further down).
 */
const CONTROLLER = { cron: DAILY_CRON } as Parameters<typeof scheduler.scheduled>[0];
const TICK = { cron: "*/15 * * * *" } as Parameters<typeof scheduler.scheduled>[0];
const CTX = {} as Parameters<typeof scheduler.scheduled>[2];

function okResponse(body = '{"scanned":0}') {
  return new Response(body, { status: 200 });
}

describe("job scheduler", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("R6: POSTs every job path to the app base URL with the shared secret", async () => {
    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    // Asserted over EVERY call rather than a fixed count. An earlier version
    // pinned `toHaveBeenCalledTimes(1)` while its own comment claimed to be
    // independent of how many jobs were registered; it was not, and adding the
    // #94 and #437 jobs broke it. Registering a job should not require editing
    // an arithmetic constant in a test that is not about arithmetic.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);

    for (const call of fetchSpy.mock.calls) {
      const [url, init] = call as [string, RequestInit];
      expect(url.startsWith("https://staging.example.test/api/jobs/")).toBe(true);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["x-job-token"]).toBe("tok_secret");
    }
  });

  it("registers the reconcile, reap and error-rate jobs (R11, R18)", async () => {
    // Pins the actual list, which the per-call assertions above deliberately do
    // not. The array in the scheduler is a literal precisely so that adding or
    // renaming a job is a reviewable diff — this is the other half of that.
    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    const paths = fetchSpy.mock.calls.map((call) =>
      String(call[0]).replace("https://staging.example.test", ""),
    );
    expect(paths).toEqual([
      "/api/jobs/reconcile-payments",
      "/api/jobs/reap-guest-carts",
      "/api/jobs/check-error-rate",
    ]);
  });

  it("R7: reports a non-2xx job and still invokes the rest of the list", async () => {
    // The FIRST job fails; every later one uses the default ok response. With a
    // multi-entry list this now genuinely exercises "the tick continues", which
    // a one-entry list could only simulate across two separate ticks.
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("/api/jobs/reconcile-payments");
    expect(String(errorSpy.mock.calls[0][0])).toContain("500");
    // Every remaining job still ran: the failure did not abandon the tick.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it("R7: an unreachable job is logged rather than thrown, so a tick completes", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("connection refused"));

    await expect(scheduler.scheduled(CONTROLLER, ENV, CTX)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("could not be reached");
    // And the jobs after it were still attempted.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it("R5: every registered job path is under /api/jobs/", async () => {
    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).toContain("/api/jobs/");
    }
  });
});

/** An in-memory stand-in for the JOB_SIGNALS KV namespace's `get`. */
function kv(values: Record<string, string | null>, opts: { throwOn?: string } = {}) {
  const get = vi.fn(async (key: string) => {
    if (key === opts.throwOn) throw new Error("kv unavailable");
    return values[key] ?? null;
  });
  return { get } as unknown as KVNamespace & { get: typeof get };
}

const NOW = new Date("2026-10-28T12:00:00.000Z");
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60 * 1000).toISOString();
const NONE: SignalRead = { ok: true, value: null };
const FAILED: SignalRead = { ok: false };
const at = (value: string): SignalRead => ({ ok: true, value });

describe("selectJobs (#1324)", () => {
  const tick = (paymentDueAt: SignalRead, errorLastAt: SignalRead) =>
    selectJobs({ cron: "*/15 * * * *", now: NOW, paymentDueAt, errorLastAt });

  it("R3: the daily cron calls all three jobs in order, whatever the signals say", () => {
    for (const signal of [NONE, FAILED, at(minutesFromNow(60)), at("garbage")]) {
      expect(
        selectJobs({ cron: DAILY_CRON, now: NOW, paymentDueAt: signal, errorLastAt: signal }),
      ).toEqual([SWEEP_PATH, REAPER_PATH, ERROR_RATE_PATH]);
    }
  });

  describe("R4: the sweep on a tick", () => {
    it.each([
      ["a failed read", FAILED, true],
      ["nothing stored", NONE, false],
      ["an unparseable value", at("not-a-date"), true],
      ["a past instant", at(minutesFromNow(-5)), true],
      ["exactly now", at(NOW.toISOString()), true],
      ["a future instant", at(minutesFromNow(5)), false],
    ])("%s → included: %s", (_label, read, included) => {
      expect(tick(read as SignalRead, NONE).includes(SWEEP_PATH)).toBe(included);
    });
  });

  describe("R5: the error-rate check on a tick", () => {
    it.each([
      ["a failed read", FAILED, true],
      ["nothing stored", NONE, false],
      ["an unparseable value", at("not-a-date"), true],
      ["19 minutes ago", at(minutesFromNow(-19)), true],
      ["exactly 20 minutes ago", at(minutesFromNow(-20)), true],
      ["21 minutes ago", at(minutesFromNow(-21)), false],
    ])("%s → included: %s", (_label, read, included) => {
      expect(tick(NONE, read as SignalRead).includes(ERROR_RATE_PATH)).toBe(included);
    });
  });

  it("R6: a tick never calls the reaper, and the sweep precedes the error check", () => {
    const signals = [NONE, FAILED, at("garbage"), at(minutesFromNow(-1)), at(minutesFromNow(30))];
    for (const payment of signals) {
      for (const errors of signals) {
        const jobs = tick(payment, errors);
        expect(jobs).not.toContain(REAPER_PATH);
        if (jobs.length === 2) expect(jobs).toEqual([SWEEP_PATH, ERROR_RATE_PATH]);
      }
    }
  });
});

describe("scheduled handler gating (#1324 R7)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const fetchedPaths = () =>
    fetchSpy.mock.calls.map((call) => String(call[0]).replace(ENV.APP_BASE_URL, ""));
  const tickLines = () =>
    logSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((l: string) => l.startsWith("scheduler tick"));

  it("fails open with no JOB_SIGNALS binding: the sweep and the error check both run", async () => {
    await scheduler.scheduled(TICK, ENV, CTX);
    expect(fetchedPaths()).toEqual([SWEEP_PATH, ERROR_RATE_PATH]);
  });

  it("skips every job on an idle tick, and still logs the tick", async () => {
    await scheduler.scheduled(TICK, { ...ENV, JOB_SIGNALS: kv({}) }, CTX);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tickLines()).toEqual([
      `scheduler tick cron=*/15 * * * * ran=none skipped=${SWEEP_PATH},${REAPER_PATH},${ERROR_RATE_PATH}`,
    ]);
  });

  it("a throwing first read still reads the second key, and fails open for the first", async () => {
    const store = kv({ "error-events:last-at": null }, { throwOn: "payment-sweep:due-at" });
    await scheduler.scheduled(TICK, { ...ENV, JOB_SIGNALS: store }, CTX);
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(fetchedPaths()).toEqual([SWEEP_PATH]);
  });

  it("logs exactly one tick line in the required shape", async () => {
    await scheduler.scheduled(TICK, { ...ENV, JOB_SIGNALS: kv({}) }, CTX);
    await scheduler.scheduled(CONTROLLER, { ...ENV, JOB_SIGNALS: kv({}) }, CTX);
    const lines = tickLines();
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/^scheduler tick cron=.+ ran=\S+ skipped=\S+$/);
    }
    expect(lines[1]).toContain("skipped=none");
  });
});
