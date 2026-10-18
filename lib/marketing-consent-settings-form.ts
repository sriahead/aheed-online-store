/**
 * The `/staff/storefront` marketing-consent switch form's state (#1134). Lives here, not in
 * `features/admin/marketing-consent.ts`, because a `"use server"` file may export only async
 * functions — one exported constant there would 500 every action in it at runtime (#159).
 */

export const MARKETING_CONSENT_ENABLED_FIELD = "marketingConsentEnabled";

export interface MarketingConsentSettingsFormState {
  error: string | null;
  saved: boolean;
}

export const initialMarketingConsentSettingsState: MarketingConsentSettingsFormState = {
  error: null,
  saved: false,
};
