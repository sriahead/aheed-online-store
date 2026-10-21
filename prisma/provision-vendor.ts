import type { PrismaClient } from "@prisma/client";

/**
 * Vendor-level provisioning: everything a vendor needs to EXIST and render, and nothing about its
 * catalogue (#1197, P11).
 *
 * WHY THIS IS A MODULE RATHER THAN PART OF `prisma/seed.ts`. These four declarations were private
 * to that 2,700-line file, so the only way to provision a vendor was to edit it: add an id
 * constant, add a satellites literal, add a branch to `main()`. That is what made ADR-004
 * decision 7's "a new vendor is data, no code change" untrue in practice. Exported here, they serve
 * both `prisma/seed.ts` (the Aheed and SriMart fixtures, unchanged) and
 * `scripts/provision-vendor.ts` (a third vendor onward, from a manifest file).
 *
 * THE CLIENT IS A PARAMETER, matching `prisma/seed-footer.ts`'s `seedFooterDefaults(prisma, ...)`
 * in this same directory. That is the shape that lets a plain script exercise these without the
 * module-scoped client `seed.ts` closes over — the same reason `lib/repositories/*` takes its client
 * explicitly.
 *
 * DELIBERATELY NOT HERE: `seedCatalogue`, `seedSubcategories`, `seedBrands`, `seedBundles`,
 * `seedPriceTiers` and `seedAttributes` stay in `prisma/seed.ts`. They are fixture-shaped, and the
 * catalogue write path belongs to #1201, which needs row-level idempotency that `seedCatalogue`
 * deliberately does not have (it skips a whole category when that category's slug already exists).
 * Nothing in this file writes a `Category` or a `Product`.
 */

export async function upsertVendorDomain(prisma: PrismaClient, vendorId: string, host: string) {
  const normalized = host.toLowerCase();
  await prisma.vendorDomain.upsert({
    where: { host: normalized },
    create: { vendorId, host: normalized, isCanonical: true },
    update: { vendorId, isCanonical: true },
  });
  console.log(`mapped host ${normalized} -> ${vendorId}`);
}

// ADR-004 slice 4 — per-vendor branding/config/delivery satellites (slice 1 shipped
// them empty). Brand primitives mirror the eight --color-brand-* tokens in
// design-system/tokens/tokens.css; injected as CSS custom properties per request.
export type VendorSatellites = {
  branding: {
    name: string;
    tagline: string;
    logoStorageKey: string | null;
    brandGreenDark: string;
    brandGreen: string;
    brandOrange: string;
    brandRed: string;
    brandCream: string;
    brandGreenTint: string;
    brandOrangeTint: string;
    brandRedTint: string;
  };
  config: {
    localityName: string;
    senderName: string;
    senderEmail: string;
    searchPlaceholder: string;
    // P7.5c+f — per-vendor storefront copy (#239). Nullable in the schema
    // because a null HIDES its element; both seeded vendors set them.
    bannerNote: string | null;
    heroSubtitle: string | null;
    // P3a — delivery rules are vendor data, not constants. Deliberately
    // different per vendor so the cart proves it reads them from the DB.
    deliveryFeePence: number;
    freeDeliveryThresholdPence: number | null;
    minimumOrderPence: number;
    // P5a — loyalty is vendor data too (#135). Aheed runs a scheme; SriMart
    // deliberately does not, which is what proves the per-vendor switch rather
    // than assuming it.
    loyaltyEnabled: boolean;
    pointsPerPoundEarned: number;
    pencePerPointRedeemed: number;
    minRedeemPoints: number;
    tierWindowDays: number;
    pointsExpiryMonths: number | null;
    // #905 — which product labels the staff form offers, and the store description the AI
    // prompts are given. Deliberately opposite per vendor: Aheed (grocer) offers all six,
    // SriMart (electronics) none, which is what proves the gate is per-vendor data.
    showHalalLabel: boolean;
    showFreshLabel: boolean;
    showOrganicLabel: boolean;
    showVegetarianLabel: boolean;
    showGlutenFreeLabel: boolean;
    showHmcCertification: boolean;
    storeDescription: string | null;
  };
  deliveryPrefixes: string[];
  loyaltyTiers: {
    key: string;
    name: string;
    thresholdPence: number;
    multiplierBps: number;
    sortOrder: number;
  }[];
  // P5b — discount codes are vendor data too (#145). Aheed gets one sample code;
  // SriMart deliberately gets none, which is what proves codes are per-vendor
  // rather than a platform-wide list.
  discountCodes: {
    code: string;
    description: string;
    kind: "PERCENTAGE" | "FIXED_AMOUNT";
    value: number;
    minSubtotalPence: number;
    remainingRedemptions: number | null;
    maxPerCustomer: number | null;
  }[];
};

/**
 * Weekly fulfilment slots and express windows (P10, #750).
 *
 * `#401` and `#402` shipped `VendorFulfilmentSlot`, `VendorExpressSchedule` and the four
 * `VendorConfig` flags that gate them with NO writer at all — not a staff page, and not this file.
 * Live staging therefore carried both flags `false` and zero rows of either kind, so the delivery
 * calendar and express collection could never render. `/staff/fulfilment` is the real writer; this
 * gives a freshly seeded environment something to render before anyone opens it.
 *
 * WHY `offerCollection` IS READ RATHER THAN SEEDED. It is not set anywhere in this file — both
 * vendors take Prisma's `false` default here, and the live value is whatever an admin has since
 * chosen in Storefront's delivery rules (Aheed's staging row is `true`, SriMart's is `false`).
 * Seeding collection slots or express windows for a vendor that does not offer collection would
 * write rows nothing can ever render, so the collection half is conditional on the stored value.
 *
 * IDEMPOTENCE. `VendorFulfilmentSlot` and `VendorExpressSchedule` carry no unique constraint, so
 * there is no natural key to upsert on. Each row is matched on the tuple that identifies it in
 * practice — method, day and start time — and created only when absent, so a re-run adds nothing and
 * leaves a capacity an admin has since tuned exactly as they left it.
 */
export async function seedFulfilmentSchedule(prisma: PrismaClient, vendorId: string) {
  const config = await prisma.vendorConfig.findUnique({
    where: { vendorId },
    select: { offerCollection: true },
  });
  const offerCollection = config?.offerCollection ?? false;

  // Weekday mornings and afternoons, plus Saturday morning — a plausible week for a local grocer
  // rather than an exhaustive timetable. 1 = Monday.
  const deliverySlots = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { dayOfWeek, startTime: "09:00", endTime: "12:00", capacity: 10 },
    { dayOfWeek, startTime: "13:00", endTime: "17:00", capacity: 10 },
  ]);
  deliverySlots.push({ dayOfWeek: 6, startTime: "09:00", endTime: "12:00", capacity: 8 });

  for (const slot of deliverySlots) {
    const existing = await prisma.vendorFulfilmentSlot.findFirst({
      where: {
        vendorId,
        method: "DELIVERY",
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.vendorFulfilmentSlot.create({ data: { vendorId, method: "DELIVERY", ...slot } });
    }
  }

  if (offerCollection) {
    const collectionSlots = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: "10:00",
      endTime: "18:00",
      capacity: 20,
    }));

    for (const slot of collectionSlots) {
      const existing = await prisma.vendorFulfilmentSlot.findFirst({
        where: {
          vendorId,
          method: "COLLECTION",
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.vendorFulfilmentSlot.create({
          data: { vendorId, method: "COLLECTION", ...slot },
        });
      }
    }

    // Express runs the same hours the shop is open for collection.
    for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
      const existing = await prisma.vendorExpressSchedule.findFirst({
        where: { vendorId, dayOfWeek, openTime: "10:00" },
        select: { id: true },
      });
      if (!existing) {
        await prisma.vendorExpressSchedule.create({
          data: { vendorId, dayOfWeek, openTime: "10:00", closeTime: "18:00" },
        });
      }
    }
  }

  // Enabling the flags is the point of the exercise: rows alone still render nothing. Express stays
  // off for a vendor without collection, where it could never be offered anyway.
  await prisma.vendorConfig.update({
    where: { vendorId },
    data: {
      offerDeliverySlots: true,
      expressCollectionEnabled: offerCollection,
    },
  });
}

export async function upsertVendorSatellites(
  prisma: PrismaClient,
  vendorId: string,
  s: VendorSatellites,
) {
  await prisma.vendorBranding.upsert({
    where: { vendorId },
    create: { vendorId, ...s.branding },
    update: { ...s.branding },
  });
  await prisma.vendorConfig.upsert({
    where: { vendorId },
    create: { vendorId, ...s.config },
    update: { ...s.config },
  });
  for (const prefix of s.deliveryPrefixes) {
    await prisma.vendorDeliveryArea.upsert({
      where: { vendorId_prefix: { vendorId, prefix } },
      create: { vendorId, prefix },
      update: {},
    });
  }
  await seedFulfilmentSchedule(prisma, vendorId);
  // Upsert by (vendorId, key) so re-running never duplicates a tier and never
  // clobbers a threshold an admin has since tuned away from the seed value...
  // except that it does update, deliberately: the seed is the declared baseline,
  // and a staging re-seed resetting tiers to it is the intended behaviour.
  for (const tier of s.loyaltyTiers) {
    await prisma.vendorLoyaltyTier.upsert({
      where: { vendorId_key: { vendorId, key: tier.key } },
      create: { vendorId, ...tier },
      update: {
        name: tier.name,
        thresholdPence: tier.thresholdPence,
        multiplierBps: tier.multiplierBps,
        sortOrder: tier.sortOrder,
      },
    });
  }
  // Unlike the tiers above, `update` is EMPTY on purpose. A tier's threshold is
  // pure configuration, so resetting it to the declared baseline is the intended
  // re-seed behaviour; a code's `remainingRedemptions` counts DOWN as shoppers
  // use it, so rewriting it would silently refill a partly-claimed code and
  // hand out uses that were already spent.
  for (const code of s.discountCodes) {
    await prisma.discountCode.upsert({
      where: { vendorId_code: { vendorId, code: code.code } },
      create: { vendorId, ...code },
      update: {},
    });
  }
  console.log(`seeded branding/config/delivery/loyalty/discounts for ${vendorId}`);
}
