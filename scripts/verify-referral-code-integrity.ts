import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseEnvFile } from "./lib/env-file";
import { getOrCreateReferralCode } from "@/lib/repositories/referral-codes";
import { previewCode } from "@/lib/repositories/discounts";
import {
  hashIp,
  isDiscountCodeCheckThrottled,
  MAX_UNKNOWN_DISCOUNT_CODES,
  recordUnknownDiscountCode,
} from "@/lib/repositories/discount-code-throttle";
import { MIN_REFERRAL_ORDER_PENCE, REFERRAL_DISCOUNT_PENCE } from "@/lib/referrals";

/**
 * #991 / #987 / #988 validation harness — proves what
 * `specs/2026-10-06-p991-987-988-referral-code-integrity/requirements.md` asserts against REAL
 * Postgres.
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its own clients from the bare `@prisma/client`
 * with `@prisma/adapter-neon`, like `scripts/verify-data-rights.ts`, and never `lib/db.ts`'s
 * `@prisma/client/wasm`, which Node cannot load.
 *
 * Usage: `npx tsx scripts/verify-referral-code-integrity.ts <mode> [--env-file <path>]`
 *
 * Modes: `count` (R1), `backfill` (R4), `concurrent` (R9), `erasure` (R9a), `redeem` (R16),
 * `throttle` (R19), or `all` (every mode except `count`).
 *
 * `count` is READ-ONLY and is the only mode that accepts `--env-file`: it measures the `REF-` rows
 * on staging or production before the migration reaches them. Every other mode writes fixtures to
 * `.env`'s database (which must be DEV — compare it against `secrets/*.vars` first) and deletes
 * every row it created before exiting, including after a failed check.
 */

const REF_DESCRIPTION_PREFIX = "Referral from user ";
const FIXTURE_TAG = "p991-fixture";
const MIGRATION_SUFFIX = "_p987_988_referral_owner_code_throttle";

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at > 0 && at + 1 < process.argv.length ? process.argv[at + 1] : null;
}

function databaseUrl(): string {
  const envFile = argValue("--env-file");
  const url = envFile ? parseEnvFile(envFile).DATABASE_URL : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      `DATABASE_URL is not set${envFile ? ` in ${envFile}` : " — check .env against secrets/*.vars"}`,
    );
  }
  return url;
}

async function wsClient(url: string): Promise<PrismaClient> {
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
}

async function httpClient(url: string): Promise<PrismaClient> {
  const { PrismaNeonHttp } = await import("@prisma/adapter-neon");
  return new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
}

/** The repositories are typed against lib/db's wasm client; the Node client is the same API. */
const asRepoDb = (prisma: PrismaClient) => prisma as never;

/** R1 — read-only. Prints the counts `build-notes.md` records; asserts nothing. */
async function modeCount(): Promise<void> {
  const url = databaseUrl();
  console.log(`  database host: ${new URL(url).hostname}`);
  const prisma = await wsClient(url);
  try {
    const rows = await prisma.discountCode.findMany({
      where: { code: { startsWith: "REF-" } },
      select: { description: true },
    });
    const describedIds = rows
      .map((r) => r.description ?? "")
      .filter((d) => d.startsWith(REF_DESCRIPTION_PREFIX))
      .map((d) => d.slice(REF_DESCRIPTION_PREFIX.length).trim());
    const existing =
      describedIds.length === 0
        ? 0
        : await prisma.user.count({ where: { id: { in: describedIds } } });
    console.log(`  REF- rows: ${rows.length}`);
    console.log(`  REF- rows whose description names an existing user: ${existing}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function firstVendors(prisma: PrismaClient): Promise<{ a: string; b: string | null }> {
  const rows = await prisma.vendor.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 2,
  });
  if (rows.length === 0) throw new Error("no active vendors");
  return { a: rows[0].id, b: rows[1]?.id ?? null };
}

const createdUsers: string[] = [];

async function fixtureUser(prisma: PrismaClient, label: string): Promise<string> {
  const id = `${FIXTURE_TAG}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.user.create({
    data: { id, name: "Referral Fixture", email: `${id}@example.invalid`, emailVerified: true },
  });
  createdUsers.push(id);
  return id;
}

/** Deletes every code owned by a fixture user, then the users. Safe to run after a failure. */
async function cleanupUsers(prisma: PrismaClient): Promise<void> {
  if (createdUsers.length === 0) return;
  await prisma.discountCode.deleteMany({ where: { referrerUserId: { in: createdUsers } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  createdUsers.length = 0;
}

/** The statements between `-- BACKFILL BEGIN` and `-- BACKFILL END` in the migration itself. */
function backfillSql(): string {
  const dir = readdirSync(join("prisma", "migrations")).find((d) => d.endsWith(MIGRATION_SUFFIX));
  if (!dir) throw new Error(`no migration directory ending ${MIGRATION_SUFFIX}`);
  const sql = readFileSync(join("prisma", "migrations", dir, "migration.sql"), "utf8");
  const match = /-- BACKFILL BEGIN\r?\n([\s\S]*?)-- BACKFILL END/.exec(sql);
  if (!match) throw new Error(`${dir}/migration.sql has no BACKFILL BEGIN/END block`);
  return match[1];
}

class Rollback extends Error {}

/** R4 — the migration's own backfill, against fixture rows, inside a transaction that rolls back. */
async function modeBackfill(prisma: PrismaClient): Promise<void> {
  const sql = backfillSql();
  const { a: vendorId } = await firstVendors(prisma);
  const stamp = `${Date.now()}`;
  const userId = `${FIXTURE_TAG}-backfill-${stamp}`;
  const missingUser = `${FIXTURE_TAG}-missing-${stamp}`;
  const suffix = stamp.slice(-6);
  const codes = { a: `REF-BFA${suffix}`, b: `REF-BFB${suffix}`, c: `BFC${suffix}` };
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.user.create({
          data: { id: userId, name: "Backfill", email: `${userId}@example.invalid` },
        });
        const base = { vendorId, kind: "FIXED_AMOUNT" as const, value: REFERRAL_DISCOUNT_PENCE };
        await tx.discountCode.create({
          data: { ...base, code: codes.a, description: `${REF_DESCRIPTION_PREFIX}${userId}` },
        });
        await tx.discountCode.create({
          data: { ...base, code: codes.b, description: `${REF_DESCRIPTION_PREFIX}${missingUser}` },
        });
        await tx.discountCode.create({
          data: { ...base, code: codes.c, description: `${REF_DESCRIPTION_PREFIX}${userId}` },
        });

        await tx.$executeRawUnsafe(sql);

        const rows = await tx.discountCode.findMany({
          where: { vendorId, code: { in: Object.values(codes) } },
          select: { code: true, referrerUserId: true, description: true },
        });
        const row = (code: string) => rows.find((r) => r.code === code);
        const ra = row(codes.a);
        check(
          "R4(a) REF- row naming an existing user gets the owner and the neutral description",
          ra?.referrerUserId === userId && ra.description === "Customer referral code",
          JSON.stringify(ra),
        );
        const rb = row(codes.b);
        check(
          "R4(b) REF- row naming a missing user is unchanged",
          rb?.referrerUserId === null &&
            rb.description === `${REF_DESCRIPTION_PREFIX}${missingUser}`,
          JSON.stringify(rb),
        );
        const rc = row(codes.c);
        check(
          "R4(c) non-REF row naming an existing user is unchanged",
          rc?.referrerUserId === null && rc.description === `${REF_DESCRIPTION_PREFIX}${userId}`,
          JSON.stringify(rc),
        );
        check("R4 codes are never changed", rows.length === 3, `found ${rows.length} of 3`);
        throw new Rollback();
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  const leaked = await prisma.discountCode.count({ where: { code: { in: Object.values(codes) } } });
  check("R4 the transaction rolled back (no fixture rows remain)", leaked === 0);
}

/** R9 — two concurrent get-or-creates for one fresh user leave one row, on BOTH adapters. */
async function modeConcurrent(prisma: PrismaClient): Promise<void> {
  const { a: vendorId } = await firstVendors(prisma);
  const url = databaseUrl();
  const adapters: [string, (url: string) => Promise<PrismaClient>][] = [
    ["HTTP adapter (PrismaNeonHttp)", httpClient],
    ["WebSocket adapter (PrismaNeon)", wsClient],
  ];
  for (const [label, makeClient] of adapters) {
    const client = await makeClient(url);
    try {
      const userId = await fixtureUser(prisma, "concurrent");
      const [first, second] = await Promise.all([
        getOrCreateReferralCode(asRepoDb(client), vendorId, userId),
        getOrCreateReferralCode(asRepoDb(client), vendorId, userId),
      ]);
      const rows = await prisma.discountCode.findMany({
        where: { vendorId, referrerUserId: userId },
        select: { code: true },
      });
      check(
        `R9 ${label}: one row, and both calls returned its code`,
        rows.length === 1 && first === rows[0].code && second === rows[0].code,
        `rows=${rows.length} first=${first} second=${second}`,
      );
    } finally {
      await client.$disconnect();
    }
  }
}

/** R9a — erasing the owner keeps the code (SetNull), unchanged and ownerless. */
async function modeErasure(prisma: PrismaClient): Promise<void> {
  const { a: vendorId } = await firstVendors(prisma);
  const userId = await fixtureUser(prisma, "erasure");
  const code = await getOrCreateReferralCode(asRepoDb(prisma), vendorId, userId);
  await prisma.user.delete({ where: { id: userId } });
  createdUsers.splice(createdUsers.indexOf(userId), 1);
  try {
    const row = await prisma.discountCode.findUnique({
      where: { vendorId_code: { vendorId, code } },
      select: { code: true, referrerUserId: true },
    });
    check(
      "R9a code row survives its owner's deletion, ownerless, with the same code",
      row !== null && row.referrerUserId === null && row.code === code,
      JSON.stringify(row),
    );
  } finally {
    await prisma.discountCode.deleteMany({ where: { vendorId, code } });
  }
}

/** R16 — a created code redeems for another shopper (and is refused for its owner). */
async function modeRedeem(prisma: PrismaClient): Promise<void> {
  const { a: vendorId } = await firstVendors(prisma);
  const owner = await fixtureUser(prisma, "owner");
  const friend = await fixtureUser(prisma, "friend");
  const code = await getOrCreateReferralCode(asRepoDb(prisma), vendorId, owner);
  const input = { code, subtotalPence: MIN_REFERRAL_ORDER_PENCE, deliveryFeePence: 0 };

  const forFriend = await previewCode(asRepoDb(prisma), vendorId, { ...input, userId: friend });
  check(
    "R16 another signed-in shopper's preview applies the referral discount",
    forFriend.ok && forFriend.discountPence === REFERRAL_DISCOUNT_PENCE,
    JSON.stringify(forFriend),
  );
  const forOwner = await previewCode(asRepoDb(prisma), vendorId, { ...input, userId: owner });
  check(
    "R13 (live) the owner's own preview is refused as OWN_REFERRAL_CODE",
    !forOwner.ok && forOwner.reason === "OWN_REFERRAL_CODE",
    JSON.stringify(forOwner),
  );
}

/** R19 — 10 unknown codes throttle that vendor and IP only. */
async function modeThrottle(prisma: PrismaClient): Promise<void> {
  const { a, b } = await firstVendors(prisma);
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
  const otherIp = `${ip}-other`;
  const ipHashes = [await hashIp(ip), await hashIp(otherIp)];
  try {
    for (let i = 0; i < MAX_UNKNOWN_DISCOUNT_CODES - 1; i++) {
      await recordUnknownDiscountCode(asRepoDb(prisma), a, ip);
    }
    check(
      "R19 9 unknown codes: not yet throttled",
      !(await isDiscountCodeCheckThrottled(asRepoDb(prisma), a, ip)),
    );
    await recordUnknownDiscountCode(asRepoDb(prisma), a, ip);
    check(
      "R19 10 unknown codes: same vendor and IP throttled",
      await isDiscountCodeCheckThrottled(asRepoDb(prisma), a, ip),
    );
    if (b) {
      check(
        "R19 same IP on a second vendor: not throttled",
        !(await isDiscountCodeCheckThrottled(asRepoDb(prisma), b, ip)),
      );
    } else {
      check("R19 a second active vendor exists for the isolation check", false, "only one vendor");
    }
    check(
      "R19 a different IP on the same vendor: not throttled",
      !(await isDiscountCodeCheckThrottled(asRepoDb(prisma), a, otherIp)),
    );
    const stored = await prisma.discountCodeAttempt.findMany({
      where: { ipHash: { in: ipHashes } },
      select: { ipHash: true },
    });
    check(
      "R19 only the SHA-256 hash is stored, never the raw IP",
      stored.length === MAX_UNKNOWN_DISCOUNT_CODES && stored.every((r) => r.ipHash === ipHashes[0]),
    );
  } finally {
    await prisma.discountCodeAttempt.deleteMany({ where: { ipHash: { in: ipHashes } } });
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "count") {
    console.log("\ncount");
    await modeCount();
    process.exit(0);
  }
  if (argValue("--env-file")) throw new Error("only the read-only `count` mode accepts --env-file");

  const modes: Record<string, (p: PrismaClient) => Promise<void>> = {
    backfill: modeBackfill,
    concurrent: modeConcurrent,
    erasure: modeErasure,
    redeem: modeRedeem,
    throttle: modeThrottle,
  };
  const selected = mode === "all" ? Object.keys(modes) : [mode ?? ""];
  for (const name of selected) {
    if (!modes[name]) {
      throw new Error(
        `unknown mode "${name}" — one of count, all, ${Object.keys(modes).join(", ")}`,
      );
    }
  }

  const prisma = await wsClient(databaseUrl());
  try {
    for (const name of selected) {
      console.log(`\n${name}`);
      try {
        await modes[name](prisma);
      } finally {
        await cleanupUsers(prisma);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
