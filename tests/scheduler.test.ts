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

  it("R6: POSTs each job path to the app base URL with the shared secret", async () => {
    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://staging.example.test/api/jobs/reconcile-payments");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-job-token"]).toBe("tok_secret");
  });

  it("R7: reports a non-2xx job and still invokes the rest of the list", async () => {
    // Two responses against a one-entry list proves the loop consumes results in
    // order without depending on how many jobs happen to be registered today.
    fetchSpy
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(okResponse());

    await scheduler.scheduled(CONTROLLER, ENV, CTX);
    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("/api/jobs/reconcile-payments");
    expect(String(errorSpy.mock.calls[0][0])).toContain("500");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("R7: an unreachable job is logged rather than thrown, so a tick completes", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("connection refused"));

    await expect(scheduler.scheduled(CONTROLLER, ENV, CTX)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("could not be reached");
  });

  it("R5: every registered job path is under /api/jobs/", async () => {
    await scheduler.scheduled(CONTROLLER, ENV, CTX);

    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).toContain("/api/jobs/");
    }
  });
});
