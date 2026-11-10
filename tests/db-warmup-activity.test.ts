import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { markWarmupActivity, type SignalStore } from "@/lib/job-signals";
import { withWarmupActivity } from "@/lib/auth";

/**
 * #1491 R6a — signed-in activity is recorded in KV only, throttled, never failing the request.
 */

function store(initial: Record<string, string> = {}, opts: { throwOn?: "get" | "put" } = {}) {
  const data = new Map(Object.entries(initial));
  const s = {
    get: vi.fn(async (k: string) => {
      if (opts.throwOn === "get") throw new Error("kv down");
      return data.get(k) ?? null;
    }),
    put: vi.fn(async (k: string, v: string) => {
      if (opts.throwOn === "put") throw new Error("kv down");
      data.set(k, v);
    }),
    delete: vi.fn(async (k: string) => void data.delete(k)),
  };
  return s as SignalStore & typeof s;
}

const NOW = new Date("2026-11-10T15:00:00Z");
const KEY = "db-warmup:last-activity";

describe("markWarmupActivity throttle (#1491 R6a)", () => {
  it("nothing stored -> one write of now", async () => {
    const s = store();
    await markWarmupActivity(NOW, s);
    expect(s.put).toHaveBeenCalledWith(KEY, NOW.toISOString());
  });

  it("stored 30 s ago -> no write (within the throttle)", async () => {
    const s = store({ [KEY]: new Date(NOW.getTime() - 30_000).toISOString() });
    await markWarmupActivity(NOW, s);
    expect(s.put).not.toHaveBeenCalled();
  });

  it("stored 4 minutes ago -> rewritten", async () => {
    const s = store({ [KEY]: new Date(NOW.getTime() - 4 * 60_000).toISOString() });
    await markWarmupActivity(NOW, s);
    expect(s.put).toHaveBeenCalledWith(KEY, NOW.toISOString());
  });

  it("an unparseable stored value is replaced", async () => {
    const s = store({ [KEY]: "garbage" });
    await markWarmupActivity(NOW, s);
    expect(s.put).toHaveBeenCalledTimes(1);
  });

  it("a throwing get or put is logged and never rejects", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(markWarmupActivity(NOW, store({}, { throwOn: "get" }))).resolves.toBeUndefined();
    await expect(markWarmupActivity(NOW, store({}, { throwOn: "put" }))).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });

  it("no binding -> nothing happens", async () => {
    await expect(markWarmupActivity(NOW, null)).resolves.toBeUndefined();
  });

  it("lib/db-warmup/activity.ts never touches the database", () => {
    expect(readFileSync("lib/db-warmup/activity.ts", "utf8")).not.toMatch(
      /prisma|getPrisma|@\/lib\/db"/,
    );
  });
});

describe("withWarmupActivity wraps every session read (#1491 R6a)", () => {
  const fakeAuth = (session: unknown) => ({ api: { getSession: vi.fn(async () => session) } });

  it("a signed-in session records activity and is returned unchanged", async () => {
    const record = vi.fn();
    const session = { user: { id: "u1" }, session: { id: "s1" } };
    const auth = withWarmupActivity(fakeAuth(session), record);
    await expect(auth.api.getSession()).resolves.toBe(session);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("a signed-out (null) session records nothing", async () => {
    const record = vi.fn();
    const auth = withWarmupActivity(fakeAuth(null), record);
    await expect(auth.api.getSession()).resolves.toBeNull();
    expect(record).not.toHaveBeenCalled();
  });

  it("a session object without a user records nothing", async () => {
    const record = vi.fn();
    const auth = withWarmupActivity(fakeAuth({ user: null }), record);
    await auth.api.getSession();
    expect(record).not.toHaveBeenCalled();
  });

  it("getAuth returns its instance through withWarmupActivity", () => {
    expect(readFileSync("lib/auth.ts", "utf8")).toMatch(/return withWarmupActivity\(auth\);/);
  });
});
