import { afterEach, describe, expect, it, vi } from "vitest";
import { readDestinationAddresses } from "@/lib/email/destinations";

/**
 * #1392 R1–R2 — the Cloudflare Email Routing destination-address reader, with a stubbed fetch.
 */

const TOKEN = "cf-token-SECRET-value";
const CREDS = { accountId: "acct123", token: TOKEN };

function page(result: unknown[], init: { status?: number; success?: boolean } = {}): Response {
  return new Response(JSON.stringify({ success: init.success ?? true, result }), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function addresses(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    email: `${prefix}${i}@inbox.test`,
    verified: "2026-11-01T00:00:00Z",
  }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("readDestinationAddresses", () => {
  it("is not-configured without an account id or token, and makes no request", async () => {
    const fetchImpl = vi.fn();
    for (const creds of [
      {},
      { accountId: "acct123" },
      { token: TOKEN },
      { accountId: " ", token: TOKEN },
    ]) {
      expect(await readDestinationAddresses(creds, fetchImpl)).toEqual({
        status: "unavailable",
        reason: "not-configured",
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads a single page with the bearer token, lower-casing emails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      page([
        { email: "Hub@Inbox.test", verified: "2026-11-01T00:00:00Z" },
        { email: "pending@inbox.test", verified: null },
      ]),
    );
    const result = await readDestinationAddresses(CREDS, fetchImpl);
    expect(result).toEqual({
      status: "ok",
      addresses: [
        { email: "hub@inbox.test", verified: true },
        { email: "pending@inbox.test", verified: false },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct123/email/routing/addresses?page=1&per_page=50",
    );
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats verified null, empty and a timestamp correctly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      page([
        { email: "a@inbox.test", verified: null },
        { email: "b@inbox.test", verified: "" },
        { email: "c@inbox.test", verified: "2026-11-01T00:00:00Z" },
      ]),
    );
    const result = await readDestinationAddresses(CREDS, fetchImpl);
    expect(result.status === "ok" && result.addresses.map((a) => a.verified)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("pages until a short page (50 + 3)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(addresses(50, "p1-")))
      .mockResolvedValueOnce(page(addresses(3, "p2-")));
    const result = await readDestinationAddresses(CREDS, fetchImpl);
    expect(result.status === "ok" && result.addresses.length).toBe(53);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain("page=2&per_page=50");
  });

  it("stops after 4 pages", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => page(addresses(50, "x-")));
    const result = await readDestinationAddresses(CREDS, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.status === "ok" && result.addresses.length).toBe(200);
  });

  it.each([401, 403])("maps HTTP %i to forbidden", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(page([], { status, success: false }));
    expect(await readDestinationAddresses(CREDS, fetchImpl)).toEqual({
      status: "unavailable",
      reason: "forbidden",
    });
  });

  it("maps a 500 to error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([], { status: 500, success: false }));
    expect(await readDestinationAddresses(CREDS, fetchImpl)).toEqual({
      status: "unavailable",
      reason: "error",
    });
  });

  it("maps success:false on a 200 to error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([], { success: false }));
    expect(await readDestinationAddresses(CREDS, fetchImpl)).toEqual({
      status: "unavailable",
      reason: "error",
    });
  });

  it("maps a thrown fetch and unparsable JSON to error", async () => {
    const thrown = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await readDestinationAddresses(CREDS, thrown)).toEqual({
      status: "unavailable",
      reason: "error",
    });
    const garbage = vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));
    expect(await readDestinationAddresses(CREDS, garbage)).toEqual({
      status: "unavailable",
      reason: "error",
    });
  });

  it("gives error when a request only settles on abort, after 5 seconds", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    let settled = false;
    const pending = readDestinationAddresses(CREDS, fetchImpl as unknown as typeof fetch).then(
      (r) => {
        settled = true;
        return r;
      },
    );
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ status: "unavailable", reason: "error" });
  });

  it("never puts the token in the result", async () => {
    const cases = [
      vi.fn().mockResolvedValue(page(addresses(2, "ok-"))),
      vi.fn().mockResolvedValue(page([], { status: 403 })),
      vi.fn().mockRejectedValue(new Error(`boom ${TOKEN}`)),
    ];
    for (const fetchImpl of cases) {
      const result = await readDestinationAddresses(CREDS, fetchImpl);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
  });
});
