---
id: 2026-09-12-staff-panel-operability-plan
title: Staff Panel Operability & Search Synonyms Plan
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-09-12
visibility: internal
summary: "Plan for staff panel operability and search synonyms"
---# Plan: Staff Panel Operability & Search Synonyms (Epic #733)

This slice addresses six distinct but related operator-tooling issues under the `app/(admin)/staff` namespace. All changes are UI or application logic improvements; no database schema changes are required.

## 1. Search Synonym Operability

### Fix the AI Proposal JSON parse (#589 & #583)
- **File:** `lib/search-synonym-proposals.ts`
- **Change:** Wrap the `await response.json()` in `proposeSynonyms` in a `try/catch` block. If it throws, return an `{ ok: false, error: "The AI service returned an unreadable response." }` object. 
- **Validation (#583):** Verify the `result.response` path parsing against a live Cloudflare AI response (simulated or actual) to ensure the structure assumed (`result.response` string) matches reality.

### Bulk Approve/Reject for Synonyms (#582)
- **Files:** `app/(admin)/staff/search-synonyms/page.tsx`, `components/staff/SynonymDictionary.tsx`, `features/admin/search-synonyms.ts`, `lib/search-synonyms-service.ts`
- **Change:** 
  - Introduce a new server action `bulkManageSynonyms(vendorId, ids, intent: "approve" | "reject")` in the service layer, wrapping multiple status updates in a transaction.
  - Update `SynonymDictionary.tsx` to include a bulk-selection wrapper (Client Component) for the `PENDING` list.
  - Add checkboxes to each pending row and a bulk action bar at the top/bottom of the pending list.
  - Retain the individual row-level approve/reject buttons for convenience.

### Link Synonym Queue to Staff Hub (#602)
- **File:** `app/(admin)/staff/page.tsx`
- **Change:** Add a new card in the `isAdmin` section for "Search dictionary" linking to `/staff/search-synonyms`, using a suitable Lucide icon (e.g., `BookA`).

## 2. Staff Panel Polish

### Category Manager Expand/Collapse (#638)
- **Files:** `app/(admin)/staff/categories/page.tsx`, `components/staff/CategoryListClient.tsx` (new)
- **Change:** 
  - Extract the `<ul>` rendering of categories into a new Client Component `CategoryListClient`.
  - Introduce local state to track expanded/collapsed parent categories. By default, parents are expanded.
  - Render an expand/collapse toggle (e.g., `ChevronDown` / `ChevronRight`) next to top-level categories that have children.
  - Hide child `<li>` elements when their parent is collapsed.

### Runbook Layout & Palette Fix (#683)
- **File:** `components/staff/RunbookClient.tsx`
- **Change:** 
  - Replace the hardcoded Tailwind color scales (`slate-*`, `emerald-*`, `amber-*`) with the application's design system tokens (`primary`, `primary-muted`, `primary-subtle`, `surface`, `surface-muted`, `accent`, `action`, `danger`).
  - Improve the mobile layout if the two-column grid breaks awkwardly (ensure the tab list wraps or scrolls horizontally instead of squishing).
