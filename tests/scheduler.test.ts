import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import scheduler from "../workers/scheduler/src/index";
import {
  ALL_JOB_PATHS,
  CONTACT_OUTBOX_PATH,
  NOTIFICATION_OUTBOX_PATH,
  DAILY_CRON,
  ERROR_RATE_PATH,
  REAPER_PATH,
  REFRESH_WARMUP_PATH,
  SWEEP_PATH,
  WARMUP_CRON,
  WARM_DB_PATH,
  selectJobs,
  selectWarmupJobs,
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
      "/api/jobs/retry-contact-outbox",
      "/api/jobs/retry-notification-outbox",
      // #1491 — the daily run republishes the database warm-up schedule.
      "/api/jobs/refresh-warmup-schedule",
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
  const tick = (
    paymentDueAt: SignalRead,
    errorLastAt: SignalRead,
    contactOutboxPending: SignalRead = NONE,
    notificationOutboxPending: SignalRead = NONE,
  ) =>
    selectJobs({
      cron: "*/15 * * * *",
      now: NOW,
      paymentDueAt,
      errorLastAt,
      contactOutboxPending,
      notificationOutboxPending,
    });

  it("R3: the daily cron calls every job in order, whatever the signals say", () => {
    for (const signal of [NONE, FAILED, at(minutesFromNow(60)), at("garbage")]) {
      expect(
        selectJobs({
          cron: DAILY_CRON,
          now: NOW,
          paymentDueAt: signal,
          errorLastAt: signal,
          contactOutboxPending: signal,
          notificationOutboxPending: signal,
        }),
      ).toEqual([
        SWEEP_PATH,
        REAPER_PATH,
        ERROR_RATE_PATH,
        CONTACT_OUTBOX_PATH,
        NOTIFICATION_OUTBOX_PATH,
        REFRESH_WARMUP_PATH,
      ]);
    }
  });

  describe("#1409 R22: the contact outbox retry on a tick", () => {
    it.each([
      ["a failed read", FAILED, true],
      ["nothing stored", NONE, false],
      ["a stored instant", at(minutesFromNow(-5)), true],
      ["an unparseable value", at("garbage"), true],
    ])("%s → included: %s", (_label, read, included) => {
      expect(tick(NONE, NONE, read as SignalRead).includes(CONTACT_OUTBOX_PATH)).toBe(included);
    });

    it("ALL_JOB_PATHS lists it", () => {
      expect(ALL_JOB_PATHS).toContain(CONTACT_OUTBOX_PATH);
    });
  });

  describe("#1435 R6: the notification outbox retry on a tick", () => {
    it.each([
      ["a failed read", FAILED, true],
      ["nothing stored", NONE, false],
      ["a stored instant", at(minutesFromNow(-5)), true],
      ["an unparseable value", at("garbage"), true],
    ])("%s → included: %s", (_label, read, included) => {
      expect(tick(NONE, NONE, NONE, read as SignalRead).includes(NOTIFICATION_OUTBOX_PATH)).toBe(
        included,
      );
    });

    it("ALL_JOB_PATHS lists it, and the contact marker alone does not call it", () => {
      expect(ALL_JOB_PATHS).toContain(NOTIFICATION_OUTBOX_PATH);
      expect(tick(NONE, NONE, at(minutesFromNow(-5)), NONE)).toEqual([CONTACT_OUTBOX_PATH]);
    });
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
        expect(jobs).not.toContain(CONTACT_OUTBOX_PATH);
        expect(jobs).not.toContain(NOTIFICATION_OUTBOX_PATH);
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

  it("fails open with no JOB_SIGNALS binding: every gated job runs", async () => {
    await scheduler.scheduled(TICK, ENV, CTX);
    expect(fetchedPaths()).toEqual([
      SWEEP_PATH,
      ERROR_RATE_PATH,
      CONTACT_OUTBOX_PATH,
      NOTIFICATION_OUTBOX_PATH,
    ]);
  });

  it("#1435: a stored notification-outbox marker runs only its retry job", async () => {
    await scheduler.scheduled(
      TICK,
      { ...ENV, JOB_SIGNALS: kv({ "notification-outbox:pending": "2026-11-05T10:00:00.000Z" }) },
      CTX,
    );
    expect(fetchedPaths()).toEqual([NOTIFICATION_OUTBOX_PATH]);
  });

  it("#1409: a stored contact-outbox marker runs only the retry job", async () => {
    await scheduler.scheduled(
      TICK,
      { ...ENV, JOB_SIGNALS: kv({ "contact-outbox:pending": "2026-11-03T10:00:00.000Z" }) },
      CTX,
    );
    expect(fetchedPaths()).toEqual([CONTACT_OUTBOX_PATH]);
  });

  it("skips every job on an idle tick, and still logs the tick", async () => {
    await scheduler.scheduled(TICK, { ...ENV, JOB_SIGNALS: kv({}) }, CTX);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tickLines()).toEqual([
      `scheduler tick cron=*/15 * * * * ran=none skipped=${SWEEP_PATH},${REAPER_PATH},${ERROR_RATE_PATH},${CONTACT_OUTBOX_PATH},${NOTIFICATION_OUTBOX_PATH},${REFRESH_WARMUP_PATH}`,
    ]);
  });

  it("a throwing first read still reads the second key, and fails open for the first", async () => {
    const store = kv(
      {
        "error-events:last-at": null,
        "contact-outbox:pending": null,
        "notification-outbox:pending": null,
      },
      { throwOn: "payment-sweep:due-at" },
    );
    await scheduler.scheduled(TICK, { ...ENV, JOB_SIGNALS: store }, CTX);
    expect(store.get).toHaveBeenCalledTimes(4);
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

/**
 * #1491 — the database warm-up tick. Every doubt SKIPS (the opposite of the jobs above).
 * `specs/2026-11-10-db-warmup-ping/` R10–R12.
 */
describe("selectWarmupJobs (#1491 R11, R12)", () => {
  const payload = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      enabled: true,
      activityEnabled: true,
      activityMinutes: 30,
      windows: [[minutesFromNow(-60), minutesFromNow(60)]],
      validUntil: minutesFromNow(60 * 24),
      generatedAt: NOW.toISOString(),
      ...over,
    });
  const decide = (schedule: SignalRead, lastActivity: SignalRead = NONE) =>
    selectWarmupJobs({ now: NOW, schedule, lastActivity });

  it("in a window -> pings (in-window)", () => {
    expect(decide(at(payload()))).toEqual({ jobs: [WARM_DB_PATH], reason: "in-window" });
  });

  it("outside every window with no activity -> skips (outside-window)", () => {
    const s = at(payload({ windows: [[minutesFromNow(60), minutesFromNow(120)]] }));
    expect(decide(s)).toEqual({ jobs: [], reason: "outside-window" });
  });

  it("disabled -> skips (disabled)", () => {
    expect(decide(at(payload({ enabled: false })))).toEqual({ jobs: [], reason: "disabled" });
  });

  it("no schedule published -> skips (no-schedule)", () => {
    expect(decide(NONE)).toEqual({ jobs: [], reason: "no-schedule" });
  });

  it("a failed read, malformed JSON or the wrong version -> skips (unreadable)", () => {
    expect(decide(FAILED).reason).toBe("unreadable");
    expect(decide(at("not json")).reason).toBe("unreadable");
    expect(decide(at(payload({ v: 2 }))).reason).toBe("unreadable");
    expect(decide(at(payload({ windows: [["x", "y"]] }))).reason).toBe("unreadable");
    for (const s of [FAILED, at("not json"), at(payload({ v: 2 }))])
      expect(decide(s).jobs).toEqual([]);
  });

  it("past validUntil -> skips (stale), even inside a window", () => {
    expect(decide(at(payload({ validUntil: minutesFromNow(-1) })))).toEqual({
      jobs: [],
      reason: "stale",
    });
  });

  it("outside a window, activity 10 min ago within 30 -> pings (recent-activity)", () => {
    const s = at(payload({ windows: [] }));
    expect(decide(s, at(minutesFromNow(-10)))).toEqual({
      jobs: [WARM_DB_PATH],
      reason: "recent-activity",
    });
  });

  it("activity 31 min ago -> skips; activityEnabled false -> skips", () => {
    const s = at(payload({ windows: [] }));
    expect(decide(s, at(minutesFromNow(-31))).jobs).toEqual([]);
    expect(
      decide(at(payload({ windows: [], activityEnabled: false })), at(minutesFromNow(-1))).jobs,
    ).toEqual([]);
  });

  it("an unreadable or unparseable activity marker counts as no activity", () => {
    const s = at(payload({ windows: [] }));
    expect(decide(s, FAILED)).toEqual({ jobs: [], reason: "outside-window" });
    expect(decide(s, at("garbage"))).toEqual({ jobs: [], reason: "outside-window" });
  });

  it("ACTIVITY_ONLY (published with no windows) still pings on recent activity", () => {
    expect(decide(at(payload({ windows: [] })), at(minutesFromNow(-2))).jobs).toEqual([
      WARM_DB_PATH,
    ]);
  });

  it("the warm-up cron never selects any other job via selectJobs", () => {
    expect(
      selectJobs({
        cron: WARMUP_CRON,
        now: NOW,
        paymentDueAt: at(minutesFromNow(-60)),
        errorLastAt: at(minutesFromNow(-1)),
        contactOutboxPending: at(NOW.toISOString()),
        notificationOutboxPending: at(NOW.toISOString()),
      }),
    ).toEqual([]);
  });
});

describe("scheduled handler: warm-up tick (#1491 R11, R12)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  const WARM = { cron: WARMUP_CRON } as Parameters<typeof scheduler.scheduled>[0];

  beforeEach(() => {
    fetchSpy = vi.fn(async () => okResponse('{"ok":true,"ms":3}'));
    vi.stubGlobal("fetch", fetchSpy);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
  });

  const warmupLines = () =>
    logSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("warmup tick"));

  it("in a window: POSTs only the ping, with the token, and logs ran=…/reason=in-window", async () => {
    const now = Date.now();
    const schedule = JSON.stringify({
      v: 1,
      enabled: true,
      activityEnabled: false,
      activityMinutes: 30,
      windows: [[new Date(now - 60_000).toISOString(), new Date(now + 3_600_000).toISOString()]],
      validUntil: new Date(now + 86_400_000).toISOString(),
      generatedAt: new Date(now).toISOString(),
    });
    await scheduler.scheduled(
      WARM,
      { ...ENV, JOB_SIGNALS: kv({ "db-warmup:schedule": schedule }) },
      CTX,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${ENV.APP_BASE_URL}${WARM_DB_PATH}`);
    expect(warmupLines()).toEqual([`warmup tick ran=${WARM_DB_PATH} reason=in-window`]);
    // It reads only its own two keys, never the 15-minute markers.
    expect(
      logSpy.mock.calls.some((c: unknown[]) => String(c[0]).startsWith("scheduler tick")),
    ).toBe(false);
  });

  it("no JOB_SIGNALS binding: skips (unreadable), calls nothing", async () => {
    await scheduler.scheduled(WARM, ENV, CTX);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warmupLines()).toEqual(["warmup tick ran=none reason=unreadable"]);
  });

  it("nothing published: skips (no-schedule)", async () => {
    await scheduler.scheduled(WARM, { ...ENV, JOB_SIGNALS: kv({}) }, CTX);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warmupLines()).toEqual(["warmup tick ran=none reason=no-schedule"]);
  });
});

describe("scheduler cron triggers (#1491 R10)", () => {
  it("every environment has exactly the 15-minute, daily and 4-minute crons", () => {
    const toml = readFileSync("workers/scheduler/wrangler.toml", "utf8");
    const crons = [...toml.matchAll(/^crons = (\[.*\])$/gm)].map(
      (m) => JSON.parse(m[1]) as string[],
    );
    expect(crons).toHaveLength(5); // top level + staging, production, afc-staging, afc-production
    for (const c of crons) expect(c).toEqual(["*/15 * * * *", "0 3 * * *", "*/4 * * * *"]);
  });
});
