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

type FakeUser = { email: string; role?: string; emailVerified?: boolean; name?: string };

/** In-memory stand-in for the Prisma surface addDemoAccounts/removeDemoAccounts use. */
function makeFakePrisma(seedEmails: string[] = []) {
  const users = new Map<string, FakeUser>();
  for (const email of seedEmails) users.set(email, { email });
  const prisma: DemoPrisma & { users: Map<string, FakeUser> } = {
    users,
    user: {
      async findUnique({ where }) {
        return users.get(where.email) ?? null;
      },
      async update({ where, data }) {
        const u = users.get(where.email) ?? { email: where.email };
        Object.assign(u, data);
        users.set(where.email, u);
        return u;
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const email of where.email.in) if (users.delete(email)) count++;
        return { count };
      },
    },
  };
  return prisma;
}

describe("DEMO_ACCOUNTS roster", () => {
  it("has one account per RBAC role with the expected emails", () => {
    expect(DEMO_ACCOUNTS.map((a) => [a.email, a.role])).toEqual([
      ["demo-admin@example.com", "ADMIN"],
      ["demo-staff@example.com", "STAFF"],
      ["demo-customer@example.com", "CUSTOMER"],
    ]);
  });
});

describe("addDemoAccounts", () => {
  it("signs up every account on an empty DB and sets role + emailVerified", async () => {
    const prisma = makeFakePrisma();
    const signedUp: DemoAccount[] = [];
    const signUp: SignUp = async (account) => {
      signedUp.push(account);
      prisma.users.set(account.email, { email: account.email });
    };

    await addDemoAccounts(prisma, signUp, "demo-pass-123");

    expect(signedUp.map((a) => a.email)).toEqual(DEMO_ACCOUNTS.map((a) => a.email));
    expect(prisma.users.get("demo-admin@example.com")).toMatchObject({
      role: "ADMIN",
      emailVerified: true,
      name: "Demo Admin",
    });
    expect(prisma.users.get("demo-customer@example.com")).toMatchObject({
      role: "CUSTOMER",
      emailVerified: true,
    });
  });

  it("is idempotent: a second run signs up nobody but still reconciles roles", async () => {
    const prisma = makeFakePrisma(DEMO_ACCOUNTS.map((a) => a.email)); // all already present
    const signedUp: DemoAccount[] = [];
    const signUp: SignUp = async (account) => {
      signedUp.push(account);
    };

    await addDemoAccounts(prisma, signUp, "demo-pass-123");

    expect(signedUp).toEqual([]); // nobody signed up again
    expect(prisma.users.size).toBe(3); // no duplicates
    expect(prisma.users.get("demo-staff@example.com")).toMatchObject({
      role: "STAFF",
      emailVerified: true,
    });
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

describe("demoAuthOptions (no-email guarantee, spec R7)", () => {
  it("configures email/password with no email hooks", () => {
    const opts = demoAuthOptions({} as unknown as PrismaClient);
    // No verification-email or reset-password hook exists anywhere, so `add` can never
    // trigger an email as a side effect.
    expect(opts).not.toHaveProperty("emailVerification");
    expect(opts.emailAndPassword).toEqual({ enabled: true });
    expect(opts.emailAndPassword).not.toHaveProperty("sendResetPassword");
  });
});
