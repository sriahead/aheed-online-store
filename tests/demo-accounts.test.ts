import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
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
        users.set(where.email, u);
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
        email: "demo-admin@example.com",
        name: "Demo Admin",
        platformRole: "CUSTOMER",
        vendorRole: "ADMIN",
      },
      {
        email: "demo-platform-admin@example.com",
        name: "Demo Platform Admin",
        platformRole: "ADMIN",
      },
      {
        email: "demo-staff@example.com",
        name: "Demo Staff",
        platformRole: "CUSTOMER",
        vendorRole: "STAFF",
      },
      { email: "demo-customer@example.com", name: "Demo Customer", platformRole: "CUSTOMER" },
      {
        email: "demo-store-admin@example.com",
        name: "Demo Store Admin",
        platformRole: "CUSTOMER",
        vendorRole: "ADMIN",
      },
      {
        email: "demo-srimart-admin@example.com",
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
    expect(platformAdmins.map((a) => a.email)).toEqual(["demo-platform-admin@example.com"]);
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
      "demo-admin@example.com",
      "demo-srimart-admin@example.com",
      "demo-store-admin@example.com",
    ]);
  });

  it("attaches exactly one vendor-role account to a non-default vendor via vendorSlug", () => {
    // Every other vendor-role account relies on the implicit "first ACTIVE vendor"
    // default; only demo-srimart-admin should override it, otherwise the reverse-
    // direction cross-vendor test this account exists for isn't actually reverse.
    const slugged = DEMO_ACCOUNTS.filter((a) => a.vendorSlug);
    expect(slugged).toHaveLength(1);
    expect(slugged[0]).toMatchObject({
      email: "demo-srimart-admin@example.com",
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
    expect(prisma.users.get("demo-admin@example.com")).toMatchObject({
      role: "CUSTOMER",
      emailVerified: true,
    });
    expect(prisma.users.get("demo-platform-admin@example.com")).toMatchObject({
      role: "ADMIN",
      emailVerified: true,
    });
    expect(prisma.users.get("demo-customer@example.com")).toMatchObject({ role: "CUSTOMER" });
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
    const demoAdmin = prisma.users.get("demo-admin@example.com")!;
    demoAdmin.role = "ADMIN"; // the pre-#1319 state of every existing database
    prisma.memberships.push({ userId: demoAdmin.id, vendorId: "vendor-aheed", role: "ADMIN" });
    const updates: { email: string; role: string }[] = [];
    const realUpdate = prisma.user.update.bind(prisma.user);
    prisma.user.update = async (args) => {
      updates.push({ email: args.where.email, role: args.data.role });
      return realUpdate(args);
    };

    await addDemoAccounts(prisma, async () => {}, "demo-pass-123");

    expect(updates).toContainEqual({ email: "demo-admin@example.com", role: "CUSTOMER" });
    expect(prisma.users.get("demo-admin@example.com")?.role).toBe("CUSTOMER");
    expect(
      prisma.memberships.filter((m) => m.userId === demoAdmin.id && m.vendorId === "vendor-aheed"),
    ).toEqual([{ userId: demoAdmin.id, vendorId: "vendor-aheed", role: "ADMIN" }]);
  });
});

describe("removeDemoAccounts", () => {
  it("deletes exactly the demo accounts, leaving others", async () => {
    const prisma = makeFakePrisma([
      ...DEMO_ACCOUNTS.map((a) => a.email),
      "real-customer@example.com",
    ]);

    const count = await removeDemoAccounts(prisma);

    expect(count).toBe(DEMO_ACCOUNTS.length);
    expect(prisma.users.has("demo-admin@example.com")).toBe(false);
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
