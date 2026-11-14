# Configurable platform branding terminology in Client Setup (build notes)

Branch `feature/1585-configurable-branding`, issue #1585.

## What changed and why

1. **`lib/platform-defaults.ts`**:
   - Added `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY = "Levelled Up by Merqify"`.
2. **`prisma/schema.prisma` & Migration**:
   - Added `platformBrandingTerminology String?` to `VendorConfig`.
   - Hand-authored migration adding the nullable column.
3. **`lib/repositories/vendor.ts` & `lib/client-setup-service.ts`**:
   - Added `updateVendorPlatformBranding` repository function and service facade.
   - Added `applyPlatformBrandingToAllVendors` for bulk multi-store synchronization.
4. **`app/(admin)/staff/platform/client-setup/`**:
   - Added `PlatformBrandingForm` component and server action.
5. **`lib/payments.ts`**:
   - `CreatePaymentInput` accepts `brandingTerminology?: string`.
   - `line_items[0][price_data][product_data][description]` uses `input.brandingTerminology || DEFAULT_PLATFORM_BRANDING_TERMINOLOGY`.
6. **`lib/repositories/orders.ts`**:
   - `placeOrder` queries `VendorConfig.platformBrandingTerminology` and supplies it to `payments.createPayment`.
7. **`components/layout/StorefrontFooter.tsx` & Chrome**:
   - Updated platform attribution to render `platformBrandingTerminology`.
8. **`lib/email/layout/render.ts`**:
   - Email footer uses `platformBrandingTerminology`.
9. **`app/(storefront)/icon-credits/page.tsx`**:
   - Icon credits page uses `platformBrandingTerminology`.
