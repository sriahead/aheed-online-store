import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

/**
 * Standalone demo-accounts tool (spec: specs/2026-08-08-demo-accounts-tool/, issue #57).
 *
 * Adds or removes the platform's demo login accounts on demand, against whichever
 * environment's DIRECT_URL is set — deliberately SEPARATE from prisma/seed.ts so demo
 * accounts can be managed independently and survive DB resets (per the standing "keep
 * demo accounts in prod + staging until all phases complete" directive).
 *
 * Runs in Node (via tsx), NOT workerd — so it uses the bare `@prisma/client` (like
 * seed.ts), never lib/db.ts's `@prisma/client/wasm`, and it does NOT reuse lib/auth.ts's
 * getAuth() (which is wired for the Workers runtime and carries email hooks). Instead it
 * builds a minimal, EMAIL-FREE Better Auth instance whose only job is to create credential
 * accounts (hashed passwords) — so `add` never sends a verification email (spec R7).
 */

// Platform role = User.role (platform ADMIN transcends vendors); vendor role = a
// VendorMembership at the current vendor (ADR-004 slice 3a). A demo account can be both.
export type PlatformRole = "ADMIN" | "CUSTOMER";
export type VendorRole = "STAFF" | "ADMIN";

export interface DemoAccount {
  email: string;
  name: string;
  platformRole: PlatformRole;
  vendorRole?: VendorRole;
}

/** Fixed, code-defined roster. demo-admin is a platform admin; demo-staff is a normal user
 *  with a vendor STAFF membership (not a platform staffer); demo-customer is a plain shopper. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
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
];

/**
 * Better Auth options for the tool's throwaway instance. Intentionally has NO email
 * hooks (no `emailVerification`, no `sendResetPassword`) and no `requireEmailVerification`,
 * so signing an account up never triggers an email. Exported so a test can assert that
 * guarantee structurally (spec R7).
 */
export function demoAuthOptions(prisma: PrismaClient) {
  return {
    database: prismaAdapter(prisma, { provider: "postgresql" as const }),
    // Password hashing (scrypt) is independent of this secret; a local default is fine
    // when BETTER_AUTH_SECRET isn't present in the tool's shell.
    secret: process.env.BETTER_AUTH_SECRET ?? "demo-accounts-tool-local-secret",
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: "string" as const, defaultValue: "CUSTOMER", input: false },
      },
    },
  };
}

function buildDemoAuth(prisma: PrismaClient) {
  return betterAuth(demoAuthOptions(prisma));
}

/** Minimal Prisma surface the add/remove logic needs — lets tests inject a fake. */
export interface DemoPrisma {
  user: {
    findUnique(args: { where: { email: string } }): Promise<{ id: string } | null>;
    update(args: {
      where: { email: string };
      data: { role: PlatformRole; emailVerified: boolean; name: string };
    }): Promise<{ id: string }>;
    deleteMany(args: { where: { email: { in: string[] } } }): Promise<{ count: number }>;
  };
  vendor: {
    findFirstOrThrow(args: {
      where: { status: "ACTIVE" };
      orderBy: { createdAt: "asc" };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  vendorMembership: {
    upsert(args: {
      where: { userId_vendorId: { userId: string; vendorId: string } };
      create: { userId: string; vendorId: string; role: VendorRole };
      update: { role: VendorRole };
    }): Promise<unknown>;
  };
}

/** Creates a fresh credential account; injected so tests don't hit Better Auth or a DB. */
export type SignUp = (account: DemoAccount, password: string) => Promise<void>;

/**
 * Idempotent add: sign up any missing account, then reconcile role + emailVerified for
 * every account (so an existing one is corrected rather than errored, and a re-run is a
 * no-op beyond the reconcile). `emailVerified` is forced true directly because the app's
 * runtime auth has `requireEmailVerification: true` and these @example.com addresses can
 * never receive a real verification email.
 */
export async function addDemoAccounts(
  prisma: DemoPrisma,
  signUp: SignUp,
  password: string,
): Promise<void> {
  // The single active vendor (Aheed) for now; memberships attach here.
  const vendor = await prisma.vendor.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const account of DEMO_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (!existing) {
      await signUp(account, password);
    }
    const { id: userId } = await prisma.user.update({
      where: { email: account.email },
      data: { role: account.platformRole, emailVerified: true, name: account.name },
    });
    if (account.vendorRole) {
      await prisma.vendorMembership.upsert({
        where: { userId_vendorId: { userId, vendorId: vendor.id } },
        create: { userId, vendorId: vendor.id, role: account.vendorRole },
        update: { role: account.vendorRole },
      });
    }
    const vendorNote = account.vendorRole ? `, vendor ${account.vendorRole}` : "";
    console.log(
      `+ ${account.email} (platform ${account.platformRole}${vendorNote})${existing ? " [reconciled]" : ""}`,
    );
  }
}

/** Removes every demo account; Session/Account rows cascade via the schema. */
export async function removeDemoAccounts(prisma: DemoPrisma): Promise<number> {
  const emails = DEMO_ACCOUNTS.map((a) => a.email);
  const { count } = await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log(`removed ${count} demo user(s)`);
  return count;
}

function maskUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ":****@");
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action !== "add" && action !== "remove") {
    console.error("usage: npm run demo:accounts -- <add|remove>");
    process.exit(1);
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DIRECT_URL/DATABASE_URL is empty — set the target environment's direct URL first.",
    );
    process.exit(1);
  }

  let password: string | undefined;
  if (action === "add") {
    password = process.env.DEMO_ACCOUNT_PASSWORD;
    if (!password) {
      console.error("DEMO_ACCOUNT_PASSWORD is empty — set it (min 8 chars) to add demo accounts.");
      process.exit(1);
    }
  }

  console.log(`demo-accounts ${action} -> ${maskUrl(connectionString)}`);
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    if (action === "add") {
      const auth = buildDemoAuth(prisma);
      await addDemoAccounts(
        prisma,
        async (account, pw) => {
          await auth.api.signUpEmail({
            body: { email: account.email, name: account.name, password: pw },
          });
        },
        password!,
      );
    } else {
      await removeDemoAccounts(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when invoked directly (`tsx scripts/demo-accounts.ts …`), not when imported by tests.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
