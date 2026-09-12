---
id: 2026-09-12-staff-panel-operability-requirements
title: Staff Panel Operability & Search Synonyms Requirements
status: proposed
---

# Requirements: Staff Panel Operability & Search Synonyms (Epic #733)

## Search Synonym Operability

1. **R1: Guarded JSON Parsing (#589)**
   - `lib/search-synonym-proposals.ts`'s `proposeSynonyms` must catch exceptions thrown by `await response.json()`.
   - On catch, it must return `{ ok: false, error: "The AI service returned an unreadable response." }` rather than throwing out of the function.

2. **R2: Verified AI Response Shape (#583)**
   - The response parsing logic must accurately extract the text from the Cloudflare AI REST response. The `payload.result.response` path assumption must be validated. (Covered via manual validation step).

3. **R3: Bulk Approve/Reject Service (#582)**
   - `lib/search-synonyms-service.ts` must export a function `setBulkSynonymStatus` to update the status of multiple `SearchSynonym` rows atomically.
   - It must verify that all provided IDs belong to the calling `vendorId` before updating. If a partial match occurs (e.g., one ID belongs to another vendor), the transaction must fail or safely skip the unauthorized ID.
   - `features/admin/search-synonyms.ts` must expose a server action `bulkManageSynonyms` that calls this service and revalidates the path.

4. **R4: Bulk Approve/Reject UI (#582)**
   - The `/staff/search-synonyms` page must allow an admin to select multiple `PENDING` synonyms via checkboxes.
   - A bulk action bar must provide "Approve Selected" and "Reject Selected" buttons.
   - Bulk submission must degrade gracefully (showing the error inline via `useActionState`) and clear selection on success.
   - Existing individual row approve/reject/remove functionality must remain unchanged and functional.

5. **R5: Staff Hub Discoverability (#602)**
   - `app/(admin)/staff/page.tsx` must display a card for "Search dictionary" linking to `/staff/search-synonyms`.
   - The card must only be visible to `ADMIN` roles, matching the route's own protection.

## Staff Panel Polish

6. **R6: Category Expand/Collapse (#638)**
   - The `/staff/categories` list must group subcategories visually under their parent categories.
   - Top-level categories that have children must display an interactive toggle to expand/collapse their children.
   - Toggling a parent must hide/show all of its immediate children.
   - The interactive state must be isolated to a Client Component to avoid making the page itself client-rendered.
   - Existing category functionality (links, active status badges, product counts, and the creation form) must remain fully functional.

7. **R7: Runbook Palette (#683)**
   - `components/staff/RunbookClient.tsx` must not use `slate`, `emerald`, or `amber` color utilities.
   - It must use existing design system semantic colors (`primary`, `primary-muted`, `surface`, `surface-muted`, `accent`, `danger`, etc.).
   - The document reader tab selection and article selection UI must remain fully legible and clear under the new palette.

## Constraints & Exclusions
- **No Schema Changes:** The database schema (`schema.prisma`) must not be modified.
- **Tenant Isolation:** Bulk synonym operations must strictly scope to `vendorId`.
- **UI Consistency:** Category and Runbook changes must purely focus on the requested operability improvements, not a general visual redesign.
