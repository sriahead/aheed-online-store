"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { createLoyaltyTier, deleteLoyaltyTier, saveLoyaltySettings } from "@/lib/loyalty-service";
import type { LoyaltySettingsInput } from "@/lib/repositories/loyalty";

/**
 * Loyalty configuration action (P5a, #135) — the write half of `/staff/loyalty`.
 *
 * Gated to vendor ADMIN, and it runs `requireVendorRole` ITSELF rather than
 * trusting the page that rendered the form. A server action is a public endpoint
 * at a stable id: anyone who has seen the page once can POST to it forever, so
 * the page's check protects the page, not this. Same posture P4b's
 * advance-status action takes.
 *
 * STAFF is deliberately excluded where the queue allows it — changing the earn
 * rate is an owner decision with money attached, not a packing-floor one. The
 * mockup's Loyalty Config tab is admin-only for the same reason.
 *
 * The vendor is resolved from the request host inside `requireVendorRole`, never
 * from the form, so no submitted field can redirect the write to another
 * vendor's rows.
 */

export type LoyaltyConfigState = { error: string | null; saved: boolean };

class InvalidFieldError extends Error {}

const FIELD_LABELS: Record<string, string> = {
  pointsPerPoundEarned: "Points per £1",
  pencePerPointRedeemed: "Pence per point",
  minRedeemPoints: "Minimum points to redeem",
  tierWindowDays: "Tier window (days)",
  pointsExpiryMonths: "Points expiry (months)",
};

/** A whole number ≥ `min`. Rejects "", "abc", "1.5" and negatives identically. */
function integerField(form: FormData, field: string, min: number): number {
  const raw = String(form.get(field) ?? "").trim();
  const parsed = Number(raw);
  if (raw === "" || !Number.isInteger(parsed) || parsed < min) {
    throw new InvalidFieldError(
      `${FIELD_LABELS[field] ?? field} must be a whole number of at least ${min}.`,
    );
  }
  return parsed;
}

/** Same, but an empty value means "never expire" rather than an error. */
function optionalIntegerField(form: FormData, field: string, min: number): number | null {
  const raw = String(form.get(field) ?? "").trim();
  if (raw === "") return null;
  return integerField(form, field, min);
}

export async function saveLoyaltyConfig(
  _prev: LoyaltyConfigState,
  form: FormData,
): Promise<LoyaltyConfigState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    // Returned as data, never thrown — matching lib/auth-rbac.ts's posture, so a
    // refusal renders as a message rather than a 500.
    return {
      error:
        auth.status === 401
          ? "Please sign in as a store admin to change these settings."
          : "You don't have permission to change this store's loyalty settings.",
      saved: false,
    };
  }

  let settings: LoyaltySettingsInput;
  try {
    settings = {
      loyaltyEnabled: form.get("loyaltyEnabled") === "on",
      pointsPerPoundEarned: integerField(form, "pointsPerPoundEarned", 0),
      // Floor of 1: a zero would make every redemption worth nothing while still
      // debiting points, and division by it drives the clamp in lib/loyalty.ts.
      pencePerPointRedeemed: integerField(form, "pencePerPointRedeemed", 1),
      minRedeemPoints: integerField(form, "minRedeemPoints", 0),
      tierWindowDays: integerField(form, "tierWindowDays", 1),
      pointsExpiryMonths: optionalIntegerField(form, "pointsExpiryMonths", 1),
      tiers: parseTiers(form),
    };
  } catch (error) {
    if (error instanceof InvalidFieldError) return { error: error.message, saved: false };
    throw error;
  }

  await saveLoyaltySettings(auth.vendorId, settings);
  revalidatePath("/staff/loyalty");
  return { error: null, saved: true };
}

/**
 * Tier edits, keyed by the tier's own `key` rather than a row id — the key is
 * already unique per vendor, so a submitted value cannot address another
 * vendor's row even before the repository scopes the write.
 *
 * P5a edits existing tiers only. There is no create or delete path here, and the
 * repository refuses keys this vendor doesn't already have.
 */
function parseTiers(form: FormData): LoyaltySettingsInput["tiers"] {
  const keys = form.getAll("tierKey").map((value) => String(value));
  return keys.map((key, index) => ({
    key,
    thresholdPence: indexedIntegerField(form, "tierThresholdPence", index, 0),
    multiplierBps: indexedIntegerField(form, "tierMultiplierBps", index, 1),
  }));
}

function indexedIntegerField(form: FormData, field: string, index: number, min: number): number {
  const raw = String(form.getAll(field)[index] ?? "").trim();
  const parsed = Number(raw);
  if (raw === "" || !Number.isInteger(parsed) || parsed < min) {
    throw new InvalidFieldError(`Tier values must be whole numbers of at least ${min}.`);
  }
  return parsed;
}

// ---- Tier create / delete (P7.5d+e, #136) ----------------------------------
//
// Separate actions rather than more fields on saveLoyaltyConfig: creating and
// deleting a row are not "saving the form", and folding them in would mean one
// submit could both edit every tier and delete one, with no way to report which
// half failed.
//
// Both re-check requireVendorRole("ADMIN") themselves for the same reason
// saveLoyaltyConfig does — a server action is a public endpoint at a stable id,
// so the page's gate protects the page, not these.

/** A tier key: uppercase letters, digits and underscores. Stable, and it is what
 *  LoyaltyLedgerEntry snapshots, so it must not carry spaces or punctuation. */
const TIER_KEY_PATTERN = /^[A-Z0-9_]{2,32}$/;

export async function createTier(
  _prev: LoyaltyConfigState,
  form: FormData,
): Promise<LoyaltyConfigState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return {
      error:
        auth.status === 401
          ? "Please sign in as a store admin to change these settings."
          : "You don't have permission to change this store's loyalty settings.",
      saved: false,
    };
  }

  const key = String(form.get("newTierKey") ?? "")
    .trim()
    .toUpperCase();
  const name = String(form.get("newTierName") ?? "").trim();

  if (!TIER_KEY_PATTERN.test(key)) {
    return {
      error: "Tier key must be 2-32 characters, using only letters, numbers and underscores.",
      saved: false,
    };
  }
  if (name === "") {
    return { error: "Tier name is required.", saved: false };
  }

  let thresholdPence: number;
  let multiplierBps: number;
  try {
    thresholdPence = integerField(form, "newTierThresholdPence", 0);
    multiplierBps = integerField(form, "newTierMultiplierBps", 1);
  } catch (error) {
    if (error instanceof InvalidFieldError) return { error: error.message, saved: false };
    throw error;
  }

  const result = await createLoyaltyTier(auth.vendorId, {
    key,
    name,
    thresholdPence,
    multiplierBps,
  });

  if (!result.ok) {
    return { error: `This store already has a tier with the key "${key}".`, saved: false };
  }

  revalidatePath("/staff/loyalty");
  return { error: null, saved: true };
}

export async function deleteTier(
  _prev: LoyaltyConfigState,
  form: FormData,
): Promise<LoyaltyConfigState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return {
      error:
        auth.status === 401
          ? "Please sign in as a store admin to change these settings."
          : "You don't have permission to change this store's loyalty settings.",
      saved: false,
    };
  }

  const key = String(form.get("deleteTierKey") ?? "").trim();
  if (key === "") return { error: "No tier selected to remove.", saved: false };

  const { count } = await deleteLoyaltyTier(auth.vendorId, key);
  if (count === 0) {
    return {
      error: "That tier no longer exists — it may already have been removed.",
      saved: false,
    };
  }

  revalidatePath("/staff/loyalty");
  return { error: null, saved: true };
}
