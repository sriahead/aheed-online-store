import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  addVendorEnquiryReply,
  createVendorEnquiry,
  findVendorEnquiry,
  listVendorEnquiries,
  updateVendorEnquiryStatus,
} from "@/lib/repositories/enquiries";
import { applyVendorRole } from "@/lib/repositories/roles";

/**
 * #1482 validation harness — `specs/2026-11-10-pr1481-enquiries-team-access-retro/` R33, against
 * REAL Postgres, through BOTH Neon adapters, each on the path that uses it in production:
 *
 * - `PrismaNeonHttp` (what `getPrisma()` resolves) for every enquiries repository call, so a write
 *   that only works over a websocket would fail here as it would on the Worker;
 * - `PrismaNeon` over WebSocket (what `getPrismaWs()` resolves) for `applyVendorRole`'s interactive
 *   Serializable transaction (provisioning, Platform Admin grant, the platform-admin count guard).
 *
 * Runs in Node (via tsx) from the bare `@prisma/client`, never `lib/db.ts`'s wasm client.
 *
 * Usage: `npx tsx scripts/verify-pr1481-integration.ts`
 *
 * Writes fixtures to `.env`'s database, which must be DEV — check DIRECT_URL/DATABASE_URL in the
 * process environment and compare `.env` against `secrets/*.vars` first (CLAUDE.md). Needs the
 * `20261109225000_vendor_enquiries` migration applied there, two ACTIVE vendors, and at least one
 * platform admin. Every fixture carries this run's tag and is deleted before exit, including after a
 * failed check.
 *
 * Deliberately NOT exercised: the guard's refusal when only ONE platform admin is left. Producing it
 * would mean demoting dev's real platform admins; the refusal branch is covered by
 * tests/roles.test.ts, and this script proves the guard's count query runs on the real adapter.
 */

const RUN = `verify-${randomUUID().slice(0, 8)}`;
const FIXTURE_EMAIL = `${RUN}@verify.invalid`;
const UNKNOWN_EMAIL = `${RUN}-nobody@verify.invalid`;

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function clients(): Promise<{ http: PrismaClient; ws: PrismaClient }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env against secrets/*.vars");
  console.log(`  database host: ${new URL(url).hostname}`);
  const { PrismaNeon, PrismaNeonHttp } = await import("@prisma/adapter-neon");
  return {
    http: new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) }),
    ws: new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) }),
  };
}

/** The repositories are typed against lib/db's wasm client; the Node client is the same API. */
const asRepoDb = (prisma: PrismaClient) => prisma as never;

async function rejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return pattern.test(err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  const { http, ws } = await clients();
  const db = asRepoDb(http);
  const dbWs = asRepoDb(ws);
  const enquiryIds: string[] = [];

  try {
    const vendors = await http.vendor.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      take: 2,
    });
    if (vendors.length < 2) throw new Error("needs two ACTIVE vendors on this database");
    const [vendorA, vendorB] = vendors.map((v) => v.id);
    const actor = await http.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    if (!actor) throw new Error("needs at least one platform admin on this database");

    // ── Enquiries, HTTP adapter ───────────────────────────────────────────────────────────────
    const first = await createVendorEnquiry(db, vendorA, {
      source: "CONTACT_FORM",
      type: "ENQUIRY",
      senderName: "Verify",
      senderEmail: `${RUN}-shopper@verify.invalid`,
      subject: `${RUN} first`,
      message: "integration check",
    });
    enquiryIds.push(first.id);
    await new Promise((resolve) => setTimeout(resolve, 50)); // distinct createdAt for the order check
    const second = await createVendorEnquiry(db, vendorA, {
      source: "INBOUND_EMAIL",
      type: "ORDERS",
      senderEmail: `${RUN}-shopper@verify.invalid`,
      toAddress: "orders@verify.invalid",
      subject: `${RUN} second`,
      message: "integration check",
    });
    enquiryIds.push(second.id);
    check("create enquiry (HTTP adapter), status OPEN", first.status === "OPEN");

    const list = (await listVendorEnquiries(db, vendorA, 100)) as {
      id: string;
      vendorId: string;
    }[];
    const ours = list.filter((e) => enquiryIds.includes(e.id)).map((e) => e.id);
    check(
      "list scoped to vendor, newest first, ≤100",
      list.length <= 100 &&
        list.every((e) => e.vendorId === vendorA) &&
        ours[0] === second.id &&
        ours[1] === first.id,
      JSON.stringify(ours),
    );

    check(
      "find by (id, vendorId)",
      (await findVendorEnquiry(db, vendorA, first.id))?.id === first.id,
    );
    check(
      "cross-vendor find returns null",
      (await findVendorEnquiry(db, vendorB, first.id)) === null,
    );

    const r1 = await addVendorEnquiryReply(db, vendorA, first.id, {
      body: "first reply",
      sentBy: "verify@verify.invalid",
      sentAt: new Date(),
    });
    const r2 = await addVendorEnquiryReply(db, vendorA, first.id, {
      body: "second reply",
      sentBy: "verify@verify.invalid",
      sentAt: new Date(Date.now() + 1000),
    });
    const crossReply = await addVendorEnquiryReply(db, vendorB, first.id, {
      body: "must not land",
      sentBy: "verify@verify.invalid",
      sentAt: new Date(),
    });
    const replies = await http.vendorEnquiryReply.findMany({
      where: { enquiryId: first.id },
      orderBy: { sentAt: "asc" },
    });
    check(
      "reply appended",
      r1 !== null &&
        r2 !== null &&
        replies.length === 2 &&
        replies[0].body === "first reply" &&
        replies[1].body === "second reply",
      `${replies.length} replies`,
    );
    check("cross-vendor reply refused", crossReply === null);
    check(
      "status REPLIED after a reply",
      (await findVendorEnquiry(db, vendorA, first.id))?.status === "REPLIED",
    );

    await updateVendorEnquiryStatus(db, vendorA, first.id, "RESOLVED");
    check(
      "status update (HTTP adapter)",
      (await findVendorEnquiry(db, vendorA, first.id))?.status === "RESOLVED",
    );
    check(
      "cross-vendor status update refused",
      await rejects(() => updateVendorEnquiryStatus(db, vendorB, first.id, "OPEN"), /./),
    );

    // ── Team & Access, WebSocket adapter transaction ─────────────────────────────────────────
    const platformActor = { id: actor.id, via: "platform-admin" as const };

    await applyVendorRole(
      db,
      dbWs,
      vendorA,
      platformActor,
      ` ${FIXTURE_EMAIL.toUpperCase()} `,
      "STAFF",
    );
    const provisioned = await http.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    const membership = provisioned
      ? await http.vendorMembership.findUnique({
          where: { userId_vendorId: { userId: provisioned.id, vendorId: vendorA } },
        })
      : null;
    check(
      "provision STAFF",
      provisioned?.role === "CUSTOMER" &&
        provisioned.emailVerified === true &&
        membership?.role === "STAFF",
    );

    await applyVendorRole(db, dbWs, vendorA, platformActor, FIXTURE_EMAIL, "PLATFORM_ADMIN");
    const granted = await http.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    check("grant PLATFORM_ADMIN sets User.role ADMIN", granted?.role === "ADMIN");

    await applyVendorRole(db, dbWs, vendorA, platformActor, FIXTURE_EMAIL, null);
    const demoted = await http.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    check(
      "last platform admin guard counts on the WebSocket adapter, demotion allowed while others remain",
      demoted?.role === "CUSTOMER",
    );

    const audit = provisioned
      ? await http.vendorRoleAuditLog.findMany({
          where: { userId: provisioned.id, vendorId: vendorA },
          orderBy: { createdAt: "asc" },
        })
      : [];
    check(
      "one audit row per change, effective old role recorded",
      audit.map((a) => `${a.oldRole}->${a.newRole}`).join(",") ===
        "null->STAFF,STAFF->PLATFORM_ADMIN,PLATFORM_ADMIN->null",
      audit.map((a) => `${a.oldRole}->${a.newRole}`).join(","),
    );

    check(
      "PLATFORM_ADMIN for an unknown email refused, nothing created",
      (await rejects(
        () => applyVendorRole(db, dbWs, vendorA, platformActor, UNKNOWN_EMAIL, "PLATFORM_ADMIN"),
        /sign up first/i,
      )) && (await http.user.count({ where: { email: UNKNOWN_EMAIL } })) === 0,
    );
  } finally {
    // Enquiries (replies cascade), then the fixture user (memberships and audit rows cascade).
    await http.vendorEnquiry.deleteMany({ where: { subject: { startsWith: RUN } } });
    await http.user.deleteMany({ where: { email: { startsWith: RUN } } });
    const left =
      (await http.vendorEnquiry.count({ where: { subject: { startsWith: RUN } } })) +
      (await http.vendorEnquiryReply.count({ where: { enquiryId: { in: enquiryIds } } })) +
      (await http.user.count({ where: { email: { startsWith: RUN } } }));
    console.log(`  cleanup: ${left} rows left`);
    if (left !== 0) failures += 1;
    await http.$disconnect();
    await ws.$disconnect();
  }

  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
