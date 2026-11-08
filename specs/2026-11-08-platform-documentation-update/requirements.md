# Platform Documentation Review and Comprehensive Update (Requirements)

**Issue:** #1468  
**Slice:** `specs/2026-11-08-platform-documentation-update/`  
**Base branch:** `staging`  
**Status:** Approved  

---

## 1. Context & Objective

The Aheed Online Store platform (`aheed.merqify.com`) is populated with the complete catalog (6,098 clean stock lines across 66 departments) and active multi-tenant infrastructure. To empower store operators and newly onboarded staff to operate independently without technical escalations, platform documentation and onboarding guides across the storefront, staff portal, and internal KMS must be brought into 100% parity with live features.

---

## 2. Requirements & Acceptance Criteria

### Phase 1: Exploration & Parity Baseline
R1. All documentation must reflect the live interface and verified system behavior across:
    - **Brand Management (`/staff/brands`)**: Full CRUD, cognitive metrics, logo uploads (`/api/admin/brands/upload-logo`), URL ingestion, and interactive product quick-view drawer.
    - **Visual Asset Gallery (`/staff/icons`)**: Multi-target studio (System slots, Category icons, Brand logos), candidate generation, activation (`CategoryAsset.isSelected`), deactivation, and large medallion modal inspection.
    - **Category Visual Assets (`/staff/categories/[id]`)**: In-form candidate management, photo vs 3D icon styles, and primary image assignment.
    - **Product Lifecycle & Stock Management (`/staff/products`, `/staff/inventory`)**: Product creation/edit, mandatory fields, integer pence pricing, VAT compliance, dietary flags, and stock tracking modes (`TRACKED`, `UNTRACKED`, `INFINITE`).
    - **Storefront Publication & Visibility Rules**: Strict criteria for public appearance (`isActive: true`, active category, valid price > 0, stock availability, and safeguard preventing activation while stock status is `UNKNOWN`).

### Phase 2: Help Guide (`/help` and `RoleJourneyMaps.tsx`)
R2. Update `components/help/RoleJourneyMaps.tsx` with comprehensive, actionable steps for Store Staff and Store Admin roles:
    - Include brand management and assigning brands to products.
    - Include using the visual asset gallery (`/staff/icons`) and applying category icons.
    - Include product listing creation, mandatory fields, and required settings.
    - Detail the exact publication rules for making stock visible to shoppers.
R3. Update `docs/client-help-centre/user-journeys.md` to maintain strict parity with `RoleJourneyMaps.tsx`.

### Phase 3: Staff Onboarding Workflow (`/staff/onboarding` and `getting-started-onboarding.md`)
R4. Enhance `components/staff/OnboardingReadinessDashboard.tsx` to provide an interactive **Sequential Staff Onboarding Guide** tab or view directly on `/staff/onboarding`, giving staff members clear step-by-step instructions directly on the onboarding page.
R5. Update `docs/client-help-centre/getting-started-onboarding.md` with:
    - Complete sequential workflow from login to publication.
    - Brand management and assignment steps.
    - Category icon curation and activation in `/staff/icons`.
    - Stock creation, editing, inventory mode selection, and publishing rules.
R6. Update `docs/client-help-centre/products-catalogue-guide.md` with brand assignment, publication dependencies, and stock safeguard rules (#1449).
R7. Update `docs/client-help-centre/icon-and-visual-asset-standards.md` with the new Visual Asset Gallery (`/staff/icons`), brand logo slot management, and medallion rendering rules.

### Phase 4: Verification & KMS Indexing
R8. Run `npm run kms:build-index` to regenerate `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`.
R9. Ensure `npm run kms:validate` and `npm run typecheck` pass with zero errors.
R10. Maintain documentation integrity: no existing valid instructions or features are removed; only extended and brought up to date.
