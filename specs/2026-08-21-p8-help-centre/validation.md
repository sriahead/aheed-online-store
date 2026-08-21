# P8.1 Unified Role-Aware Help Centre (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `grep 'href="/help"' components/layout/Header.tsx` exits 0. |
| R2  | `npm run preview`, navigate to `http://localhost:3000/help` as an unauthenticated guest. Verify the page loads and the static FAQ sections (Delivery, Loyalty, Discounts, Privacy) are visible. |
| R3  | Check `app/(storefront)/help/page.tsx` for `requireVendorRole("STAFF", "ADMIN")`. Verify it checks `auth.ok` rather than immediately returning `<PanelRefusal />` or throwing/redirecting. |
| R4  | Log in as `demo.admin@aheed.com` or `demo.staff@aheed.com`, navigate to `/help`, and verify "Internal Staff Resources" section is visible. |
| R5  | Log out (or open incognito), navigate to `/help`, and verify "Internal Staff Resources" is completely absent from the DOM. |
| R6  | Check `CHANGELOG.md` has an entry for the Help Centre. |
| R7  | `npm run lint`, `npm run typecheck`, and `npm run test` all exit 0. |
