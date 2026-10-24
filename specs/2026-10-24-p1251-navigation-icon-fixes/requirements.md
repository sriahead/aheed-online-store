# Fix Quick Shop mobile visibility, icon sizes, user profile icon and navigation drill-down (requirements)

## R1: Quick Shop Visibility & Positioning Across Viewports
- Quick Shop must be visible and easily tappable on mobile (<640px), tablet (640px-1024px), and desktop (>=1024px).
- Quick Shop must sit in the primary header navigation alongside Shop, ensuring symmetric alignment.
- On mobile viewports, both Shop and Quick Shop must maintain at least 44×44px touch targets.

## R2: Icon Sizing & Visual Balance
- `FloatingContact` trigger icon must be increased from `size={28}` to `size={38}` so the icon prominently fills the 48px circular button.
- Header `Shop` and `Quick Shop` 3D icons must be increased from `size={20}` to `size={24}` for high legibility and contrast.
- All upgraded icons must include descriptive `title` tooltips and accessible labels for screen readers.

## R3: Dedicated User / Profile Icon
- A new `user-profile` 3D icon must be added to `lib/icons-3d/catalog.ts` (expanding the catalog from 19 to 20 icons).
- In `Header.tsx`, logged-in users must display the 3D user-profile icon instead of the plain first letter initial.

## R4: Reliable Drill-Down Navigation
- Clicking `Shop` (`/categories`) or `Quick Shop` (`/quick-shop`) must reliably load the target page on the first click across desktop, tablet, and mobile without requiring a page refresh.
- Links must use `prefetch={false}` to avoid stale App Router flight caches across route groups.
- If already on the destination page, clicking the nav item must smoothly scroll to the top of the content.
