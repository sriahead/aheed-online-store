import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import { fetchVendorProfile } from "@/lib/repositories/vendor";
import {
  getAvailableSlotsForDate,
  getFulfilmentSettingsForVendor,
  updateFulfilmentSettingsForVendor,
} from "@/lib/repositories/fulfilment-slots";
import { addCalendarDays, calendarDayInZone, calendarDayToUtcMidnight } from "@/lib/local-datetime";

/**
 * Live verification for #363 and #811 — requirements.md R2, R7, R16, R21, R25.
 *
 * WHY A SCRIPT AND NOT A TEST. Every claim here is about what real Postgres did, or about what
 * the picker and the server agree on across two different process timezones. The #811 claim in
 * particular cannot be made with a double: the whole defect was that a stub, a unit test and
 * `next dev` on a UK laptop all agreed with the broken code, because in each of them the two
 * wrong zone assumptions cancelled. Only a UTC runtime reading a day a UTC+1 client produced
 * shows it.
 *
 * Possible at all because the repository layer takes its client and `vendorId` as explicit
 * arguments and reads no request context. Precedent: #116's `verify-saved-lists.ts`, #696's
 * `verify-cancel.ts`.
 *
 * GUARDED. The `--settings-roundtrip` and `--backfill-check` modes write, so the script refuses
 * to run against staging or production by comparing Neon ENDPOINTS, not file names
 * (`lib/db-target-guard.ts`). Every row it creates is removed again, including on failure, and
 * the vendor's real timezone is restored.
 *
 *   npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --profile
 *   npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --settings-roundtrip
 *   npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --slots
 *   npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --backfill-check
 *   TZ=Europe/Berlin npx tsx .../verify-vendor-timezone.ts --prove-http
 */

/** Read a connection string out of a gitignored secrets file without importing it. */
function readVar(path: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return undefined; // absent in CI; the guard treats that as "no constraint from this file"
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

const TAG = "P363VERIFY";
let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}: ${detail}`);
  if (!ok) failures += 1;
}

/**
 * The instant a pre-#811 browser would have submitted for `day`, had it been in `offsetHours`.
 *
 * Reproduces the defect's input exactly: local midnight, serialised as an instant.
 */
function legacyBrowserInstant(day: string, offsetHours: number): string {
  const utcMidnight = calendarDayToUtcMidnight(day)!;
  return new Date(utcMidnight.getTime() - offsetHours * 3_600_000).toISOString();
}

async function main() {
  const modes = ["profile", "settings-roundtrip", "slots", "backfill-check", "prove-http"];
  const mode = modes.find((m) => process.argv.includes(`--${m}`)) ?? "profile";

  const verdict = checkDestructiveTarget(process.env.DIRECT_URL, [
    { label: "the STAGING database", url: readVar("secrets/staging.vars", "DIRECT_URL") },
    {
      label: "the STAGING database (pooled)",
      url: readVar("secrets/staging.vars", "DATABASE_URL"),
    },
    { label: "the PRODUCTION database", url: readVar("secrets/production.vars", "DIRECT_URL") },
    {
      label: "the PRODUCTION database (pooled)",
      url: readVar("secrets/production.vars", "DATABASE_URL"),
    },
  ]);
  if (!verdict.allowed) {
    console.error(`REFUSED: ${verdict.reason}`);
    process.exit(1);
  }
  /*
   * A `TZ` that did not take effect makes this whole script vacuous, so it is reported loudly
   * rather than left to be inferred from a wall of PASS lines.
   *
   * Windows Node honours `TZ=UTC` but SILENTLY IGNORES an IANA zone name, falling back to the
   * system zone — so `TZ=Pacific/Auckland npx tsx …` on a UK Windows box runs entirely in
   * Europe/London while looking like it proved something. On the Linux CI runner every zone name
   * works. Measured on this repo's own dev machine, 2026-09-19.
   */
  const requested = process.env.TZ;
  const effective = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The OFFSET, not the zone name: `TZ=PST8PDT` legitimately resolves as `America/Los_Angeles`,
  // so comparing names reports a change that happened as if it had not.
  const offsetMinutes = -new Date().getTimezoneOffset();
  console.log(`target endpoint: ${verdict.endpoint}\nmode: ${mode}`);
  console.log(
    `AMBIENT ZONE: requested=${requested ?? "(unset)"} effective=${effective} ` +
      `offset=${offsetMinutes >= 0 ? "+" : ""}${offsetMinutes}min`,
  );
  console.log(
    "  Two runs only prove zone-independence if this OFFSET differs between them.\n" +
      "  On Windows a TZ value containing a slash never reaches the process at all — measured\n" +
      "  2026-09-19, `TZ=Pacific/Auckland` silently ran in the system zone. Slash-free values\n" +
      "  (`UTC`, `PST8PDT`, `EST5EDT`) do work there; on Linux/CI any IANA name works.\n",
  );

  // #382 — a singular `update` is fine over HTTP; the WebSocket client is here only for the
  // backfill check's nested order write.
  const prisma = new PrismaClient({
    adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, {}),
  });
  const prismaWs = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const vendors = await prisma.vendor.findMany({ select: { id: true, slug: true } });
    if (vendors.length === 0) throw new Error("no vendor in this database — run the seed first");

    if (mode === "profile") {
      // R7 — every vendor resolves a usable zone, configured or defaulted.
      for (const v of vendors) {
        const profile = await fetchVendorProfile(prisma, v.id);
        let usable = true;
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: profile.timezone });
        } catch {
          usable = false;
        }
        check(`${v.slug} resolves a zone`, profile.timezone !== "", profile.timezone);
        check(`${v.slug}'s zone is usable by Intl`, usable, profile.timezone);
      }
    }

    if (mode === "settings-roundtrip") {
      // R16 — the column really round-trips through the repository, not just through a stub.
      const v = vendors[0];
      const before = await getFulfilmentSettingsForVendor(prisma, v.id);
      console.log(`  ${v.slug} currently: ${before.timezone}`);

      try {
        await updateFulfilmentSettingsForVendor(prisma, v.id, {
          offerDeliverySlots: before.offerDeliverySlots,
          expressCollectionEnabled: before.expressCollectionEnabled,
          bookingWindowDays: before.bookingWindowDays,
          slotHoldDurationMinutes: before.slotHoldDurationMinutes,
          timezone: "Asia/Karachi",
        });
        const after = await getFulfilmentSettingsForVendor(prisma, v.id);
        check("write then read", after.timezone === "Asia/Karachi", after.timezone);

        // R17's premise: a stored zone outside the fallback list must still survive a round trip.
        await updateFulfilmentSettingsForVendor(prisma, v.id, {
          offerDeliverySlots: before.offerDeliverySlots,
          expressCollectionEnabled: before.expressCollectionEnabled,
          bookingWindowDays: before.bookingWindowDays,
          slotHoldDurationMinutes: before.slotHoldDurationMinutes,
          timezone: "Indian/Kerguelen",
        });
        const obscure = await getFulfilmentSettingsForVendor(prisma, v.id);
        check(
          "an obscure zone survives",
          obscure.timezone === "Indian/Kerguelen",
          obscure.timezone,
        );
      } finally {
        await updateFulfilmentSettingsForVendor(prisma, v.id, {
          offerDeliverySlots: before.offerDeliverySlots,
          expressCollectionEnabled: before.expressCollectionEnabled,
          bookingWindowDays: before.bookingWindowDays,
          slotHoldDurationMinutes: before.slotHoldDurationMinutes,
          timezone: before.timezone,
        });
        const restored = await getFulfilmentSettingsForVendor(prisma, v.id);
        check("restored", restored.timezone === before.timezone, restored.timezone);
      }
    }

    if (mode === "slots" || mode === "prove-http") {
      /*
       * R21/R25 — the calendar day the picker would submit, and the slots the server returns for
       * it.
       *
       * Run this under two different `TZ` values. The submitted day must be IDENTICAL in both,
       * and the slots must belong to that day's weekday. Before #811 the day was derived from the
       * process's own clock, so the two runs disagreed — which is the whole defect.
       */
      const v = vendors[0];
      const profile = await fetchVendorProfile(prisma, v.id);
      const today = calendarDayInZone(new Date(), profile.timezone);
      console.log(`  vendor ${v.slug}, zone ${profile.timezone}`);
      console.log(`  SUBMITTED DAY: ${today}   (must match across TZ runs)`);

      for (let i = 0; i < 7; i++) {
        const day = addCalendarDays(today, i);
        const expectedWeekday = calendarDayToUtcMidnight(day)!.getUTCDay();
        const slots = await getAvailableSlotsForDate(prisma, v.id, "DELIVERY", day);
        const rows = await prisma.vendorFulfilmentSlot.findMany({
          where: { vendorId: v.id, method: "DELIVERY", dayOfWeek: expectedWeekday },
          select: { id: true },
        });
        const same =
          slots.length === rows.length && slots.every((s) => rows.some((r) => r.id === s.id));
        check(
          `${day} (weekday ${expectedWeekday})`,
          same,
          `${slots.length} slot(s), matches that weekday's rows`,
        );
      }

      // The defect itself, stated as data: what the OLD client would have sent for today.
      const legacy = legacyBrowserInstant(today, 1);
      const legacyWeekday = new Date(legacy).getUTCDay();
      const trueWeekday = calendarDayToUtcMidnight(today)!.getUTCDay();
      console.log(
        `\n  #811 reference: a UTC+1 browser used to submit ${legacy} for ${today} —` +
          ` UTC weekday ${legacyWeekday} vs the real ${trueWeekday}` +
          `${legacyWeekday === trueWeekday ? " (no skew today)" : " (SKEWED — this is the bug)"}`,
      );
      check(
        "a bare instant is now refused, not silently misread",
        (await getAvailableSlotsForDate(prisma, v.id, "DELIVERY", legacy)).length === 0,
        "returns no slots for an ISO instant",
      );
      check(
        "a malformed day returns no slots",
        (await getAvailableSlotsForDate(prisma, v.id, "DELIVERY", "not-a-day")).length === 0,
        "returns []",
      );
    }

    if (mode === "backfill-check") {
      /*
       * R2 — the migration's normalising statement, proven on rows built to be wrong.
       *
       * Two orders: one written the way a BST browser used to (23:00Z the previous day) and one
       * already correct. After the statement the first must move and the second must not, and a
       * second run must move neither.
       */
      const v = vendors[0];
      const skewed = new Date("2026-09-18T23:00:00.000Z");
      const correct = new Date("2026-01-15T00:00:00.000Z");
      const made: string[] = [];

      const addresses: string[] = [];

      // Nested create, so this goes through the WEBSOCKET client: a singular `create` carrying
      // nested child writes opens an implicit transaction and crashes over the HTTP adapter
      // (#116/#382 — the rule is "does this open a transaction", not which method is named).
      const mkOrder = async (fulfilmentDate: Date, n: number) => {
        const o = await prismaWs.order.create({
          data: {
            vendor: { connect: { id: v.id } },
            orderNumber: `${TAG}-${Date.now()}-${n}`,
            guestEmail: `${TAG.toLowerCase()}@example.invalid`,
            status: "PENDING_PAYMENT",
            subtotalPence: 100,
            deliveryFeePence: 0,
            totalPence: 100,
            currency: "GBP",
            fulfilmentDate,
            address: {
              create: {
                vendor: { connect: { id: v.id } },
                recipientName: `${TAG} shopper`,
                phone: "00000000000",
                line1: "1 Verification Way",
                city: "Milton Keynes",
                postcode: "MK10 0AA",
              },
            },
          },
          select: { id: true, addressId: true },
        });
        made.push(o.id);
        addresses.push(o.addressId);
        return o.id;
      };

      try {
        const skewedId = await mkOrder(skewed, 1);
        const correctId = await mkOrder(correct, 2);

        const normalise = async () =>
          prisma.$executeRawUnsafe(`
            UPDATE "Order"
            SET "fulfilmentDate" =
                  date_trunc('day', ("fulfilmentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London')
            WHERE "fulfilmentDate" IS NOT NULL
              AND "fulfilmentDate" <>
                  date_trunc('day', ("fulfilmentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London')
          `);

        const first = await normalise();
        const read = async (id: string) =>
          (await prisma.order.findUnique({ where: { id }, select: { fulfilmentDate: true } }))
            ?.fulfilmentDate;

        check(
          "the BST-skewed row moved to its real day",
          (await read(skewedId))?.toISOString() === "2026-09-19T00:00:00.000Z",
          String((await read(skewedId))?.toISOString()),
        );
        check(
          "the already-correct row is untouched",
          (await read(correctId))?.toISOString() === "2026-01-15T00:00:00.000Z",
          String((await read(correctId))?.toISOString()),
        );
        console.log(`  first run updated ${first} row(s)`);

        const second = await normalise();
        check("idempotent", second === 0, `second run updated ${second} row(s)`);
      } finally {
        if (made.length > 0) {
          await prisma.order.deleteMany({ where: { id: { in: made } } });
          await prisma.address.deleteMany({ where: { id: { in: addresses } } });
          console.log(`  cleaned up ${made.length} order(s) and ${addresses.length} address(es)`);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
    await prismaWs.$disconnect();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
