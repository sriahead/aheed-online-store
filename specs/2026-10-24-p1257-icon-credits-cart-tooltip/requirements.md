# Requirements — Icon credits page, generated icon attribution, and cart tooltip cleanup (#1257)

## Functional Requirements

- **R1: Cart Hover Tooltip Purity:**
  - The floating shopping cart button and drawer must display only `"My Cart"` on hover.
  - The inner SVG rendered by `<Icon3D name="cart-add" />` must not render a conflicting `<title>` tag when embedded inside `<CartDrawerShell>` (using `decorative={true}`).
  - In `lib/icons-3d/catalog.ts`, `cart-add` name must be updated to `"My Cart"`.

- **R2: Tooltip & Title Audit Across Components:**
  - In `lib/icons-3d/catalog.ts`, remove `"3D "` prefixes from catalog icon names (`Delivery Van`, `Postcode Checker`, `My Cart`, `Secure Checkout Shield`, `Notification Bell`, `Crisp Farm Produce`, `Prime Halal Cut`, `Golden Croissant`, `Dairy Milk & Egg`, `Hot & Cold Beverages`, `Choc-Chip Cookie`, `Frost Snowflake`, `Soap Pump Dispenser`, `Gold Loyalty Coin`, `Wrapped Gift Box`, `Storefront`, `Quick Shop`, `Contact & Follow Hub`, `User Profile`).
  - In `components/layout/FloatingContact.tsx`, the trigger `<Icon3D name="contact-follow" />` must be marked `decorative={true}` so the trigger button's `title="Contact & Follow Hub"` is not superseded by inner SVG titles.

- **R3: Dedicated Icon Credits Page:**
  - A responsive storefront route must exist at `/icon-credits` wrapped in `<PageContainer width="standard">`.
  - The page must present clear, simple attributions for all third-party icon libraries used in the project:
    - **Lucide Icons:** ISC License, Lucide Contributors / Cole Bemis.
    - **Google Noto Emoji:** Apache License 2.0, Google Inc.
    - **Phosphor Icons:** MIT License, Phosphor Icons (Helena Zhang & Tobias Fried).
    - **Simple Icons:** CC0 1.0 Universal Public Domain Dedication, Simple Icons Collaborators.
  - The page must include links to upstream repositories and licences, and provide a direct link to the raw `/third-party-icon-licenses.txt` file.

- **R4: Generated & Custom 3D Icons Attribution:**
  - The `/icon-credits` page must clearly identify custom-generated and AI-generated 3D vector icons across commerce, department, rewards, navigation, and hub categories.
  - The section must display the attribution statement **“Powered by {platformName}”**.
  - The platform name must be configurable via `getPlatformBrandingEnv().PLATFORM_NAME`, defaulting safely if unspecified, and must never be hardcoded.

- **R5: Storefront Footer Navigation:**
  - The "Icon credits" link in `StorefrontFooter.tsx` must navigate to `/icon-credits`.
  - It must remain accessible, compliant with mobile 44px tap target requirements, and stay outside the Legal nav.
