# P7 closeout — accessibility, RLS determination & guest data rights (validation)

**Before any row that touches a live database (R11, R16–R19):** confirm which Neon project you are
pointed at. Diff `.env` and `.dev.vars` against **both** `secrets/staging.vars` and
`secrets/production.vars` and confirm the host matches **staging** — two files agreeing with each
other is not evidence they are right, and at P5a they agreed perfectly on *production*
(`CLAUDE.md`, Config & secrets). Print keys, not lines: anchor greps as `^DATABASE_URL` so a
`BASE_URL` filter cannot echo the connection string with its password (#175).

**Anything touching Prisma runs under `npm run preview`, never `npm run dev`** — `next dev` cannot
load `@prisma/client/wasm` and renders a silent error state instead of failing loudly.

**Precondition for R15–R19: a guest order must exist.** `prisma/seed.ts` creates none — it writes
no row with a `guestEmail`, so there is nothing for the lookup to match out of the box. Before
running those rows, place one guest checkout end to end under `npm run preview` (signed out), or
add a fixture script that creates one. Record its order number, email, `totalPence` and `status`
before erasing — R19 compares against them.

| Req | How to verify |
|-----|---------------|
| R1  | Run `npx eslint --print-config components/cart/CartDrawer.tsx` and read the resulting `rules` object. Confirm at least 30 keys beginning `jsx-a11y/` are present; that every such key whose severity is not `off` reads `2` / `"error"` (**not** `1` / `"warn"` — six of them are already active as warnings today, so finding `jsx-a11y` keys present is not by itself a pass); and that `jsx-a11y/label-has-for` and `jsx-a11y/control-has-associated-label` both read `"off"` or `0`. |
| R2  | `npm test` — the cart-drawer accessibility test renders the drawer in its open state and asserts `getByRole("dialog")` succeeds, that the element's `aria-modal` is `"true"`, and that its accessible name is non-empty and equals the text of the heading whose `id` the `aria-labelledby` names. |
| R3  | `npm test` — the same test asserts: after open, `document.activeElement` is inside the drawer; firing `Tab` from the last focusable element moves focus to the first; firing `Shift+Tab` from the first moves focus to the last; and after invoking close, `document.activeElement` is the element focused before open. |
| R4  | `npm test` — the same test fires a `keydown` with `key: "Escape"` on the open drawer and asserts the `onClose` prop was called exactly once. |
| R5  | `npm test` — a test renders `CartDrawer` (populated state) and `CookieBanner`, collects every element matching `button, a[href], input, select, textarea`, computes each one's accessible name, and asserts none is empty. Assert the collection is non-empty first, so a selector that matches nothing cannot pass silently. |
| R6  | `npm test` — a test renders `CartDrawer` in the empty state and again in the populated state, reads every `h1`–`h6` in document order, and asserts no adjacent pair increases by more than one level. |
| R7  | `grep -n "color-action:\|color-accent:\|color-danger:\|color-action-hover:\|color-accent-hover:" design-system/tokens/tokens.css` shows the five values named in R7. Confirm `--color-brand-green`, `--color-brand-orange` and `--color-brand-red` still read `#4caf50`, `#f57c00` and `#d32f2f` — the brand kit is unchanged and only the semantic layer moved. |
| R8  | `npm test` — the contrast test parses `design-system/tokens/tokens.css`, resolves each `--color-*` through its `var()` chain to a literal hex, and asserts every declared pair is at least 4.5:1. Confirm the declared list has at least 17 entries (a short list would pass vacuously). Then confirm it can fail: set `--color-action` back to `#4caf50` in the working tree, re-run, see the `action on white` pair fail at 2.78, and revert. |
| R9  | `cat vitest.config.mts` shows a DOM environment configured for the accessibility tests (a `jsdom`/`happy-dom` environment, either globally or via a per-file docblock or `projects` entry). Then confirm the assertions really execute: temporarily delete `aria-modal` from `CartDrawer.tsx`, run `npm test`, and confirm R2's assertion **fails**. Restore the file and re-run to green. A test that cannot fail is not evidence. |
| R10 | `git diff specs/design-system.md` shows the five token changes recorded, with the primitives explicitly called out as unchanged. |
| R11 | `npx tsx scripts/rls-experiment.ts` against the **staging** Neon branch. Do not use `npx tsx -e` — a multi-line `-e` script that imports an installed package exits 0 with no output on this Windows setup (`CLAUDE.md`). Confirm `specs/2026-08-19-p7-closeout/rls-experiment.md` exists and contains the command run, the connection mode used, and the verbatim output — including whether a GUC set via `SET LOCAL` on one `PrismaNeonHttp` query was readable by the next. |
| R12 | `git diff specs/decisions/ADR-004-multi-tenancy.md` shows a new determination section, a `version:` value greater than `1.3.0`, and `updated: 2026-08-19`. Read the section and confirm it states an outcome and cites R11's recorded evidence rather than asserting the conclusion from reasoning alone. |
| R13 | Read R12's outcome first, then verify the matching branch. **If RLS rejected:** run the compensating check (a `npm test` case or a `npm run lint` rule) and confirm it passes; then confirm it can fail by removing a `vendorId` from one `lib/repositories/*` query in the working tree, re-running, seeing it fail, and reverting. **If RLS adopted:** `ls prisma/migrations/` shows the new migration and its SQL carries a comment naming what Prisma's schema language cannot express. |
| R14 | `npx eslint --print-config app/layout.tsx` still reports `no-restricted-imports` at severity `2` with `@/lib/db` in `paths` and `@prisma/client` in `patterns`. Confirm `git diff eslint.config.mjs` shows no removal or narrowing of that block. |
| R15 | `npm run preview`, then in a browser with **no session cookie** open `/orders/lookup`, submit the guest order number and matching email from the precondition, and confirm the rendered result offers a route to erasure. Follow it and confirm the erasure surface loads without a session. |
| R16 | Under `npm run preview`, signed out: submit the erasure form with (a) a valid order number and a **wrong** email, and (b) a **nonexistent** order number with any email. Confirm no erasure occurs in either case and that the message shown is identical in both — a reader must not be able to tell which half of the pair was wrong. |
| R17 | Under `npm run preview`, submit the erasure form 6 times inside 60 seconds from the same client. Confirm the 6th is refused as rate-limited. Then, with the limit already exceeded, submit a **valid** pair and confirm it is still refused — proving the throttle runs before the lookup rather than after it. |
| R18 | Against the **staging** database, read the target order's `guestEmail` and its `Address` row before erasing, using a real `.ts` file run with `npx tsx path/to/script.ts` (not `-e`). Run the erasure through the UI, re-read both rows, and confirm `guestEmail` is null and every redacted `Address` field matches P7b's `REDACTED` sentinel. Then read the erasure code path and confirm it calls `getPrismaWs()` inside `$transaction`, not `getPrisma()`. |
| R19 | From the same before/after read as R18, confirm the `Order` row still exists and that `totalPence`, `status` and `orderNumber` are identical to the values recorded in the precondition. |
| R20 | Load `/privacy` under `npm run preview` and confirm the rendered page describes the guest erasure route and states the one-order-per-request limit. Read the rendered page, not the source template. |
| R21 | `gh issue list --search "guest export"` returns the filed issue, and `gh project item-list 2 --owner sriahead --format json` includes it. `grep -n "guest export" specs/2026-08-19-p7-closeout/plan.md` shows the cross-reference. |
| R22 | Read `CLAUDE.md`'s repository-layer section. Confirm it references **#252**, records that nine facade factories in `lib/repositories/*` do not comply, and that any remaining mention of `getCartRepository` is qualified rather than presented as a location to copy. Do **not** grep for the absence of the string `getCartRepository` — the corrected text is expected to name it. |
| R23 | `npm run sdd:audit` no longer reports PR #250 as pending carry-forward, and `grep -n "b1d807f\|#250" specs/roadmap.md` returns the new row. |
| R24 | `grep -n "2026-08-19-p7-closeout" ARTIFACT_INDEX.md` returns the plan entry. `npm run kms:validate` exits 0. |
| R25 | `gh issue view 46 --json state` reports `CLOSED`. |
| R26 | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` completes successfully. This pipeline is **not** run by the `gates` workflow, so a passing app build is not evidence for this row (P7d, PR #245/#248). |
| R27 | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice's three parts. |
| R28 | `npm run lint && npm run typecheck && npm test && npm run format:check` all exit 0 locally, **and** the `gates` workflow is green on the PR. CI on Linux is the authority — a local `format:check` failure on untouched files is the `core.autocrlf` artifact described in `CLAUDE.md`, not drift. |
