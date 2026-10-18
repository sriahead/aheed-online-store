import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";

/**
 * #1134 validation helper — READ-ONLY. Prints every ACTIVE vendor's `marketingConsentEnabled`
 * switch, then the marketing-consent log for one user, per vendor, oldest first, so a live run of
 * `specs/2026-10-18-p1134-switches-marketing-consent/validation.md` (R14, R19, R21, R22, R28) can
 * read back exactly what a sign-up or an account choice wrote.
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its own client from the bare `@prisma/client`
 * with `@prisma/adapter-neon`'s HTTP adapter. It only reads: no create, update or delete anywhere.
 *
 * Usage: `npx tsx scripts/verify-marketing-consent.ts <email>`
 *
 * Reads `.env`'s database. Under `npm run preview` the Worker reads `.dev.vars`, so confirm both
 * name the same DEV database (and diff them against `secrets/*.vars`) before trusting the output.
 */

async function httpClient(): Promise<PrismaClient> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env against secrets/*.vars");
  console.log(`database host: ${new URL(url).hostname}`);
  const { PrismaNeonHttp } = await import("@prisma/adapter-neon");
  return new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/verify-marketing-consent.ts <email>");
    process.exit(2);
  }

  const prisma = await httpClient();

  const vendors = await prisma.vendor.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, config: { select: { marketingConsentEnabled: true } } },
    orderBy: { name: "asc" },
  });
  console.log("\nswitches:");
  for (const vendor of vendors) {
    console.log(`  ${vendor.name}: ${vendor.config?.marketingConsentEnabled ?? false}`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  if (!user) {
    console.log(`\nno user with email ${email}`);
    return;
  }
  console.log(`\nuser ${email} (emailVerified: ${user.emailVerified})`);

  const events = await prisma.marketingConsentEvent.findMany({
    where: { userId: user.id },
    select: {
      vendor: { select: { name: true } },
      granted: true,
      source: true,
      statement: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (events.length === 0) {
    console.log("  no marketing-consent events");
    return;
  }
  for (const vendor of vendors) {
    const mine = events.filter((e) => e.vendor.name === vendor.name);
    console.log(`  ${vendor.name}: ${mine.length} event(s)`);
    for (const e of mine) {
      console.log(
        `    ${e.createdAt.toISOString()}  ${e.source}  ${e.granted ? "granted" : "withdrawn"}  "${e.statement}"`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
