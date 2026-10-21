import "dotenv/config";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { z } from "zod";
import { seedFooterDefaults, type FooterDefaults } from "../prisma/seed-footer";
import {
  upsertVendorDomain,
  upsertVendorSatellites,
  type VendorSatellites,
} from "../prisma/provision-vendor";
import { assertNotDeployedDatabase } from "./lib/protected-hosts";

/**
 * Provision a vendor from a manifest file (#1197, P11).
 *
 *   npx tsx scripts/provision-vendor.ts prisma/manifests/example.json
 *   npx tsx scripts/provision-vendor.ts <manifest> --validate-only
 *
 * WHAT THIS REPLACES. Before it, a third vendor meant editing `prisma/seed.ts`: a new id constant,
 * a new satellites literal, a new branch in `main()`. ADR-004 decision 7 says a new vendor is data
 * rather than a code change; this is the part of that claim which is now true. The Aheed and SriMart
 * fixtures deliberately stay in `prisma/seed.ts` — they are the multi-tenant test data two vendors'
 * worth of branding checks depend on, and converting them would risk that coverage for no gain.
 *
 * IT WRITES NO CATALOGUE. No `Category`, no `Product`, no `Brand`. A vendor provisioned here has an
 * empty catalogue, which is expected: the import is #1201 and is a separate slice.
 *
 * THE MANIFEST SUPPLIES `id`. It is not generated, so every write below is an upsert on a primary
 * key the manifest owns and a re-run is a no-op. A generated id would make the second run create a
 * second vendor, which is the failure this script exists to prevent.
 *
 * `--validate-only` parses and exits WITHOUT constructing a Prisma client, so it needs no database
 * and no credentials — useful in review, and it is how the example manifest is checked.
 */

// ---- manifest schema ------------------------------------------------------
// `.strict()` everywhere on purpose: a typo in a hand-written manifest key would otherwise be
// silently dropped and the vendor provisioned with a default nobody chose.

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex colour");

const brandingSchema = z
  .object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    logoStorageKey: z.string().min(1).nullable(),
    brandGreenDark: hexColour,
    brandGreen: hexColour,
    brandOrange: hexColour,
    brandRed: hexColour,
    brandCream: hexColour,
    brandGreenTint: hexColour,
    brandOrangeTint: hexColour,
    brandRedTint: hexColour,
  })
  .strict();

const configSchema = z
  .object({
    localityName: z.string().min(1),
    senderName: z.string().min(1),
    senderEmail: z.string().email(),
    searchPlaceholder: z.string().min(1),
    bannerNote: z.string().nullable(),
    heroSubtitle: z.string().nullable(),
    deliveryFeePence: z.number().int().nonnegative(),
    freeDeliveryThresholdPence: z.number().int().nonnegative().nullable(),
    minimumOrderPence: z.number().int().nonnegative(),
    loyaltyEnabled: z.boolean(),
    pointsPerPoundEarned: z.number().int().nonnegative(),
    pencePerPointRedeemed: z.number().int().nonnegative(),
    minRedeemPoints: z.number().int().nonnegative(),
    tierWindowDays: z.number().int().positive(),
    pointsExpiryMonths: z.number().int().positive().nullable(),
    showHalalLabel: z.boolean(),
    showFreshLabel: z.boolean(),
    showOrganicLabel: z.boolean(),
    showVegetarianLabel: z.boolean(),
    showGlutenFreeLabel: z.boolean(),
    showHmcCertification: z.boolean(),
    storeDescription: z.string().nullable(),
  })
  .strict();

/**
 * Footer identity and opening hours. Modelled in full rather than accepted as "some object",
 * because R20 requires an invalid manifest to write NOTHING: a loosely-typed branch here would pass
 * parsing, let the vendor and its satellites be written, and only then fail inside
 * `seedFooterDefaults` — leaving a half-provisioned vendor behind. `satisfies FooterDefaults` on the
 * inferred type is what keeps this in step with `prisma/seed-footer.ts`; if that type changes, this
 * stops compiling.
 */
const footerSchema = z
  .object({
    location: z
      .object({
        addressLine1: z.string().min(1),
        city: z.string().min(1),
        postcode: z.string().min(1),
      })
      .strict(),
    config: z
      .object({
        contactPhone: z.string().min(1),
        contactEmail: z.string().min(1),
        companyNumber: z.string().min(1),
        vatNumber: z.string().min(1),
        openingHoursNote: z.string().min(1),
      })
      .strict(),
    showSecureCheckoutNote: z.boolean(),
    weeklyHours: z.array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          openTime: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:mm"),
          closeTime: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:mm"),
        })
        .strict(),
    ),
    paymentBadges: z.array(z.enum(["VISA", "MASTERCARD", "AMEX", "APPLE_PAY", "GOOGLE_PAY"])),
  })
  .strict();

const manifestSchema = z
  .object({
    id: z.string().uuid(),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "must be lower-case letters, digits and hyphens only"),
    name: z.string().min(1),
    /** The request host this vendor resolves from. Lower-cased on write by upsertVendorDomain. */
    host: z.string().min(1),
    branding: brandingSchema,
    config: configSchema,
    /** Outward-postcode prefixes this vendor delivers to, e.g. ["MK1", "MK2"]. */
    deliveryPrefixes: z.array(z.string().min(1)),
    loyaltyTiers: z.array(
      z
        .object({
          key: z.string().min(1),
          name: z.string().min(1),
          thresholdPence: z.number().int().nonnegative(),
          multiplierBps: z.number().int().positive(),
          sortOrder: z.number().int(),
        })
        .strict(),
    ),
    discountCodes: z.array(
      z
        .object({
          code: z.string().min(1),
          description: z.string().min(1),
          kind: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
          value: z.number().int().positive(),
          minSubtotalPence: z.number().int().nonnegative(),
          remainingRedemptions: z.number().int().nonnegative().nullable(),
          maxPerCustomer: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
    footer: footerSchema,
  })
  .strict();

type Manifest = z.infer<typeof manifestSchema>;

// ---- provisioning ---------------------------------------------------------

export async function provisionVendor(prisma: PrismaClient, manifest: Manifest): Promise<void> {
  await prisma.vendor.upsert({
    where: { id: manifest.id },
    create: { id: manifest.id, slug: manifest.slug, name: manifest.name },
    update: { slug: manifest.slug, name: manifest.name },
  });
  console.log(`vendor ${manifest.slug} (${manifest.id})`);

  // Branding, config, delivery areas, fulfilment slots, loyalty tiers and discount codes — the one
  // implementation, shared with prisma/seed.ts.
  await upsertVendorSatellites(prisma, manifest.id, {
    branding: manifest.branding,
    config: manifest.config,
    deliveryPrefixes: manifest.deliveryPrefixes,
    loyaltyTiers: manifest.loyaltyTiers,
    discountCodes: manifest.discountCodes,
  } satisfies VendorSatellites);

  await seedFooterDefaults(prisma, manifest.id, manifest.footer satisfies FooterDefaults);
  await upsertVendorDomain(prisma, manifest.id, manifest.host);
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes("--validate-only");
  const path = args.find((a) => !a.startsWith("--"));

  if (!path) {
    console.error(
      "usage: npx tsx scripts/provision-vendor.ts <manifest.json> [--validate-only]\n" +
        "       e.g. npx tsx scripts/provision-vendor.ts prisma/manifests/example.json",
    );
    process.exit(1);
  }

  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    console.error(`REFUSING TO RUN: ${path} is not a valid vendor manifest.\n`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(`manifest ${path} is valid (vendor "${parsed.data.slug}")`);

  if (validateOnly) {
    // Deliberately before any client construction, so this path needs no DATABASE_URL at all.
    console.log("--validate-only: nothing was written");
    return;
  }

  // #490 — before the client exists, with no override.
  const { host } = assertNotDeployedDatabase(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
  console.log(`database: ${host ?? "(unparseable)"} — not staging/production\n`);

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({
      connectionString: (process.env.DIRECT_URL ?? process.env.DATABASE_URL) as string,
    }),
  });
  try {
    await provisionVendor(prisma, parsed.data);
    console.log("\nprovisioned. Catalogue is intentionally empty — the import is #1201.");
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run as a script, so importing `provisionVendor` never triggers a run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
