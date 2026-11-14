# Configurable platform branding terminology in Client Setup (requirements)

## Requirements

R1. **Default Branding Terminology Constant**
    - `lib/platform-defaults.ts` exports `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY = "Levelled Up by Merqify"`.

R2. **Data Model & Additive Schema**
    - `VendorConfig` gains a nullable field `platformBrandingTerminology String?`.
    - Hand-authored additive migration copying Prisma conventions (`ALTER TABLE "VendorConfig" ADD COLUMN "platformBrandingTerminology" TEXT;`).
    - An empty string or null resolves to `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY`.

R3. **Platform Admin Client Setup Interface**
    - `/staff/platform/client-setup` includes a **Platform Branding & Ecosystem Identity** section/card for the selected vendor.
    - Displays the current terminology, prefilling `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY` when empty.
    - Offers a form allowing platform admins to update the terminology for the selected store.
    - Offers an option to apply the branding terminology across all client stores in one batch update.
    - Protected by platform admin RBAC (`requireVendorRole("ADMIN")` with `auth.via === "platform-admin"`).

R4. **Stripe Checkout Dynamic Line-Item Description**
    - When creating a Stripe Checkout Session via `PaymentService.createPayment`:
      - `line_items[0][price_data][product_data][description]` is set to `input.brandingTerminology || DEFAULT_PLATFORM_BRANDING_TERMINOLOGY`.
      - `CreatePaymentInput` accepts optional `brandingTerminology?: string`.
    - In `lib/repositories/orders.ts` (`placeOrder`), the vendor's `platformBrandingTerminology` is fetched along with `name` and passed to `payments.createPayment`.

R5. **Storefront Footer Attribution**
    - `StorefrontFooter` accepts `brandingTerminology?: string` (or derives from `profile.platformBrandingTerminology`, falling back to `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY`).
    - Renders the branding terminology linked to `https://merqify.com`.

R6. **Email Footer Attribution**
    - `lib/email/layout/render.ts` renders the configured branding terminology (defaulting to `"Levelled Up by Merqify"`) in the email footer link.

R7. **Third-Party Credits & Terms Attribution**
    - `/icon-credits` attributes generated icons using the branding terminology.
    - `/terms` technology statement references the branding terminology.
