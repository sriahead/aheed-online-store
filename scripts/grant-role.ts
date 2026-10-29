import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";
import { isDemoEmail } from "./lib/neon-migration-plan";

/**
 * #1323 — give an EXISTING user a role in a database that has no admin yet.
 * Spec: specs/2026-10-29-merqify-platform-move/ (R19, R20).
 *
 *   npx tsx scripts/grant-role.ts --env-file secrets/merqify-staging.vars \
 *       --email you@yourdomain --platform-admin                       # DRY RUN (the default)
 *   ... --vendor aheed-food-centre --role ADMIN                       # store admin instead
 *   ... --apply                                                       # write it
 *
 * WHY THIS EXISTS. The new databases are filled by scripts/migrate-to-new-neon.ts, which never
 * copies an @example.com account — and on the old staging database every account holding a role
 * was one. So a freshly migrated database has nobody who can open /staff. Sign up on the new host
 * first (the user must exist), then run this once.
 *
 * WHY IT DOES NOT CALL lib/repositories/roles.ts `applyVendorRole`. That function audits a change
 * against an acting user, who must be a real `User` row. A one-off operator grant has no acting
 * user, so this writes the same two things — the membership and one `VendorRoleAuditLog` row — in
 * one transaction with `actorId` left null, which is how the log records "not done in the app".
 */

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(`REFUSING: ${message}`);
  process.exit(1);
}

const ROLES = ["ADMIN", "STAFF"] as const;
type StoreRole = (typeof ROLES)[number];

async function main() {
  const envPath = flagValue("--env-file");
  const email = flagValue("--email")?.trim().toLowerCase();
  const platformAdmin = process.argv.includes("--platform-admin");
  const vendorSlug = flagValue("--vendor");
  const role = flagValue("--role") as StoreRole | undefined;
  const apply = process.argv.includes("--apply");

  if (!envPath || !email) fail("--env-file <file> and --email <address> are required");
  if (platformAdmin === Boolean(vendorSlug)) {
    fail("pass exactly one of --platform-admin, or --vendor <slug> --role ADMIN|STAFF");
  }
  if (vendorSlug && (!role || !ROLES.includes(role))) fail("--role must be ADMIN or STAFF");
  if (isDemoEmail(email) && !process.argv.includes("--allow-demo")) {
    fail(`${email} is a demo or test account; pass --allow-demo if that is really intended`);
  }

  let url: string | undefined;
  try {
    url = parseEnvFile(envPath).DIRECT_URL;
  } catch {
    fail(`${envPath} cannot be read`);
  }
  if (!url) fail(`${envPath} has no DIRECT_URL line`);
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? "(unknown host)";
  console.log(`database: ${host}  (${envPath})`);
  console.log(`mode:     ${apply ? "APPLY" : "dry run"}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) fail(`no user has the email ${email}; sign up on the new host first`);

    if (platformAdmin) {
      console.log(`${email}: platform role ${user.role} -> ADMIN`);
      if (user.role === "ADMIN") return console.log("Already a platform admin; nothing to do.");
      if (!apply) return console.log("\nDry run: nothing was written. Re-run with --apply.");
      await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      console.log("Written.");
      return;
    }

    const vendor = await prisma.vendor.findUnique({ where: { slug: vendorSlug! } });
    if (!vendor) fail(`no store has the slug ${vendorSlug}`);
    const existing = await prisma.vendorMembership.findUnique({
      where: { userId_vendorId: { userId: user.id, vendorId: vendor.id } },
    });
    const oldRole = existing?.role ?? null;
    console.log(`${email} at ${vendor.slug}: store role ${oldRole ?? "none"} -> ${role}`);
    if (oldRole === role) return console.log("Already has that role; nothing to do.");
    if (!apply) return console.log("\nDry run: nothing was written. Re-run with --apply.");

    await prisma.$transaction(async (tx) => {
      await tx.vendorMembership.upsert({
        where: { userId_vendorId: { userId: user.id, vendorId: vendor.id } },
        create: { userId: user.id, vendorId: vendor.id, role: role! },
        update: { role: role! },
      });
      await tx.vendorRoleAuditLog.create({
        data: { vendorId: vendor.id, userId: user.id, actorId: null, oldRole, newRole: role! },
      });
    });
    console.log("Written, with one audit row (actor: operator script).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
