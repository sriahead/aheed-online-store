# P8.1 Unified Role-Aware Help Centre (requirements / acceptance criteria)

This slice resolves Issue #318 by creating a unified `/help` route that statically displays FAQs to shoppers, and dynamically renders internal staff resources if the user has elevated privileges.

R1. `components/layout/Header.tsx` updates the 'Help Guide' link to point to `/help` instead of `#`.
R2. `app/(storefront)/help/page.tsx` exists and returns a static FAQ section covering Delivery, Loyalty, Discounts, and Privacy.
R3. `app/(storefront)/help/page.tsx` uses `requireVendorRole("STAFF", "ADMIN")` to check the current user's session without throwing an error if the user is unauthenticated.
R4. If `requireVendorRole` returns `ok: true`, an "Internal Staff Resources" section is rendered, containing a link to `/staff/runbook` and explaining the View Switcher.
R5. If `requireVendorRole` returns `ok: false`, the "Internal Staff Resources" section is completely absent from the DOM.
R6. `CHANGELOG.md` updated (Gate 4).
R7. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.

<!--
  Conventions (delete this comment block once the real requirements are written):
  - Number sequentially, R1..Rn. Insert a lettered sub-requirement (R2a) only when it's a genuine
    prerequisite fix discovered mid-slice — don't renumber everything that follows it.
  - The LAST requirement is always the Gate-3 catch-all:
      Rn. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
  - The requirement before that is always Gate 4:
      Rn-1. `CHANGELOG.md` updated (Gate 4).
  - `plan.md` carries the front-matter and the ARTIFACT_INDEX.md entry for this slice — this file
    and validation.md deliberately don't get their own front-matter, matching the repo-wide
    precedent of one indexed entry per slice, not one per file.
-->
