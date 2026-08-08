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
        platformRole: "ADMIN",
        vendorRole: "ADMIN",
      },
      {
        email: "demo-staff@example.com",
        name: "Demo Staff",
        platformRole: "CUSTOMER",
        vendorRole: "STAFF",
      },
      { email: "demo-customer@example.com", name: "Demo Customer", platformRole: "CUSTOMER" },
    ]);
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
      role: "ADMIN",
      emailVerified: true,
    });
    expect(prisma.users.get("demo-customer@example.com")).toMatchObject({ role: "CUSTOMER" });
    // Memberships only for accounts with a vendorRole (admin + staff, not customer).
    expect(prisma.memberships.map((m) => m.role).sort()).toEqual(["ADMIN", "STAFF"]);
    expect(prisma.memberships.every((m) => m.vendorId === "vendor-aheed")).toBe(true);
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
    expect(prisma.memberships).toHaveLength(2); // admin + staff, no dupes
  });
});

describe("removeDemoAccounts", () => {
  it("deletes exactly the demo accounts, leaving others", async () => {
    const prisma = makeFakePrisma([
      ...DEMO_ACCOUNTS.map((a) => a.email),
      "real-customer@example.com",
    ]);

    const count = await removeDemoAccounts(prisma);

    expect(count).toBe(3);
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
