import { describe, expect, it, vi } from "vitest";
import {
  countOtherVendorData,
  eraseVendorData,
  exportPersonalData,
} from "@/lib/repositories/data-rights";
import type { getPrisma } from "@/lib/db";

/**
 * #1134 — the marketing-consent log in the three data-rights paths: export, the other-vendor
 * count, and erasure. Same Proxy stub as `data-rights-saved-lists.test.ts`: only the model under
 * test answers with data, every other model with the empty shape.
 *
 * The erasure test passes the same stub as the transaction client, so it proves which rows are
 * targeted (this vendor's, this user's) — not atomicity, which the existing transaction carries.
 */

const VENDOR = "vendor-a";
const USER = "user-1";

const EVENTS = [
  {
    granted: false,
    statement: "S",
    source: "ACCOUNT",
    createdAt: new Date("2026-10-18T12:00:00Z"),
  },
  {
    granted: true,
    statement: "S",
    source: "REGISTRATION",
    createdAt: new Date("2026-10-18T10:00:00Z"),
  },
];

function makeClient(counts: Record<string, number> = {}) {
  const calls: { model: string; method: string; args: unknown }[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) =>
          vi.fn(async (args: unknown) => {
            calls.push({ model: name, method, args });
            switch (method) {
              case "count":
                return counts[name] ?? 0;
              case "findUnique":
                return null;
              case "findUniqueOrThrow":
                return name === "vendor"
                  ? { id: VENDOR, name: "Store" }
                  : {
                      id: USER,
                      name: "A Shopper",
                      email: "shopper@example.com",
                      emailVerified: true,
                      role: "CUSTOMER",
                      createdAt: new Date("2026-01-01T00:00:00Z"),
                    };
              case "findMany":
                return name === "marketingConsentEvent" ? EVENTS : [];
              default:
                return { count: name === "marketingConsentEvent" ? 2 : 0 };
            }
          }),
      },
    );
  const client: object = new Proxy(
    {},
    {
      get: (_t, name: string) =>
        name === "$transaction" ? async (fn: (tx: unknown) => unknown) => fn(client) : model(name),
    },
  );
  return { calls, client: client as unknown as ReturnType<typeof getPrisma> };
}

describe("marketing consent in a data export", () => {
  it("includes every event for this vendor and user, newest first, with all four fields", async () => {
    const { client, calls } = makeClient();
    const exported = await exportPersonalData(client, VENDOR, USER);
    expect(exported.marketingConsent).toEqual(EVENTS);

    const query = calls.find((c) => c.model === "marketingConsentEvent" && c.method === "findMany");
    expect(query?.args).toMatchObject({
      where: { vendorId: VENDOR, userId: USER },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("marketing consent counts as data held elsewhere", () => {
  it("counts consent events at OTHER vendors, excluding the one being erased", async () => {
    const { client, calls } = makeClient({ marketingConsentEvent: 1 });
    expect(await countOtherVendorData(client, USER, VENDOR)).toBe(1);
    const query = calls.find((c) => c.model === "marketingConsentEvent" && c.method === "count");
    expect(query?.args).toEqual({ where: { vendorId: { not: VENDOR }, userId: USER } });
  });
});

describe("marketing consent in an erasure", () => {
  it("deletes this vendor's events and keeps the identity when consent exists elsewhere", async () => {
    const { client, calls } = makeClient({ marketingConsentEvent: 1 });
    const result = await eraseVendorData(client, VENDOR, USER);

    const deletion = calls.find(
      (c) => c.model === "marketingConsentEvent" && c.method === "deleteMany",
    );
    expect(deletion?.args).toEqual({ where: { vendorId: VENDOR, userId: USER } });
    expect(result.marketingConsentEventsDeleted).toBe(2);
    expect(result.identityDeleted).toBe(false);
    expect(calls.some((c) => c.model === "user" && c.method === "delete")).toBe(false);
  });
});
