import { describe, expect, it } from "vitest";
import {
  getMarketingConsentState,
  hasEffectiveMarketingConsent,
  recordMarketingConsent,
} from "@/lib/repositories/marketing-consent";
import type { getPrisma } from "@/lib/db";

/**
 * #1134 — the marketing-consent log. An in-memory double that honours exactly the queries the
 * repository makes (scoped findFirst ordered newest-first, singular create, user lookup), so the
 * five R13 cases are checked against the rules rather than against hand-picked return values.
 */

type Row = {
  vendorId: string;
  userId: string;
  granted: boolean;
  statement: string;
  source: "REGISTRATION" | "ACCOUNT";
  createdAt: Date;
};

function makeDb(verified: Record<string, boolean>) {
  const rows: Row[] = [];
  let tick = 0;
  const db = {
    marketingConsentEvent: {
      create: async ({ data }: { data: Omit<Row, "createdAt"> }) => {
        rows.push({ ...data, createdAt: new Date(Date.UTC(2026, 9, 18, 0, 0, tick++)) });
      },
      findFirst: async ({ where }: { where: { vendorId: string; userId: string } }) => {
        const mine = rows
          .filter((r) => r.vendorId === where.vendorId && r.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const newest = mine[0];
        return newest
          ? {
              granted: newest.granted,
              statement: newest.statement,
              source: newest.source,
              createdAt: newest.createdAt,
            }
          : null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id in verified ? { emailVerified: verified[where.id] } : null,
    },
  };
  return { rows, db: db as unknown as ReturnType<typeof getPrisma> };
}

const grant = { granted: true, statement: "S", source: "ACCOUNT" as const };
const withdraw = { granted: false, statement: "S", source: "ACCOUNT" as const };

describe("marketing consent repository", () => {
  it("no events: state is null and consent is not effective", async () => {
    const { db } = makeDb({ u1: true });
    expect(await getMarketingConsentState(db, "v1", "u1")).toBeNull();
    expect(await hasEffectiveMarketingConsent(db, "v1", "u1")).toBe(false);
  });

  it("granted then withdrawn: not effective", async () => {
    const { db } = makeDb({ u1: true });
    await recordMarketingConsent(db, "v1", "u1", grant);
    await recordMarketingConsent(db, "v1", "u1", withdraw);
    expect((await getMarketingConsentState(db, "v1", "u1"))?.granted).toBe(false);
    expect(await hasEffectiveMarketingConsent(db, "v1", "u1")).toBe(false);
  });

  it("withdrawn then granted: effective when the email is verified", async () => {
    const { db } = makeDb({ u1: true });
    await recordMarketingConsent(db, "v1", "u1", withdraw);
    await recordMarketingConsent(db, "v1", "u1", grant);
    expect(await hasEffectiveMarketingConsent(db, "v1", "u1")).toBe(true);
  });

  it("granted but the email is unverified: not effective", async () => {
    const { db } = makeDb({ u1: false });
    await recordMarketingConsent(db, "v1", "u1", { ...grant, source: "REGISTRATION" });
    expect((await getMarketingConsentState(db, "v1", "u1"))?.granted).toBe(true);
    expect(await hasEffectiveMarketingConsent(db, "v1", "u1")).toBe(false);
  });

  it("ignores events for another vendor or another user", async () => {
    const { db } = makeDb({ u1: true, u2: true });
    await recordMarketingConsent(db, "v2", "u1", grant);
    await recordMarketingConsent(db, "v1", "u2", grant);
    expect(await getMarketingConsentState(db, "v1", "u1")).toBeNull();
    expect(await hasEffectiveMarketingConsent(db, "v1", "u1")).toBe(false);
  });
});
