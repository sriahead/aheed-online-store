---
id: 2026-09-12-staff-panel-operability-validation
title: Validation
---

# Validation: Staff Panel Operability & Search Synonyms

Run against local preview (`npm run preview`) to ensure Workers boundaries and isolate behaviors are enforced.

## Search Synonym Operability

- [ ] **V1 (R1, R2):** In `lib/search-synonym-proposals.ts`, temporarily replace the AI `fetch` URL with an invalid endpoint that returns HTML or empty body. Click "Suggest from recent searches" in the Staff panel. It should gracefully show "The AI service returned an unreadable response" instead of crashing the page with a 500.
- [ ] **V2 (R2):** Supply valid Cloudflare AI credentials to `.dev.vars`, populate `SearchQueryLog` with some failing queries (e.g., search for "bhindi"), and run "Suggest from recent searches". Confirm the model successfully proposes synonyms and they appear in the PENDING list.
- [ ] **V3 (R3, R4):** In `/staff/search-synonyms`, generate multiple PENDING proposals. Select two via checkboxes and click "Approve Selected". Confirm they move to the Dictionary section as APPROVED.
- [ ] **V4 (R3, R4):** Select another two PENDING proposals and click "Reject Selected". Confirm they are marked REJECTED.
- [ ] **V5 (R4):** Verify that individual "Approve", "Reject", and "Remove" buttons on single rows still work.
- [ ] **V6 (R5):** Visit `/staff` as a Store Admin. Verify the "Search dictionary" card is present and clicking it navigates to `/staff/search-synonyms`.
- [ ] **V7 (R5):** Visit `/staff` as a Staff member (using the demo switcher). Verify the "Search dictionary" card is hidden.

## Staff Panel Polish

- [ ] **V8 (R6):** Visit `/staff/categories`. Create a top-level category "Produce" and a subcategory "Fruit" inside it. Confirm "Produce" has an expand/collapse toggle.
- [ ] **V9 (R6):** Click the toggle. Confirm "Fruit" hides. Click it again, confirm it shows.
- [ ] **V10 (R6):** Create a top-level category "Empty". Confirm it has no expand/collapse toggle.
- [ ] **V11 (R7):** Visit `/staff/runbook`. Confirm the UI colors are black/gray semantic tokens (e.g., `text-primary`, `bg-surface-muted`) and that no green/emerald or amber/slate colors remain. The layout must remain unbroken on mobile widths.

## SDD Workflow

- [ ] **V12:** `npm run sdd:preclear` exits 0.
