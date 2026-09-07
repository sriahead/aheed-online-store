import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import scheduler from "../workers/scheduler/src/index";

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

/** The handler ignores both, but the signature requires them. */
const CONTROLLER = {} as Parameters<typeof scheduler.scheduled>[0];
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
