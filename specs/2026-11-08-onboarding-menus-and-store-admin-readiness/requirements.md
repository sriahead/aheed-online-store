# Staff Onboarding Menu Expansion & Store Admin Readiness Checklist Access (Requirements)

**Slice:** `specs/2026-11-08-onboarding-menus-and-store-admin-readiness/`  
**Base branch:** `staging`  
**Status:** Approved  

---

## 1. Context & Objective

1. **Staff Onboarding Guide Menu Expansion**:
   In `/staff/onboarding`, expand the Step-by-Step Staff Onboarding Guide to provide comprehensive operational instructions for menus where configuration is required:
   - **Step 7: Orders, Delivery & Fulfilment Operations** (`/staff/orders`, `/staff/fulfilment`, `/staff/payments`).
   - **Step 8: Offers, Loyalty & Promotions Configuration** (`/staff/discounts`, `/staff/promotions`, `/staff/bundles`, `/staff/loyalty`).
   - **Step 9: Customers, Reviews & Content Moderation** (`/staff/feedback`, `/staff/search-synonyms`, `/staff/faqs`, `/staff/customers`, `/staff/assistant`).

2. **Store Admin Launch Readiness Checklist Access**:
   The Launch Readiness Checklist was previously hidden from all non-platform-admins. Store Administrators (`ADMIN` vendor role) require visibility into store launch readiness, completion scores, and category audits so they can independently identify and resolve incomplete configurations before public trading.
   - Store Admin (`auth.via === "ADMIN"`) and Platform Admin (`auth.via === "platform-admin"`) both have full access to the Launch Readiness Checklist, completion score badge, and category audit summary cards.
   - Non-admin store staff (`STAFF` role) view only the clean, step-by-step operational onboarding guide without raw percentage metrics, audit scorecards, or internal platform checks.

---

## 2. Requirements & Acceptance Criteria

### R1. Store Admin Launch Readiness Checklist Access
- In `app/(admin)/staff/onboarding/page.tsx`, compute `canViewChecklist = auth.via === "platform-admin" || auth.via === "ADMIN"`.
- Pass `canViewChecklist` to `OnboardingReadinessDashboard`.
- In `components/staff/OnboardingReadinessDashboard.tsx`:
  - Show the Launch Readiness status badge, overall completion percentage, required item counters, and progress bar to users where `isPlatformAdmin || canViewChecklist` is true.
  - Enable the "Switch to Audit Checklist" tab toggle and Category summary cards for Store Admins and Platform Admins.
  - Keep internal percentage metrics, counters, and audit scorecards hidden for non-admin store staff (`STAFF` role).

### R2. Onboarding Operations Guide Expansion
- Add **Step 7: Orders, Delivery & Fulfilment Operations**:
  - Detailed operational instructions for `/staff/orders` (status lanes), `/staff/fulfilment` (delivery windows, booking capacities, collection hours), and `/staff/payments` (transaction auditing).
- Add **Step 8: Offers, Loyalty & Promotions Configuration**:
  - Detailed operational instructions for `/staff/discounts` (promo coupon creation, spend floors), `/staff/promotions` (marketing campaigns), `/staff/bundles` (multi-buys, kit savings), and `/staff/loyalty` (point ratios and tier perks).
- Add **Step 9: Customers, Reviews & Content Moderation**:
  - Detailed operational instructions for `/staff/feedback` (review moderation), `/staff/search-synonyms` (desi grocery search mappings), `/staff/faqs` (customer answers), `/staff/customers` (shopper lifetime values), and `/staff/assistant` (chat assistant).

### R3. Help Centre Documentation & Test Verification
- Synchronize `docs/client-help-centre/getting-started-onboarding.md` and rebuild KMS artifacts.
- Extend `tests/app-improvements-vat-quickview-onboarding.test.tsx` verifying dual Store Admin / Platform Admin access, non-admin staff restrictions, and presence of Steps 7, 8, and 9.
