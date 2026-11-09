import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  seedFulfilmentSchedule,
  upsertVendorDomain,
  upsertVendorSatellites,
  type VendorSatellites,
} from "../prisma/provision-vendor";
import { AHEED_FOOTER_DEFAULTS, seedFooterDefaults } from "../prisma/seed-footer";
import {
  AHEED_WHATSAPP_COMMUNITY_DEFAULTS,
  seedWhatsappCommunityDefaults,
} from "../prisma/seed-whatsapp-community";

export const AHEED_VENDOR_ID = "a4ed0000-0000-4000-a000-000000000001";

export const AFC_HOSTS = {
  "afc-staging": "staging.aheedfoodcentre.co.uk",
  "afc-production": "www.aheedfoodcentre.co.uk",
} as const;

export type DedicatedCellEnv = keyof typeof AFC_HOSTS;

export const AFC_SATELLITES: VendorSatellites = {
  branding: {
    name: "Aheed Food Centre",
    tagline: "Fresh halal meat, produce & cultural groceries — delivered across Milton Keynes",
    logoStorageKey: `vendors/${AHEED_VENDOR_ID}/logo.png`,
    brandGreenDark: "#1b5e20",
    brandGreen: "#4caf50",
    brandOrange: "#f57c00",
    brandRed: "#d32f2f",
    brandCream: "#f5f5f0",
    brandGreenTint: "#e8f5e9",
    brandOrangeTint: "#fff3e0",
    brandRedTint: "#ffebee",
  },
  config: {
    localityName: "Milton Keynes",
    senderName: "Aheed Food Centre",
    senderEmail: "orders@aheedfoodcentre.co.uk",
    searchPlaceholder: "Search fresh halal meat, spices, rice, produce...",
    bannerNote: "100% Certified HMC Halal Fresh Meat Cut Daily",
    heroSubtitle:
      "Halal butcher counter, fresh daily produce, authentic spices and Asian groceries",
    deliveryFeePence: 299,
    freeDeliveryThresholdPence: 4000,
    minimumOrderPence: 1500,
    loyaltyEnabled: true,
    pointsPerPoundEarned: 1,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 100,
    tierWindowDays: 30,
    pointsExpiryMonths: 12,
    showHalalLabel: true,
    showFreshLabel: true,
    showOrganicLabel: true,
    showVegetarianLabel: true,
    showGlutenFreeLabel: true,
    showHmcCertification: true,
    storeDescription:
      "South Asian groceries, halal meat and fresh produce. Shoppers often use Hindi, Urdu and Punjabi names and transliterations.",
  },
  deliveryPrefixes: ["MK"],
  loyaltyTiers: [
    { key: "SILVER", name: "Silver", thresholdPence: 5000, multiplierBps: 12500, sortOrder: 1 },
    { key: "GOLD", name: "Gold", thresholdPence: 10000, multiplierBps: 15000, sortOrder: 2 },
  ],
  discountCodes: [
    {
      code: "WELCOME10",
      description: "10% off your first order over £15",
      kind: "PERCENTAGE",
      value: 1000,
      minSubtotalPence: 1500,
      remainingRedemptions: null,
      maxPerCustomer: 1,
    },
  ],
};

const THEMES = [
  {
    name: "Forest Green",
    brandGreenDark: "#1b4332",
    brandGreen: "#40916c",
    brandOrange: "#e07a1f",
    brandRed: "#c1121f",
    brandCream: "#f4f6f0",
    brandGreenTint: "#e6f4ea",
    brandOrangeTint: "#fdebd3",
    brandRedTint: "#fbe4e4",
  },
  {
    name: "Berry Bold",
    brandGreenDark: "#4a148c",
    brandGreen: "#7b1fa2",
    brandOrange: "#ff6f00",
    brandRed: "#b71c1c",
    brandCream: "#f6f0f5",
    brandGreenTint: "#f1e3f4",
    brandOrangeTint: "#ffe4c4",
    brandRedTint: "#fadada",
  },
];

export interface BootstrapArgs {
  env: DedicatedCellEnv;
  dryRun: boolean;
}

export function parseBootstrapArgs(argv: string[]): {
  args?: BootstrapArgs;
  help?: boolean;
  error?: string;
} {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const envIdx = argv.indexOf("--env");
  if (envIdx === -1 || !argv[envIdx + 1]) {
    return { error: "Missing required flag: --env <afc-staging|afc-production>" };
  }

  const env = argv[envIdx + 1] as DedicatedCellEnv;
  if (env !== "afc-staging" && env !== "afc-production") {
    return {
      error: `Invalid --env: expected 'afc-staging' or 'afc-production', received '${env}'`,
    };
  }

  const dryRun = argv.includes("--dry-run");
  return { args: { env, dryRun } };
}

export async function bootstrapDedicatedCell(
  prisma: PrismaClient,
  options: { env: DedicatedCellEnv; dryRun?: boolean },
): Promise<{ vendorId: string; host: string; themesSeeded: number }> {
  const { env, dryRun = false } = options;
  const host = AFC_HOSTS[env];

  // Refuse demo users on production (#1332)
  if (env === "afc-production") {
    const demoUserCount = await prisma.user.count({
      where: {
        email: { endsWith: "@example.com" },
      },
    });
    if (demoUserCount > 0) {
      throw new Error(
        `Production safety violation: target database contains ${demoUserCount} demo user(s). Refusing bootstrap.`,
      );
    }
  }

  if (dryRun) {
    console.log(`[DRY-RUN] Would bootstrap dedicated cell ${env} with host ${host}`);
    return { vendorId: AHEED_VENDOR_ID, host, themesSeeded: THEMES.length };
  }

  // 1. HealthCheck
  const hcCount = await prisma.healthCheck.count();
  if (hcCount === 0) {
    await prisma.healthCheck.create({ data: { label: "afc-dedicated-cell" } });
  }

  // 2. Themes
  for (const theme of THEMES) {
    await prisma.theme.upsert({
      where: { name: theme.name },
      create: theme,
      update: theme,
    });
  }

  // 3. Vendor
  await prisma.vendor.upsert({
    where: { id: AHEED_VENDOR_ID },
    create: {
      id: AHEED_VENDOR_ID,
      slug: "aheed-food-centre",
      name: "Aheed Food Centre",
    },
    update: {
      slug: "aheed-food-centre",
      name: "Aheed Food Centre",
    },
  });

  // 4. VendorDomain
  await upsertVendorDomain(prisma, AHEED_VENDOR_ID, host);

  // 5. VendorSatellites
  await upsertVendorSatellites(prisma, AHEED_VENDOR_ID, AFC_SATELLITES);

  // 6. Fulfilment Schedule
  await seedFulfilmentSchedule(prisma, AHEED_VENDOR_ID);

  // 7. Footers & WhatsApp Community
  await seedFooterDefaults(prisma, AHEED_VENDOR_ID, AHEED_FOOTER_DEFAULTS);
  await seedWhatsappCommunityDefaults(prisma, AHEED_VENDOR_ID, AHEED_WHATSAPP_COMMUNITY_DEFAULTS);

  return { vendorId: AHEED_VENDOR_ID, host, themesSeeded: THEMES.length };
}

async function main() {
  const parsed = parseBootstrapArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(
      "Usage: npx tsx scripts/bootstrap-dedicated-cell.ts --env <afc-staging|afc-production> [--dry-run]",
    );
    console.log("\nOptions:");
    console.log("  --env <name>   Target environment ('afc-staging' or 'afc-production')");
    console.log("  --dry-run      Validate inputs without writing to the database");
    console.log("  --help, -h     Show this help message");
    process.exit(0);
  }

  if (parsed.error || !parsed.args) {
    console.error(`Error: ${parsed.error}`);
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DIRECT_URL or DATABASE_URL must be provided.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    const result = await bootstrapDedicatedCell(prisma, parsed.args);
    console.log(`Successfully bootstrapped dedicated cell: ${result.vendorId} -> ${result.host}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
