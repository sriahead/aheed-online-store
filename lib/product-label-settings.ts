import type { ProductWriteInput } from "@/lib/repositories/products";
import type { VendorProfile } from "@/lib/repositories/vendor";

/**
 * #905 — which of the six product labels a vendor's staff product form offers, and what that
 * means for a product write. Pure, no I/O, unit-tested.
 *
 * ## Why a disabled label is STRIPPED from the write, not saved as false
 *
 * A label the vendor has switched off is not rendered on the product form, and a checkbox that is
 * not rendered submits nothing — which `parseProductForm` reads as `false`. Writing that `false`
 * would silently clear the label from every product an operator happened to save after an admin
 * switched it off. So each disabled label's fields become `undefined` here, which Prisma treats as
 * "leave this column alone" on an update and "use the column default" on a create.
 *
 * The settings come from the vendor's own config, read server-side in `saveProduct` — never from
 * the submission — so a crafted request carrying a disabled label's field cannot set it either.
 */

export interface ProductLabelSettings {
  halal: boolean;
  fresh: boolean;
  organic: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  /** "HMC shown": HMC certification offered AND Halal offered (HMC is a halal certifier). */
  hmc: boolean;
}

type LabelSettingsSource = Pick<
  VendorProfile,
  | "showHalalLabel"
  | "showFreshLabel"
  | "showOrganicLabel"
  | "showVegetarianLabel"
  | "showGlutenFreeLabel"
  | "showHmcCertification"
>;

export function labelSettingsFromProfile(profile: LabelSettingsSource): ProductLabelSettings {
  return {
    halal: profile.showHalalLabel,
    fresh: profile.showFreshLabel,
    organic: profile.showOrganicLabel,
    vegetarian: profile.showVegetarianLabel,
    glutenFree: profile.showGlutenFreeLabel,
    hmc: profile.showHalalLabel && profile.showHmcCertification,
  };
}

/** The product write with every disabled label's fields set to `undefined` (see file comment). */
export function applyProductLabelSettings(
  values: ProductWriteInput,
  settings: ProductLabelSettings,
): ProductWriteInput {
  return {
    ...values,
    isHalal: settings.halal ? values.isHalal : undefined,
    isFresh: settings.fresh ? values.isFresh : undefined,
    isOrganic: settings.organic ? values.isOrganic : undefined,
    isVegetarian: settings.vegetarian ? values.isVegetarian : undefined,
    isGlutenFree: settings.glutenFree ? values.isGlutenFree : undefined,
    isHmcCertified: settings.hmc ? values.isHmcCertified : undefined,
    hmcReference: settings.hmc ? values.hmcReference : undefined,
    hmcVerifiedAt: settings.hmc ? values.hmcVerifiedAt : undefined,
  };
}
