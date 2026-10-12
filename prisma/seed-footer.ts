import type { PrismaClient } from "@prisma/client";

/**
 * #1055 / #1060 — the storefront footer's starting values, and the ONE implementation of seeding
 * them. Imported by `prisma/seed.ts` (the full seed) and by `scripts/seed-footer-defaults.ts`, which
 * runs only this step so a database whose branding and config an admin has edited (staging) can get
 * the footer defaults without the full seed's `upsertVendorSatellites` reverting those edits.
 *
 * FILL-ONLY: every value here is one a store admin is expected to replace on `/staff/storefront`,
 * so a re-run must never put a default back over a real value.
 * - each string config column is written only while it is null;
 * - the location is created only when there is none;
 * - weekly hours and payment badges are created only when the vendor has no rows at all;
 * - no holiday override is ever seeded.
 *
 * It touches ONLY `VendorLocation`, `VendorConfig` (by `update`, never `upsert`), `VendorWeeklyHours`
 * and `VendorPaymentBadge`, for the one vendor passed in. No branding, no storage.
 *
 * The bracketed values are the owner-approved placeholders (2026-10-12) for details not yet
 * supplied; they render as text, never as links (`lib/footer-contact-form.ts`). The weekly hours are
 * the owner-confirmed real hours (#1060): hours are times, so they cannot be placeholders.
 */
export type FooterDefaults = {
  location: { addressLine1: string; city: string; postcode: string };
  config: {
    contactPhone: string;
    contactEmail: string;
    companyNumber: string;
    vatNumber: string;
    openingHoursNote: string;
  };
  showSecureCheckoutNote: boolean;
  /** `dayOfWeek` 0 = Sunday … 6 = Saturday; `HH:mm`. */
  weeklyHours: { dayOfWeek: number; openTime: string; closeTime: string }[];
  paymentBadges: ("VISA" | "MASTERCARD" | "AMEX" | "APPLE_PAY" | "GOOGLE_PAY")[];
};

export const AHEED_VENDOR_ID = "a4ed0000-0000-4000-a000-000000000001";

export const AHEED_FOOTER_DEFAULTS: FooterDefaults = {
  location: { addressLine1: "13 N 11th St", city: "Milton Keynes", postcode: "MK9 3BU" },
  config: {
    contactPhone: "01908 239130",
    contactEmail: "[YOUR EMAIL]",
    companyNumber: "[NUMBER]",
    vatNumber: "[NUMBER]",
    openingHoursNote: "Click & Collect orders are ready to pick up during opening hours.",
  },
  showSecureCheckoutNote: true,
  // Owner-confirmed 2026-10-12 (#1060): Mon–Sat 09:00–20:00, Sun 09:00–19:00.
  weeklyHours: [
    { dayOfWeek: 1, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 6, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 0, openTime: "09:00", closeTime: "19:00" },
  ],
  paymentBadges: ["VISA", "MASTERCARD", "AMEX", "APPLE_PAY", "GOOGLE_PAY"],
};

export async function seedFooterDefaults(
  prisma: PrismaClient,
  vendorId: string,
  d: FooterDefaults,
): Promise<void> {
  const location = await prisma.vendorLocation.findUnique({ where: { vendorId } });
  if (!location) {
    await prisma.vendorLocation.create({ data: { vendorId, ...d.location } });
  }

  const config = await prisma.vendorConfig.findUnique({ where: { vendorId } });
  if (config) {
    const fill: Partial<FooterDefaults["config"]> = {};
    for (const key of Object.keys(d.config) as (keyof FooterDefaults["config"])[]) {
      if (config[key] === null) fill[key] = d.config[key];
    }
    // The boolean has no "unset" state; it is turned on only from its column default (false), and
    // only together with a first fill of the footer — so a later deliberate switch-off survives.
    const firstFill = config.contactPhone === null && config.contactEmail === null;
    const data = {
      ...fill,
      ...(firstFill && !config.showSecureCheckoutNote
        ? { showSecureCheckoutNote: d.showSecureCheckoutNote }
        : {}),
    };
    // Nothing to fill means no write at all — not even `updatedAt` moves.
    if (Object.keys(data).length > 0) {
      await prisma.vendorConfig.update({ where: { vendorId }, data });
    }
  }

  // Singular creates with no nested writes: safe on the HTTP adapter (CLAUDE.md).
  if ((await prisma.vendorWeeklyHours.count({ where: { vendorId } })) === 0) {
    for (const row of d.weeklyHours) {
      await prisma.vendorWeeklyHours.create({ data: { vendorId, ...row, closed: false } });
    }
  }

  if ((await prisma.vendorPaymentBadge.count({ where: { vendorId } })) === 0) {
    for (const method of d.paymentBadges) {
      await prisma.vendorPaymentBadge.create({ data: { vendorId, method } });
    }
  }
  console.log(`seeded footer defaults (fill-only) for ${vendorId}`);
}
