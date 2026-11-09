import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function getVal(path: string, k: string) {
  const c = readFileSync(path, "utf8");
  const m = c.match(new RegExp(`^${k}=(.*)`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const isStaging = process.argv.includes("--staging");

const src = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: isStaging
      ? getVal("secrets/afc-production.vars", "AFC_DIRECT_URL")
      : getVal("secrets/merqify-production.vars", "DIRECT_URL"),
  }),
});

const dst = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: isStaging
      ? getVal("secrets/afc-staging.vars", "AFC_DIRECT_URL")
      : getVal("secrets/afc-production.vars", "AFC_DIRECT_URL"),
  }),
});

const CANONICAL_HOST = isStaging ? "staging.aheedfoodcentre.co.uk" : "www.aheedfoodcentre.co.uk";
const AHEED_ID = "a4ed0000-0000-4000-a000-000000000001";

async function chunkedCreateMany<T>(
  items: T[],
  chunkSize: number,
  fn: (chunk: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const res = await fn(chunk);
    total += res.count;
  }
  return total;
}

async function main() {
  console.log(`Starting Aheed Food Centre migration for ${CANONICAL_HOST}...`);

  // 1. Themes
  const themes = await src.theme.findMany();
  await dst.theme.createMany({ data: themes, skipDuplicates: true });
  console.log(`1. Themes migrated (${themes.length})`);

  // 2. Vendor
  const vendor = await src.vendor.findUniqueOrThrow({ where: { id: AHEED_ID } });
  await dst.vendor.upsert({
    where: { id: AHEED_ID },
    update: { name: vendor.name, slug: vendor.slug, status: vendor.status },
    create: vendor,
  });
  console.log(`2. Vendor upserted: ${vendor.name}`);

  // 3. VendorDomain
  await dst.vendorDomain.deleteMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorDomain.create({
    data: {
      vendorId: AHEED_ID,
      host: CANONICAL_HOST,
      isCanonical: true,
    },
  });
  console.log(`3. VendorDomain configured: ${CANONICAL_HOST} (canonical)`);

  // 4. VendorThemes
  const vendorThemes = await src.vendorTheme.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorTheme.createMany({ data: vendorThemes, skipDuplicates: true });
  console.log(`4. VendorThemes migrated (${vendorThemes.length})`);

  // 5. VendorBranding
  const branding = await src.vendorBranding.findUniqueOrThrow({ where: { vendorId: AHEED_ID } });
  const { id: _bId, ...brandingRest } = branding;
  await dst.vendorBranding.upsert({
    where: { vendorId: AHEED_ID },
    update: brandingRest,
    create: branding,
  });
  console.log(
    `5. VendorBranding updated (logo: ${branding.logoStorageKey}, mark: ${branding.markStorageKey})`,
  );

  // 6. VendorConfig
  const config = await src.vendorConfig.findUniqueOrThrow({ where: { vendorId: AHEED_ID } });
  const { id: _cId, ...configRest } = config;
  await dst.vendorConfig.upsert({
    where: { vendorId: AHEED_ID },
    update: configRest,
    create: config,
  });
  console.log(`6. VendorConfig updated (headline: ${config.bannerHeadline})`);

  // 7. VendorLocation
  const location = await src.vendorLocation.findUnique({ where: { vendorId: AHEED_ID } });
  if (location) {
    const { id: _lId, ...locRest } = location;
    await dst.vendorLocation.upsert({
      where: { vendorId: AHEED_ID },
      update: locRest,
      create: location,
    });
    console.log(`7. VendorLocation updated (${location.addressLine1}, ${location.postcode})`);
  }

  // 8. VendorDeliveryArea
  const areas = await src.vendorDeliveryArea.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorDeliveryArea.deleteMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorDeliveryArea.createMany({ data: areas, skipDuplicates: true });
  console.log(`8. VendorDeliveryAreas migrated (${areas.length})`);

  // 9. VendorWeeklyHours
  const hours = await src.vendorWeeklyHours.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorWeeklyHours.deleteMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorWeeklyHours.createMany({ data: hours, skipDuplicates: true });
  console.log(`9. VendorWeeklyHours migrated (${hours.length})`);

  // 10. VendorPaymentBadge
  const badges = await src.vendorPaymentBadge.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorPaymentBadge.deleteMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorPaymentBadge.createMany({ data: badges, skipDuplicates: true });
  console.log(`10. VendorPaymentBadges migrated (${badges.length})`);

  // 11. VendorFulfilmentSlot
  const slots = await src.vendorFulfilmentSlot.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorFulfilmentSlot.createMany({ data: slots, skipDuplicates: true });
  console.log(`11. VendorFulfilmentSlots migrated (${slots.length})`);

  // 12. VendorInboundAddress
  const inbound = await src.vendorInboundAddress.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorInboundAddress.createMany({ data: inbound, skipDuplicates: true });
  console.log(`12. VendorInboundAddresses migrated (${inbound.length})`);

  // 13. VendorLoyaltyTier
  const tiers = await src.vendorLoyaltyTier.findMany({ where: { vendorId: AHEED_ID } });
  await dst.vendorLoyaltyTier.createMany({ data: tiers, skipDuplicates: true });
  console.log(`13. VendorLoyaltyTiers migrated (${tiers.length})`);

  // 14. Brands
  const brands = await src.brand.findMany();
  await dst.brand.createMany({ data: brands, skipDuplicates: true });
  console.log(`14. Brands migrated (${brands.length})`);

  // 15. Categories (exclude SriMart sri-* categories)
  const allCats = await src.category.findMany();
  const aheedCats = allCats.filter((c) => !c.slug.startsWith("sri-"));
  const rootCats = aheedCats.filter((c) => !c.parentId);
  const childCats = aheedCats.filter((c) => c.parentId);
  await dst.category.createMany({ data: rootCats, skipDuplicates: true });
  await dst.category.createMany({ data: childCats, skipDuplicates: true });
  // Also update imageKey on existing categories if any
  for (const c of aheedCats) {
    await dst.category.update({
      where: { id: c.id },
      data: { imageKey: c.imageKey, name: c.name, sortOrder: c.sortOrder },
    });
  }
  console.log(`15. Categories migrated (${rootCats.length} root, ${childCats.length} children)`);

  // 16. CategoryAssets for Aheed
  const aheedCatIds = new Set(aheedCats.map((c) => c.id));
  const catAssets = (await src.categoryAsset.findMany({ where: { vendorId: AHEED_ID } })).filter(
    (a) => !a.categoryId || aheedCatIds.has(a.categoryId),
  );
  await dst.categoryAsset.deleteMany({ where: { vendorId: AHEED_ID } });
  await dst.categoryAsset.createMany({ data: catAssets, skipDuplicates: true });
  console.log(`16. CategoryAssets migrated (${catAssets.length}, including active 3D UI icons)`);

  // 17. Products for Aheed (in chunks of 500)
  const products = await src.product.findMany({ where: { vendorId: AHEED_ID } });
  const insertedProducts = await chunkedCreateMany(products, 500, (chunk) =>
    dst.product.createMany({ data: chunk, skipDuplicates: true }),
  );
  console.log(
    `17. Products migrated (${insertedProducts} newly inserted / ${products.length} total)`,
  );

  // 18. ProductImages for Aheed
  const prodImages = await src.productImage.findMany({
    where: { product: { vendorId: AHEED_ID } },
  });
  await dst.productImage.createMany({ data: prodImages, skipDuplicates: true });
  console.log(`18. ProductImages migrated (${prodImages.length})`);

  // 19. ProductPriceTiers for Aheed
  const priceTiers = await src.productPriceTier.findMany({
    where: { product: { vendorId: AHEED_ID } },
  });
  await dst.productPriceTier.createMany({ data: priceTiers, skipDuplicates: true });
  console.log(`19. ProductPriceTiers migrated (${priceTiers.length})`);

  // 20. Inventory for Aheed
  const inventories = await src.inventory.findMany({ where: { vendorId: AHEED_ID } });
  const insertedInv = await chunkedCreateMany(inventories, 500, (chunk) =>
    dst.inventory.createMany({ data: chunk, skipDuplicates: true }),
  );
  console.log(
    `20. Inventory rows migrated (${insertedInv} newly inserted / ${inventories.length} total)`,
  );

  // 21. Bundles & BundleItems for Aheed
  const bundles = await src.bundle.findMany({ where: { vendorId: AHEED_ID } });
  await dst.bundle.createMany({ data: bundles, skipDuplicates: true });
  const bundleIds = bundles.map((b) => b.id);
  const bundleItems = await src.bundleItem.findMany({ where: { bundleId: { in: bundleIds } } });
  await dst.bundleItem.createMany({ data: bundleItems, skipDuplicates: true });
  console.log(`21. Bundles (${bundles.length}) & BundleItems (${bundleItems.length}) migrated`);

  // 22. Users, Accounts, VendorMemberships (before DiscountCodes which may reference referrerUserId)
  const allUsers = (await src.user.findMany()).filter(
    (u) =>
      !u.email.startsWith("demo-") &&
      !u.email.endsWith("@example.com") &&
      !u.email.endsWith("@example.test") &&
      u.email !== "test-signup-diag@merqify.com",
  );
  // Remove any pre-existing user in dst with the same email but a different id so ids stay consistent
  for (const u of allUsers) {
    const existing = await dst.user.findUnique({ where: { email: u.email } });
    if (existing && existing.id !== u.id) {
      await dst.user.delete({ where: { id: existing.id } });
    }
  }
  await dst.user.createMany({ data: allUsers, skipDuplicates: true });
  const userIds = new Set(allUsers.map((u) => u.id));

  const accounts = await src.account.findMany({ where: { userId: { in: [...userIds] } } });
  await dst.account.createMany({ data: accounts, skipDuplicates: true });

  const memberships = await src.vendorMembership.findMany({
    where: { vendorId: AHEED_ID, userId: { in: [...userIds] } },
  });
  await dst.vendorMembership.createMany({ data: memberships, skipDuplicates: true });

  // Ensure owner accounts merqifyhub@gmail.com and sriahead@gmail.com have ADMIN role
  for (const adminSpec of [
    { email: "merqifyhub@gmail.com", name: "Merqify Hub" },
    { email: "sriahead@gmail.com", name: undefined },
  ]) {
    const adminUser = await dst.user.findUnique({ where: { email: adminSpec.email } });
    if (adminUser) {
      await dst.user.update({
        where: { id: adminUser.id },
        data: { role: "ADMIN", ...(adminSpec.name ? { name: adminSpec.name } : {}) },
      });
      await dst.vendorMembership.upsert({
        where: { userId_vendorId: { userId: adminUser.id, vendorId: AHEED_ID } },
        update: { role: "ADMIN" },
        create: { userId: adminUser.id, vendorId: AHEED_ID, role: "ADMIN" },
      });
    }
  }
  console.log(
    `22. Users (${allUsers.length}), Accounts (${accounts.length}), Memberships (${memberships.length}) migrated + ADMIN accounts configured`,
  );

  // 23. DiscountCodes for Aheed (excluding any tied to excluded fixture users)
  const discountCodes = (await src.discountCode.findMany({ where: { vendorId: AHEED_ID } })).filter(
    (d) => !d.referrerUserId || userIds.has(d.referrerUserId),
  );
  await dst.discountCode.createMany({ data: discountCodes, skipDuplicates: true });
  console.log(`23. DiscountCodes migrated (${discountCodes.length})`);

  // 24. Promotions for Aheed
  const promotions = await src.promotion.findMany({ where: { vendorId: AHEED_ID } });
  await dst.promotion.createMany({ data: promotions, skipDuplicates: true });
  console.log(`24. Promotions migrated (${promotions.length})`);

  // 25. Addresses, Orders, OrderItems, OrderStatusEvents, Payments for Aheed
  const orders = await src.order.findMany({ where: { vendorId: AHEED_ID } });
  const addressIds = orders.map((o) => o.addressId).filter((id): id is string => Boolean(id));
  if (addressIds.length > 0) {
    const addresses = await src.address.findMany({ where: { id: { in: addressIds } } });
    await dst.address.createMany({ data: addresses, skipDuplicates: true });
  }
  await dst.order.createMany({ data: orders, skipDuplicates: true });
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length > 0) {
    const orderItems = await src.orderItem.findMany({ where: { orderId: { in: orderIds } } });
    await dst.orderItem.createMany({ data: orderItems, skipDuplicates: true });
    const statusEvents = await src.orderStatusEvent.findMany({
      where: { orderId: { in: orderIds } },
    });
    await dst.orderStatusEvent.createMany({ data: statusEvents, skipDuplicates: true });
    const payments = await src.payment.findMany({ where: { orderId: { in: orderIds } } });
    await dst.payment.createMany({ data: payments, skipDuplicates: true });
  }
  console.log(`25. Orders (${orders.length}) and related records migrated`);

  // 26. Ensure 0 reviews / customerFeedback on fresh store launch
  await dst.review.deleteMany({});
  await dst.customerFeedback.deleteMany({});
  console.log(`26. Verified 0 reviews and 0 customerFeedback in dedicated AFC database`);

  // 27. HealthCheck label for dedicated cell
  await dst.healthCheck.deleteMany({});
  await dst.healthCheck.create({
    data: { label: isStaging ? "afc-dedicated-cell-staging" : "afc-dedicated-cell" },
  });
  console.log(`27. HealthCheck label set`);

  await src.$disconnect();
  await dst.$disconnect();
  console.log("Migration to dedicated AFC database COMPLETE!");
}

main();
