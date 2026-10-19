---
id: p1161-1162-1119-fixups-plan
title: "AI budget save, unique note ids and honest reference drift (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-19
visibility: internal
summary: "Three small fixes: the AI budget save refuses cleanly for a vendor with no VendorConfig row (#1161), basket note inputs get unique ids (#1162), and /api/health stops reporting reference drift as false when nothing was compared (#1119)."
tags: [ai-budget, cart, accessibility, health-check, reference-data, p10]
related: [p1135-custom-notes-ai-allowance, sdd-workflow]
---

# AI budget save, unique note ids and honest reference drift (plan)

**Goal:** close three small, unrelated defects in one slice. Two were found at `#1135`'s validation
(`#1161`, `#1162`). The third is the repository half of `#1119`; its credential half was resolved on
2026-10-16. None of the three needs a migration, a new secret or an owner action.

`#1152` (a marketing sender) was proposed alongside these and **excluded by the owner** at Gate 1
(2026-10-19). It stays in the Backlog until `#104` (verified sending domain) is closer.

**Scope (this slice):**

- **`#1161`: AI budget save for a vendor with no `VendorConfig` row.**
  `setVendorAiDailyBudget` (`lib/repositories/ai-usage.ts`) writes with
  `prisma.vendorConfig.update({ where: { vendorId } })`, which throws when the row is missing. The
  platform admin would then see an error page from `/staff/ai-usage` instead of a message.
  - **The approved Gate 1 plan said `upsert`. Spec changes that, and the reason is binding.**
    `VendorConfig` has three required columns with no default: `localityName`, `senderName` and
    `senderEmail`. An `upsert`'s create branch would have to invent a store's town and its email
    sender identity in order to save an AI budget. That is fabricated vendor data, which ADR-004
    forbids. A store with no `VendorConfig` row is a provisioning gap, and the AI budget form is
    not the place to paper over it.
  - **The fix:** the repository function reads the row first (`findUnique`, selecting `vendorId`).
    If there is no row, it writes nothing and returns `false`. If there is one, it does the same
    singular `update` as today and returns `true`. A singular `update` with no nested writes is safe
    on `getPrisma()` (CLAUDE.md, Database), so the HTTP client stays. `saveAiBudget`
    (`features/admin/ai-budget.ts`) turns `false` into the form's existing error state with neutral
    copy, and does not revalidate. The read side, `getVendorAiDailyBudget`, already falls back to
    `DEFAULT_AI_DAILY_NEURON_BUDGET` for a missing row and is unchanged.
  - **The read-then-write is not atomic, and that is acceptable here.** The only way a row
    disappears between the two calls is its vendor being deleted (`onDelete: Cascade`). In that
    case the `update` throws exactly as it does today, so nothing gets worse. An `error.code`
    check would have to accept both adapters' codes and be proven against a real failing request
    (CLAUDE.md). That is a heavier proof than a case this rare is worth.
  - **How likely is this?** Vendors are created only by `prisma/seed.ts` and two verify scripts.
    Every vendor on dev has a row, which is why `#1135`'s validation could not reproduce the
    failure. The fix is defensive, and the unit test is the proof.

- **`#1162`: duplicate note-input ids when the basket drawer opens on `/cart`.**
  `CartLineNote` (`components/cart/CartLineNote.tsx`) builds the input id `cart-note-<productId>`.
  `CartContents` renders on `/cart` and inside the header's `CartDrawerShell`. The drawer mounts its
  children only while open (`{open && ...}` in `components/cart/CartDrawerShell.tsx`), so `/cart`'s
  server HTML carries each id once. Opening the drawer on `/cart` then puts a second input with the
  same id in the document, and the second `<label for>` points at the first input. That is a real
  accessibility defect, confirmed by reading the code rather than by a browser run.
  - **The fix:** derive the id with React's `useId()`. It is supported in Server Components, and
    `CartLineNote` is one (it holds inline `"use server"` closures). This keeps the label/input pair
    inside the component, with no surface prop threaded through `CartContents` from two callers. If
    `useId()` turns out not to work in this component, Build may pass a surface prefix down
    instead. The requirement is the property (distinct ids, each label paired with its own input),
    not the mechanism. Such a change is a recorded deviation in build notes.

- **`#1119` (repository half): `drift: false` when nothing was compared.**
  `emptyStatus()` (`lib/reference/reference-status-service.ts`) hardcodes `drift: false` beside
  `sources: []`, so a database that never answered reads as "compared, no drift". The same is true of
  a reachable database with zero datasets, where `[].some(...)` yields `false`. Every promotion
  record from PR #775 until 2026-10-16 cited that vacuous figure while the database was unreachable.
  - **The fix:** `drift` becomes `boolean | null`, and it is `null` exactly when `sources` is empty
    (unconfigured, unreachable, unmigrated, or reachable with no datasets). Otherwise it is the
    current boolean. `status: "ok"` and the never-fatal reference reporting in
    `app/api/health/route.ts` stay as they are. The issue calls that decision correct, and it is out
    of scope.
  - **Consumers:** traced at Spec. The only code reader of `ReferenceStatus` is
    `app/api/health/route.ts`, which serialises it. The only reader of `.drift` is
    `tests/reference-status-service.test.ts`. No staff page, script or workflow reads the field.
  - **The checklist half:** the Ship stage's "confirm the deploy" step (`specs/sdd-workflow.md`, Ship
    section, and `.claude/commands/ship.md` step 7) gains the real assertion. That is
    `reference.reachable === true` and a non-empty `reference.sources`, with an explicit statement
    that `drift === false` is not evidence of health. Today neither file says what to read from
    `/api/health` at all, which is how the vacuous figure became the habit.

- **Carry-forward:** the roadmap change-log row for the `#1135` promotion (PR #1164, merge
  `943efa0`, 2026-10-19), which `npm run sdd:audit` flagged as pending at this slice's Orient. The
  row is post-merge documentation that rides the next slice's branch, per the workflow.

**Deliberately excluded:**

- `#1152` (marketing sender): excluded by the owner at Gate 1. See above.
- Creating a missing `VendorConfig` row from anywhere, or a staff/admin surface to provision one.
  If a vendor-onboarding flow is ever built, that is where the row belongs.
- Changing `status: "ok"`, making reference variables required in production, or alerting on
  `reachable: false`. `#1119`'s "Why it stayed invisible" lists the missing alert as a cause. It is
  a separate decision and would need its own `/propose`.
- `#1123` (the reference write path points at a read replica). It is an owner credential action
  with no code change.
- Rewriting historical promotion records in `docs/model-handoff.md` or `specs/roadmap.md` that cite
  `drift: false`. They are dated evidence. The handoff already carries the "stop citing it" rule,
  and Document reconciles it to the new `null` shape.

**Open items carried forward:** none created by this slice. `#1119` closes with it: the credential
half was done on 2026-10-16 and this slice is the repository half.
