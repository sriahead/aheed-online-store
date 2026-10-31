import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DEMO_EMAILS, LEGACY_DEMO_EMAILS, legacyDemoEmail } from "@/scripts/lib/demo-roster";
import {
  DEMO_ACCOUNTS,
  addDemoAccounts,
  removeDemoAccounts,
  demoAuthOptions,
  type DemoAccount,
  type DemoPrisma,
  type SignUp,
} from "@/scripts/demo-accounts";

type FakeUser = {
  id: string;
  email: string;
  role?: string;
  emailVerified?: boolean;
  name?: string;
};
type FakeMembership = { userId: string; vendorId: string; role: string };

/** In-memory stand-in for the Prisma surface the tool uses. */
function makeFakePrisma(seedEmails: string[] = []) {
  const users = new Map<string, FakeUser>();
  const memberships: FakeMembership[] = [];
  let idSeq = 0;
  for (const email of seedEmails) users.set(email, { id: `u${++idSeq}`, email });

  const prisma: DemoPrisma & { users: Map<string, FakeUser>; memberships: FakeMembership[] } = {
    users,
    memberships,
    user: {
      async findUnique({ where }) {
        const u = users.get(where.email);
        return u ? { id: u.id } : null;
      },
      async update({ where, data }) {
        const u = users.get(where.email) ?? { id: `u${++idSeq}`, email: where.email };
        Object.assign(u, data);
        // A rename moves the row to its new key, as the real email-unique column would (#1356).
        if ("email" in data) users.delete(where.email);
        users.set(u.email, u);
        return { id: u.id };
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const email of where.email.in) if (users.delete(email)) count++;
        return { count };
      },
    },
    vendor: {
      async findFirstOrThrow() {
        return { id: "vendor-aheed" };
      },
      async findUniqueOrThrow({ where }) {
        return { id: `vendor-${where.slug}` };
      },
    },
    vendorMembership: {
      async upsert({ where, create, update }) {
        const { userId, vendorId } = where.userId_vendorId;
        const existing = memberships.find((m) => m.userId === userId && m.vendorId === vendorId);
        if (existing) {
          existing.role = update.role;
          return existing;
        }
        const row = { userId: create.userId, vendorId: create.vendorId, role: create.role };
        memberships.push(row);
        return row;
      },
    },
  };
  return prisma;
}

describe("DEMO_ACCOUNTS roster", () => {
  it("splits platform role from vendor membership", () => {
    expect(DEMO_ACCOUNTS).toEqual([
      {
        email: "demo-admin@merqify.com",
        name: "Demo Admin",
        platformRole: "CUSTOMER",
        vendorRole: "ADMIN",
      },
      {
        email: "demo-platform-admin@merqify.com",
        name: "Demo Platform Admin",
        platformRole: "ADMIN",
      },
      {
        email: "demo-staff@merqify.com",
        name: "Demo Staff",
        platformRole: "CUSTOMER",
        vendorRole: "STAFF",
      },
      { email: "demo-customer@merqify.com", name: "Demo Customer", platformRole: "CUSTOMER" },
      {
        email: "demo-store-admin@merqify.com",
        name: "Demo Store Admin",
        platformRole: "CUSTOMER",
        vendorRole: "ADMIN",
      },
      {
        email: "demo-srimart-admin@merqify.com",
        name: "Demo SriMart Admin",
        platformRole: "CUSTOMER",
        vendorRole: "ADMIN",
        vendorSlug: "srimart",
      },
    ]);
  });

  it("has six accounts and exactly one platform admin, which is not demo-admin (#1319)", () => {
    expect(DEMO_ACCOUNTS).toHaveLength(6);
    const platformAdmins = DEMO_ACCOUNTS.filter((a) => a.platformRole === "ADMIN");
    expect(platformAdmins.map((a) => a.email)).toEqual(["demo-platform-admin@merqify.com"]);
    // A platform admin needs no membership: requireVendorRole() admits it at every store.
    expect(platformAdmins[0].vendorRole).toBeUndefined();
  });

  it("includes store admins that are not also platform admins", () => {
    // requireVendorRole() short-circuits to via:"platform-admin" for any User.role ADMIN
    // (lib/auth-rbac.ts), so only a non-platform account can exercise the store-admin
    // guards in lib/repositories/roles.ts. All three resolve as via:"ADMIN" (#190, #1319);
    // demo-srimart-admin is the second-vendor counterpart needed to test a cross-vendor
    // write refusal in the reverse direction too (#141).
    const storeAdmins = DEMO_ACCOUNTS.filter(
      (a) => a.vendorRole === "ADMIN" && a.platformRole !== "ADMIN",
    );
    expect(storeAdmins.map((a) => a.email).sort()).toEqual([
      "demo-admin@merqify.com",
      "demo-srimart-admin@merqify.com",
      "demo-store-admin@merqify.com",
    ]);
  });

  it("attaches exactly one vendor-role account to a non-default vendor via vendorSlug", () => {
    // Every other vendor-role account relies on the implicit "first ACTIVE vendor"
    // default; only demo-srimart-admin should override it, otherwise the reverse-
    // direction cross-vendor test this account exists for isn't actually reverse.
    const slugged = DEMO_ACCOUNTS.filter((a) => a.vendorSlug);
    expect(slugged).toHaveLength(1);
    expect(slugged[0]).toMatchObject({
      email: "demo-srimart-admin@merqify.com",
      vendorSlug: "srimart",
    });
  });
});

describe("addDemoAccounts", () => {
  it("signs up all, sets platform role, and attaches vendor memberships", async () => {
    const prisma = makeFakePrisma();
    const signedUp: DemoAccount[] = [];
    const signUp: SignUp = async (account) => {
      signedUp.push(account);
      prisma.users.set(account.email, { id: `new-${account.email}`, email: account.email });
    };

    await addDemoAccounts(prisma, signUp, "demo-pass-123");

    expect(signedUp.map((a) => a.email)).toEqual(DEMO_ACCOUNTS.map((a) => a.email));
    expect(prisma.users.get("demo-admin@merqify.com")).toMatchObject({
      role: "CUSTOMER",
      emailVerified: true,
    });
    expect(prisma.users.get("demo-platform-admin@merqify.com")).toMatchObject({
      role: "ADMIN",
      emailVerified: true,
    });
    expect(prisma.users.get("demo-customer@merqify.com")).toMatchObject({ role: "CUSTOMER" });
    // Memberships only for accounts carrying a vendorRole — not the plain customer.
    // Derived from the roster so adding an account doesn't silently break this.
    const expectedRoles = DEMO_ACCOUNTS.flatMap((a) => (a.vendorRole ? [a.vendorRole] : [])).sort();
    expect(prisma.memberships.map((m) => m.role).sort()).toEqual(expectedRoles);
    // Accounts without a vendorSlug land on the default (first-active) vendor; the one
    // account that names a vendorSlug lands on its own, distinct vendor.
    const defaultCount = DEMO_ACCOUNTS.filter((a) => a.vendorRole && !a.vendorSlug).length;
    expect(prisma.memberships.filter((m) => m.vendorId === "vendor-aheed")).toHaveLength(
      defaultCount,
    );
    expect(prisma.memberships.find((m) => m.vendorId !== "vendor-aheed")).toMatchObject({
      vendorId: "vendor-srimart",
      role: "ADMIN",
    });
  });

  it("is idempotent: a second run signs up nobody and creates no duplicate memberships", async () => {
    const prisma = makeFakePrisma(DEMO_ACCOUNTS.map((a) => a.email));
    const signedUp: DemoAccount[] = [];
    const signUp: SignUp = async (account) => {
      signedUp.push(account);
    };

    await addDemoAccounts(prisma, signUp, "demo-pass-123");
    await addDemoAccounts(prisma, signUp, "demo-pass-123");

    expect(signedUp).toEqual([]);
    // One membership per account with a vendorRole, no dupes across the two runs.
    expect(prisma.memberships).toHaveLength(DEMO_ACCOUNTS.filter((a) => a.vendorRole).length);
  });

  it("demotes an existing platform-admin demo-admin to a store admin and keeps its membership (#1319)", async () => {
    const prisma = makeFakePrisma(DEMO_ACCOUNTS.map((a) => a.email));
    const demoAdmin = prisma.users.get("demo-admin@merqify.com")!;
    demoAdmin.role = "ADMIN"; // the pre-#1319 state of every existing database
    prisma.memberships.push({ userId: demoAdmin.id, vendorId: "vendor-aheed", role: "ADMIN" });
    const updates: { email: string; role: string }[] = [];
    const realUpdate = prisma.user.update.bind(prisma.user);
    prisma.user.update = async (args) => {
      if ("role" in args.data) updates.push({ email: args.where.email, role: args.data.role });
      return realUpdate(args);
    };

    await addDemoAccounts(prisma, async () => {}, "demo-pass-123");

    expect(updates).toContainEqual({ email: "demo-admin@merqify.com", role: "CUSTOMER" });
    expect(prisma.users.get("demo-admin@merqify.com")?.role).toBe("CUSTOMER");
    expect(
      prisma.memberships.filter((m) => m.userId === demoAdmin.id && m.vendorId === "vendor-aheed"),
    ).toEqual([{ userId: demoAdmin.id, vendorId: "vendor-aheed", role: "ADMIN" }]);
  });
});

describe("addDemoAccounts — legacy @example.com addresses (#1356)", () => {
  /** Wraps the fake so every write is counted. */
  function countWrites(prisma: ReturnType<typeof makeFakePrisma>) {
    const calls = { renames: [] as { from: string; to: string }[], updates: 0, upserts: 0 };
    const realUpdate = prisma.user.update.bind(prisma.user);
    prisma.user.update = async (args) => {
      calls.updates++;
      if ("email" in args.data) calls.renames.push({ from: args.where.email, to: args.data.email });
      return realUpdate(args);
    };
    const realUpsert = prisma.vendorMembership.upsert.bind(prisma.vendorMembership);
    prisma.vendorMembership.upsert = async (args) => {
      calls.upserts++;
      return realUpsert(args);
    };
    return calls;
  }

  it("renames a legacy-only account in place, keeping its id, and signs nobody up (R4)", async () => {
    const prisma = makeFakePrisma(LEGACY_DEMO_EMAILS as string[]);
    const legacyIds = new Map(LEGACY_DEMO_EMAILS.map((e) => [e, prisma.users.get(e)!.id]));
    const calls = countWrites(prisma);
    const signedUp: DemoAccount[] = [];
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(m));

    await addDemoAccounts(prisma, async (a) => void signedUp.push(a), "demo-pass-123");
    log.mockRestore();

    expect(signedUp).toEqual([]);
    expect(calls.renames).toEqual(
      DEMO_ACCOUNTS.map((a) => ({ from: legacyDemoEmail(a.email), to: a.email })),
    );
    for (const account of DEMO_ACCOUNTS) {
      expect(prisma.users.has(legacyDemoEmail(account.email))).toBe(false);
      expect(prisma.users.get(account.email)?.id).toBe(
        legacyIds.get(legacyDemoEmail(account.email)),
      );
      expect(logs).toContain(`~ ${legacyDemoEmail(account.email)} -> ${account.email} [renamed]`);
    }
    // R6 — the reconcile ran against the NEW address.
    expect(prisma.users.get("demo-platform-admin@merqify.com")).toMatchObject({
      role: "ADMIN",
      emailVerified: true,
      name: "Demo Platform Admin",
    });
  });

  it("refuses the whole run before any write when both addresses exist (R3)", async () => {
    const prisma = makeFakePrisma([
      "demo-customer@merqify.com",
      "demo-customer@example.com",
      "demo-admin@example.com", // a legacy-only account that must NOT be renamed either
    ]);
    const calls = countWrites(prisma);
    const signedUp: DemoAccount[] = [];

    await expect(
      addDemoAccounts(prisma, async (a) => void signedUp.push(a), "demo-pass-123"),
    ).rejects.toThrow(/demo-customer@merqify\.com and demo-customer@example\.com/);

    expect(calls.updates).toBe(0);
    expect(calls.upserts).toBe(0);
    expect(signedUp).toEqual([]);
    expect(prisma.users.has("demo-admin@example.com")).toBe(true);
  });

  it("is idempotent after a rename: the second run renames and signs up nobody (R6)", async () => {
    const prisma = makeFakePrisma(LEGACY_DEMO_EMAILS as string[]);
    await addDemoAccounts(prisma, async () => {}, "demo-pass-123");
    const calls = countWrites(prisma);
    const signedUp: DemoAccount[] = [];
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(m));

    await addDemoAccounts(prisma, async (a) => void signedUp.push(a), "demo-pass-123");
    log.mockRestore();

    expect(calls.renames).toEqual([]);
    expect(signedUp).toEqual([]);
    expect(logs.filter((l) => l.endsWith("[reconciled]"))).toHaveLength(6);
    expect(prisma.memberships).toHaveLength(DEMO_ACCOUNTS.filter((a) => a.vendorRole).length);
  });

  it("signs up every account on the new address when neither exists (R5)", async () => {
    const prisma = makeFakePrisma();
    const signedUp: string[] = [];
    await addDemoAccounts(
      prisma,
      async (a) => {
        signedUp.push(a.email);
        prisma.users.set(a.email, { id: `new-${a.email}`, email: a.email });
      },
      "demo-pass-123",
    );
    expect(signedUp).toHaveLength(6);
    expect(signedUp.every((e) => e.endsWith("@merqify.com"))).toBe(true);
  });
});

describe("removeDemoAccounts", () => {
  it("deletes both the new and the legacy addresses in one call (#1356 R7)", async () => {
    const prisma = makeFakePrisma([
      "demo-customer@merqify.com",
      "demo-admin@example.com",
      "owner@merqify.com",
    ]);
    const lists: string[][] = [];
    const realDelete = prisma.user.deleteMany.bind(prisma.user);
    prisma.user.deleteMany = async (args) => {
      lists.push(args.where.email.in);
      return realDelete(args);
    };

    const count = await removeDemoAccounts(prisma);

    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveLength(12);
    expect([...lists[0]].sort()).toEqual([...DEMO_EMAILS, ...LEGACY_DEMO_EMAILS].sort());
    expect(count).toBe(2);
    expect(prisma.users.has("owner@merqify.com")).toBe(true);
  });

  it("deletes exactly the demo accounts, leaving others", async () => {
    const prisma = makeFakePrisma([
      ...DEMO_ACCOUNTS.map((a) => a.email),
      "real-customer@example.com",
    ]);

    const count = await removeDemoAccounts(prisma);

    expect(count).toBe(DEMO_ACCOUNTS.length);
    expect(prisma.users.has("demo-admin@merqify.com")).toBe(false);
    expect(prisma.users.has("real-customer@example.com")).toBe(true);
  });
});

describe("demoAuthOptions (no-email guarantee)", () => {
  it("configures email/password with no email hooks", () => {
    const opts = demoAuthOptions({} as unknown as PrismaClient);
    expect(opts).not.toHaveProperty("emailVerification");
    expect(opts.emailAndPassword).toEqual({ enabled: true });
    expect(opts.emailAndPassword).not.toHaveProperty("sendResetPassword");
  });
});
