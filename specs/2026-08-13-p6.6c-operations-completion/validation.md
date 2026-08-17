# Validation

## 1. Authentication & Role Verification
- [ ] Login as `demo-admin@example.com` (Admin).
  - Verify you land on `/staff`.
  - Verify the navigation bar shows all 9 tabs: Overview, Inventory, Orders, Catalogue, Categories, Loyalty, Discounts, Reports, and Runbook.
  - Verify the Overview page renders the 3 new cards: Inventory, Reports, and Runbook.
- [ ] Login as `demo-staff@example.com` (Staff).
  - Verify you land on `/staff`. (We will ensure staff also go to overview, or if they land on inventory, they can click Overview).
  - Verify the navigation bar shows: Overview, Inventory, Orders, Runbook.
  - Verify the navigation bar DOES NOT show: Catalogue, Categories, Loyalty, Discounts, Reports.
  - Verify the Overview page renders cards for Inventory, Orders, and Runbook.
  - Verify the Overview page DOES NOT render cards for Reports, Catalogue, Categories, Loyalty, Discounts.

## 2. Navigation & Layout
- [ ] Shrink the browser window to mobile width.
  - Verify the `PanelNav` scrolls horizontally and tabs do not wrap or break the layout.
- [ ] Click through each link in the `PanelNav` to ensure no 404s occur.

## 3. Runbook Page
- [ ] Navigate to `/staff/runbook` as Staff or Admin.
- [ ] Verify the page loads successfully and displays the internal operational documentation.
- [ ] Verify the styling matches the dark theme (slate-900 backgrounds, emerald accents) seen in the mockup.

## 4. Reports Page
- [ ] Navigate to `/staff/reports` as Admin.
- [ ] Verify the page displays three metrics cards: Total Revenue, Total Orders, Average Basket Value.
- [ ] Place a test order on the storefront.
- [ ] Refresh `/staff/reports` and verify the metrics update correctly (Total Orders increments, Revenue updates).
- [ ] Log in as Staff, manually type `/staff/reports` in the URL bar.
  - Verify access is denied (401/PanelRefusal).
