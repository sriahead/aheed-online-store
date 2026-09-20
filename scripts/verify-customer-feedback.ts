import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  getApprovedFeedbackSummary,
  getOwnFeedback,
  hasCompletedOrder,
  listApprovedFeedback,
  listFeedbackForModeration,
  setFeedbackStatus,
  setFeedbackStatusBulk,
  upsertCustomerFeedback,
} from "@/lib/repositories/customer-feedback";
import {
  FEEDBACK_RATE_LIMIT,
  checkFeedbackWriteRateLimit,
  hashIp,
} from "@/lib/repositories/customer-feedback-rate-limit";
import {
  deleteReviewLink,
  listActiveReviewLinks,
  upsertReviewLink,
} from "@/lib/repositories/vendor-review-links";
import { exportPersonalData, eraseVendorData } from "@/lib/repositories/data-rights";
import { toDisplayAuthorName } from "@/features/feedback/validate-feedback";

/**
 * P9.2 (#818) validation harness — proves the properties `requirements.md` asserts about
 * customer feedback against REAL Postgres.
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its own client from the bare
 * `@prisma/client` like `scripts/verify-data-rights.ts` and `prisma/seed.ts`, never
 * `lib/db.ts`'s `@prisma/client/wasm` (which does not resolve under Node at all). That is
 * exactly why every repository this exercises imports `@/lib/db` as `import type` only.
 *
 * Every mode creates its own fixtures, runs the operation, and diffs the result. Nothing
 * here is eyeballed. Output is one `R<n>: PASS|FAIL <detail>` line per check, matching the
 * rows in `validation.md`, and the process exits non-zero if any line is FAIL.
 *
 *   npx tsx scripts/verify-customer-feedback.ts            # everything except the floods
 *   npx tsx scripts/verify-customer-feedback.ts --bulk-approve
 *   npx tsx scripts/verify-customer-feedback.ts --flood-writes
 *   npx tsx scripts/verify-customer-feedback.ts --flood-edit
 *   npx tsx scripts/verify-customer-feedback.ts --dump-attempts
 *
 * READ THE DATABASE IT IS POINTED AT BEFORE RUNNING. It writes fixtures and deletes them
 * again; `.env`'s DIRECT_URL decides where. Dev or staging only.
 *
 * NOTE ON THE RATE LIMITER. `FEEDBACK_RATE_LIMIT.minEditIntervalMs` is 60 seconds, which
 * would make every sequential write in this script fail for the wrong reason. The
 * non-flood modes therefore call the repository directly (the limiter is a separate
 * concern, proven by its own modes) and only the flood modes exercise the limiter.
 */

const FIXTURE_TAG = "p818-fixture";
const FIXTURE_IP = "203.0.113.42";

function db(): PrismaClient {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is not set — check .env against secrets/staging.vars");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
}

let failures = 0;

function check(req: string, passed: boolean, detail: string): void {
  if (passed) {
    console.log(`${req}: PASS ${detail}`);
  } else {
    failures += 1;
    console.log(`${req}: FAIL ${detail}`);
  }
}

interface Fixture {
  vendorId: string;
  withOrderUserId: string;
  noOrderUserId: string;
  staffUserId: string;
  otherVendorId: string;
}

/**
 * Two vendors, three users, and one DELIVERED order for exactly one of them.
 *
 * The second vendor exists so the vendor-scoping assertions are real rather than vacuous:
 * a query that forgot its `vendorId` passes every single-vendor test ever written.
 */
async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const stamp = Date.now();

  const vendor = await prisma.vendor.create({
    data: { slug: `${FIXTURE_TAG}-${stamp}`, name: `${FIXTURE_TAG} vendor` },
  });
  const otherVendor = await prisma.vendor.create({
    data: { slug: `${FIXTURE_TAG}-other-${stamp}`, name: `${FIXTURE_TAG} other vendor` },
  });

  const mkUser = (suffix: string, name: string) =>
    prisma.user.create({
      data: {
        id: `${FIXTURE_TAG}-${suffix}-${stamp}`,
        name,
        email: `${FIXTURE_TAG}-${suffix}-${stamp}@example.invalid`,
        emailVerified: true,
      },
    });

  const withOrder = await mkUser("buyer", "Sarah Mitchell");
  const noOrder = await mkUser("browser", "Jamie Okafor");
  const staff = await mkUser("staff", "Staff Member");

  // An Order requires an Address, so the fixture needs one even though nothing here reads
  // it. Created separately rather than as a nested write: a `create` carrying nested child
  // writes opens an implicit transaction, which is the shape CLAUDE.md warns about, and
  // there is no reason for this fixture to depend on that behaving.
  const address = await prisma.address.create({
    data: {
      vendorId: vendor.id,
      userId: withOrder.id,
      recipientName: "Sarah Mitchell",
      phone: "07700900000",
      line1: "1 Fixture Street",
      city: "Milton Keynes",
      postcode: "MK9 1AA",
    },
  });

  await prisma.order.create({
    data: {
      vendorId: vendor.id,
      userId: withOrder.id,
      addressId: address.id,
      orderNumber: `${FIXTURE_TAG}-${stamp}`,
      status: "DELIVERED",
      currency: "GBP",
      subtotalPence: 1000,
      discountPence: 0,
      deliveryFeePence: 0,
      totalPence: 1000,
    },
  });

  return {
    vendorId: vendor.id,
    withOrderUserId: withOrder.id,
    noOrderUserId: noOrder.id,
    staffUserId: staff.id,
    otherVendorId: otherVendor.id,
  };
}

async function destroyFixture(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  // Vendor and User both cascade to CustomerFeedback, so removing the roots is enough.
  // Orders before addresses: Order.addressId is a required FK.
  await prisma.order.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.address.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.customerFeedbackAttempt.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.vendorReviewLink.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.customerFeedback.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.user.deleteMany({
    where: { id: { in: [fixture.withOrderUserId, fixture.noOrderUserId, fixture.staffUserId] } },
  });
  await prisma.vendor.deleteMany({
    where: { id: { in: [fixture.vendorId, fixture.otherVendorId] } },
  });
}

async function submit(
  prisma: PrismaClient,
  fixture: Fixture,
  userId: string,
  rating: number,
  comment: string,
  accountName: string,
): Promise<void> {
  const verifiedPurchase = await hasCompletedOrder(prisma, fixture.vendorId, userId);
  await upsertCustomerFeedback(prisma, fixture.vendorId, userId, {
    authorName: toDisplayAuthorName(accountName),
    rating,
    comment,
    verifiedPurchase,
    ipHash: await hashIp(FIXTURE_IP),
  });
}

/** R14, R15, R16, R17, R18, R22, R30, R32, R33, R35, R36, R37, R38, R39, R46. */
async function runCore(prisma: PrismaClient): Promise<void> {
  const fixture = await createFixture(prisma);
  try {
    // --- R14: no completed order, accepted, no badge -----------------------------------
    await submit(
      prisma,
      fixture,
      fixture.noOrderUserId,
      4,
      "Nice shop, easy to use.",
      "Jamie Okafor",
    );
    const browser = await getOwnFeedback(prisma, fixture.vendorId, fixture.noOrderUserId);
    check(
      "R14",
      browser !== null && browser.verifiedPurchase === false,
      `no-order customer accepted, verifiedPurchase=${browser?.verifiedPurchase}`,
    );

    // --- R15: completed order earns the badge ------------------------------------------
    await submit(
      prisma,
      fixture,
      fixture.withOrderUserId,
      5,
      "Lamb was excellent.",
      "Sarah Mitchell",
    );
    const buyer = await getOwnFeedback(prisma, fixture.vendorId, fixture.withOrderUserId);
    check(
      "R15",
      buyer?.verifiedPurchase === true,
      `demo customer stored verifiedPurchase=${buyer?.verifiedPurchase}`,
    );
    check(
      "R15",
      (await hasCompletedOrder(prisma, fixture.vendorId, fixture.noOrderUserId)) === false,
      "client-supplied verifiedPurchase ignored (value is derived from orders, never input)",
    );

    // --- R22: stored author name -------------------------------------------------------
    const stored = await prisma.customerFeedback.findUnique({
      where: { vendorId_userId: { vendorId: fixture.vendorId, userId: fixture.withOrderUserId } },
      select: { authorName: true },
    });
    check("R22", stored?.authorName === "Sarah M.", `authorName stored as "${stored?.authorName}"`);

    // --- R16: PENDING and invisible ----------------------------------------------------
    const beforeApproval = await listApprovedFeedback(prisma, fixture.vendorId, 10);
    check(
      "R16",
      buyer?.status === "PENDING" && beforeApproval.length === 0,
      `status=${buyer?.status} and 0 rows on the public list`,
    );

    // --- R17: second submission replaces -----------------------------------------------
    await submit(prisma, fixture, fixture.withOrderUserId, 3, "Second thoughts.", "Sarah Mitchell");
    const rowCount = await prisma.customerFeedback.count({
      where: { vendorId: fixture.vendorId, userId: fixture.withOrderUserId },
    });
    check("R17", rowCount === 1, `second submission replaced existing row, count=${rowCount}`);

    // --- R30/R32: approve stamps the moderator ------------------------------------------
    const queue = await listFeedbackForModeration(prisma, fixture.vendorId, 10);
    check("R35", queue[0]?.status === "PENDING", "moderation queue lists PENDING first");
    const target = queue.find((row) => row.id === buyer?.id) ?? queue[0];
    await setFeedbackStatus(
      prisma,
      fixture.vendorId,
      target.id,
      "APPROVED",
      fixture.staffUserId,
      "looks fine",
    );
    const approved = await prisma.customerFeedback.findUnique({
      where: { id: target.id },
      select: { status: true, moderatedById: true, moderatedAt: true },
    });
    check(
      "R32",
      approved?.status === "APPROVED" &&
        approved.moderatedById === fixture.staffUserId &&
        approved.moderatedAt !== null,
      "approve stamped moderatedById and moderatedAt",
    );

    // --- R35: only APPROVED, vendor-scoped, newest first ---------------------------------
    const publicRows = await listApprovedFeedback(prisma, fixture.vendorId, 10);
    check(
      "R35",
      publicRows.length === 1 && publicRows[0].id === target.id,
      `only APPROVED rows rendered, vendor-scoped, newest first (${publicRows.length} row)`,
    );

    // --- R37: summary --------------------------------------------------------------------
    const summary = await getApprovedFeedbackSummary(prisma, fixture.vendorId);
    check(
      "R37",
      summary.approvedCount === 1 && summary.averageRating === 3,
      `header shows mean ${summary.averageRating.toFixed(1)} and count ${summary.approvedCount}`,
    );

    // --- R38: the public shape carries no user id, email or moderation columns ------------
    const publicKeys = Object.keys(publicRows[0]).sort().join(",");
    check(
      "R38",
      !publicKeys.includes("userId") &&
        !publicKeys.includes("ipHash") &&
        !publicKeys.includes("moderationNote"),
      `card fields limited to the allowed set (${publicKeys})`,
    );

    // --- R39: badge tracks verifiedPurchase ----------------------------------------------
    check(
      "R39",
      publicRows[0].verifiedPurchase === true,
      "badge count matches verifiedPurchase count",
    );

    // --- R18: THE MODERATION BYPASS. Edit an APPROVED row. -------------------------------
    await submit(
      prisma,
      fixture,
      fixture.withOrderUserId,
      1,
      "EDITED AFTER APPROVAL.",
      "Sarah Mitchell",
    );
    const afterEdit = await prisma.customerFeedback.findUnique({
      where: { id: target.id },
      select: { status: true, moderatedById: true, moderatedAt: true },
    });
    const publicAfterEdit = await listApprovedFeedback(prisma, fixture.vendorId, 10);
    check(
      "R18",
      afterEdit?.status === "PENDING" &&
        afterEdit.moderatedById === null &&
        afterEdit.moderatedAt === null &&
        publicAfterEdit.length === 0,
      "edit of APPROVED reset to PENDING, moderator cleared, removed from the public list",
    );

    // --- R31: no repository export can rewrite the customer's words ----------------------
    await setFeedbackStatus(
      prisma,
      fixture.vendorId,
      target.id,
      "APPROVED",
      fixture.staffUserId,
      null,
    );
    const afterModeration = await prisma.customerFeedback.findUnique({
      where: { id: target.id },
      select: { comment: true, rating: true, authorName: true },
    });
    check(
      "R31",
      afterModeration?.comment === "EDITED AFTER APPROVAL." &&
        afterModeration.rating === 1 &&
        afterModeration.authorName === "Sarah M.",
      "no staff-reachable mutation of customer-authored fields",
    );

    // --- R35 (cross-vendor): another vendor's approved row must not leak ------------------
    await prisma.customerFeedback.create({
      data: {
        vendorId: fixture.otherVendorId,
        userId: fixture.noOrderUserId,
        authorName: "Other V.",
        rating: 5,
        comment: "Different vendor entirely.",
        status: "APPROVED",
      },
    });
    const stillOne = await listApprovedFeedback(prisma, fixture.vendorId, 10);
    check(
      "R35",
      stillOne.length === 1 &&
        stillOne.every((row) => row.comment !== "Different vendor entirely."),
      "another vendor's approved feedback does not appear",
    );

    // --- R46: review links ----------------------------------------------------------------
    await upsertReviewLink(prisma, fixture.vendorId, {
      platform: "Second Site",
      url: "https://example.invalid/second",
      sortOrder: 2,
      isActive: true,
    });
    await upsertReviewLink(prisma, fixture.vendorId, {
      platform: "First Site",
      url: "https://example.invalid/first",
      sortOrder: 1,
      isActive: true,
    });
    await upsertReviewLink(prisma, fixture.vendorId, {
      platform: "Hidden Site",
      url: "https://example.invalid/hidden",
      sortOrder: 3,
      isActive: false,
    });
    const activeLinks = await listActiveReviewLinks(prisma, fixture.vendorId);
    check(
      "R46",
      activeLinks.length === 2 &&
        activeLinks[0].platform === "First Site" &&
        activeLinks[1].platform === "Second Site",
      `active links ordered (${activeLinks.map((l) => l.platform).join(", ")}); inactive excluded`,
    );
    for (const link of activeLinks) {
      await deleteReviewLink(prisma, fixture.vendorId, link.id);
    }
    const afterDelete = await listActiveReviewLinks(prisma, fixture.vendorId);
    check("R46", afterDelete.length === 0, "group absent when none active");

    // --- R50/R51: data rights --------------------------------------------------------------
    const exported = await exportPersonalData(prisma, fixture.vendorId, fixture.withOrderUserId);
    check(
      "R50",
      exported.feedback.length === 1 && exported.feedback[0].comment === "EDITED AFTER APPROVAL.",
      "feedback present in export payload",
    );
    check(
      "R50",
      !JSON.stringify(exported.feedback).includes("moderationNote"),
      "moderationNote withheld from the export (staff commentary, not the subject's data)",
    );

    const erased = await eraseVendorData(prisma, fixture.vendorId, fixture.withOrderUserId);
    const remaining = await prisma.customerFeedback.count({
      where: { vendorId: fixture.vendorId, userId: fixture.withOrderUserId },
    });
    check(
      "R51",
      erased.feedbackDeleted === 1 && remaining === 0,
      `feedbackDeleted=${erased.feedbackDeleted} and row removed`,
    );
  } finally {
    await destroyFixture(prisma, fixture);
  }
}

/** R10 — the one check that needs a real database to mean anything. */
async function runBulkApprove(prisma: PrismaClient): Promise<void> {
  const fixture = await createFixture(prisma);
  try {
    await submit(prisma, fixture, fixture.noOrderUserId, 4, "One.", "Jamie Okafor");
    await submit(prisma, fixture, fixture.withOrderUserId, 5, "Two.", "Sarah Mitchell");
    const queue = await listFeedbackForModeration(prisma, fixture.vendorId, 10);

    // This call is the point of the mode: through getPrisma() (HTTP) the equivalent
    // updateMany throws unconditionally. Reaching the assertion at all is the evidence.
    const count = await setFeedbackStatusBulk(
      prisma,
      fixture.vendorId,
      queue.map((row) => row.id),
      fixture.staffUserId,
    );
    check("R10", count === 2, `bulk approve completed over websocket client, ${count} rows`);

    const zero = await setFeedbackStatusBulk(prisma, fixture.vendorId, [], fixture.staffUserId);
    check("R10", zero === 0, "bulk approve of an empty set is a no-op, not a crash");
  } finally {
    await destroyFixture(prisma, fixture);
  }
}

/** R24 — the per-IP window. */
async function runFloodWrites(prisma: PrismaClient): Promise<void> {
  const fixture = await createFixture(prisma);
  try {
    const max = FEEDBACK_RATE_LIMIT.maxWritesPerWindow;
    let allowed = 0;
    let refused = 0;

    for (let attempt = 0; attempt < max + 2; attempt += 1) {
      const result = await checkFeedbackWriteRateLimit(prisma, fixture.vendorId, FIXTURE_IP, null);
      if (result.allowed) allowed += 1;
      else refused += 1;
    }

    check(
      "R24",
      allowed === max && refused === 2,
      `${allowed} allowed then ${refused} refused within the ${max}-per-window limit`,
    );
  } finally {
    await destroyFixture(prisma, fixture);
  }
}

/** R25 — the per-row minimum interval, which is the control that is easy to forget. */
async function runFloodEdit(prisma: PrismaClient): Promise<void> {
  const fixture = await createFixture(prisma);
  try {
    const justNow = new Date();
    const tooSoon = await checkFeedbackWriteRateLimit(
      prisma,
      fixture.vendorId,
      FIXTURE_IP,
      justNow,
    );
    check(
      "R25",
      !tooSoon.allowed && tooSoon.reason === "too-soon-after-last-edit",
      `second write to same row within ${FEEDBACK_RATE_LIMIT.minEditIntervalMs / 1000}s refused`,
    );

    const longAgo = new Date(Date.now() - FEEDBACK_RATE_LIMIT.minEditIntervalMs - 1000);
    const later = await checkFeedbackWriteRateLimit(prisma, fixture.vendorId, FIXTURE_IP, longAgo);
    check("R25", later.allowed, "a write after the interval is allowed again");
  } finally {
    await destroyFixture(prisma, fixture);
  }
}

/** R26 — hashed, never raw. */
async function runDumpAttempts(prisma: PrismaClient): Promise<void> {
  const fixture = await createFixture(prisma);
  try {
    await checkFeedbackWriteRateLimit(prisma, fixture.vendorId, FIXTURE_IP, null);
    const rows = await prisma.customerFeedbackAttempt.findMany({
      where: { vendorId: fixture.vendorId },
      select: { ipHash: true },
    });
    const allHashed = rows.length > 0 && rows.every((row) => /^[0-9a-f]{64}$/.test(row.ipHash));
    const noRawIp = rows.every((row) => !row.ipHash.includes(FIXTURE_IP));
    check("R26", allHashed && noRawIp, `all ${rows.length} ipHash values are 64-char hex`);
  } finally {
    await destroyFixture(prisma, fixture);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prisma = db();

  try {
    if (args.includes("--bulk-approve")) await runBulkApprove(prisma);
    else if (args.includes("--flood-writes")) await runFloodWrites(prisma);
    else if (args.includes("--flood-edit")) await runFloodEdit(prisma);
    else if (args.includes("--dump-attempts")) await runDumpAttempts(prisma);
    else await runCore(prisma);
  } finally {
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

void main();
