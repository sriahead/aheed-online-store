# Expand 3D icon suite across Shop, Quick Shop, Contact and Follow, and Department navigation (build notes)

Issue `#1248`. Builds on `specs/2026-10-24-p1248-3d-icons-expansion/plan.md` and `#1245`.

## What changed and why

1. **3 New Modern 3D Icons (`lib/icons-3d/catalog.ts`):**
   - **`storefront`**: 3D grocery market building with awning canopy, glass doors, store sign, and vendor-accented trim.
   - **`quick-shop`**: 3D shopping bag with embossed list badge, glowing sparkles, and dual metallic handles.
   - **`contact-follow`**: 3D dual communication bubbles with group silhouette and vibrant gradients.
   - Total registered 3D icons in `ICON_3D_DEFINITIONS` expanded from 16 to 19.

2. **3D Render Engine Enhancements (`lib/icons-3d/render.ts`, `lib/icons-3d/types.ts`):**
   - Added `decorative` option to `RenderOptions` and `<Icon3D>`: when `true`, emits `aria-hidden="true"` and omits inner `<title>` and `<desc>` tags so parent buttons and links retain clean accessible text without SVG metadata leakage.
   - Optimized keyframe emission: `<style>` tags are now emitted only when animations are active (`animType !== "none"` and `animated !== false`).

3. **Storefront Surface Upgrades:**
   - **Header Shop Link (`components/layout/Header.tsx`):** Upgraded from 2D store glyph to `<Icon3D name="storefront" size={20} animated={false} decorative />`.
   - **Header Quick Shop Link (`components/layout/ShoppingListLink.tsx`):** Upgraded from 2D shopping bag to `<Icon3D name="quick-shop" size={20} animated={false} decorative />`.
   - **Floating Contact & Follow Button (`components/layout/FloatingContact.tsx`):** Upgraded from 2D users glyph to `<Icon3D name="contact-follow" dataIcon="users" size={28} />`.
   - **Rewards Launcher (`components/rewards/RewardsLauncher.tsx`):** Upgraded to `<Icon3D name="rewards-coin" size={20} decorative />` while retaining hidden semantic icon for surface parity testing.
   - **Department Navigation (`components/layout/DepartmentScroller.tsx` & `components/layout/DepartmentHero.tsx`):** Mapped grocery departments (`fruit-veg`, `bakery`, `dairy-eggs`, `halal-meat`, `groceries`, `beverages`, `snacks`, `frozen-foods`, `household`) now render 3D icons when `use3D={true}` is passed, with graceful fallback to Noto Emoji illustrations for remaining departments. Enabled on all storefront department surfaces.

4. **Testing & Parity (`tests/3d-icons-expansion.test.tsx`):**
   - 10 automated tests proving the new definitions, API manifest (19 icons), SVG delivery, header controls, floating contact button, rewards launcher, and department 3D rendering.
   - Full suite passes: 319 test files, 4,557 tests.

## Decisions taken during the build

1. **Decorative 3D Icons & Accessibility Safeguards:**
   Added a `decorative` mode to `renderIconSvg` and `<Icon3D>`. When set to `true`, the SVG carries `aria-hidden="true"` and omits `<title>` and `<desc>` tags. This ensures that when 3D icons sit alongside visible button text (e.g., Quick Shop or Shop in the header), the accessible name remains clean and avoids redundant screen reader announcements.
2. **Keyframe Performance & Zero-Junk Styles:**
   Styles for floating/popping animations are omitted entirely when `animated={false}` or `animType="none"`, saving DOM payload and preventing inner SVG text leakage in test environments.
3. **Graceful Fallback for Department Navigation:**
   Department categories with corresponding 3D artwork (`fruit-veg`, `bakery`, etc.) render 3D icons, while categories without 3D definitions (`international`, `fish`, `sri-electronics`, etc.) gracefully render their static Noto illustrations, maintaining visual consistency across diverse vendor catalogs.

## Deviations from the spec

None.

## Known-shaky areas

None. All quality gates (`npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run icons:check`, vitest `--maxWorkers=4`) pass cleanly.
