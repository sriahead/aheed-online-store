# P9.2 — Customer Feedback & Reviews (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *Every feature.* Isolated business logic, utilities, components.
2. **Integration Testing** — *Every feature.* The component against its immediate dependencies.
3. **System / End-to-End Testing** — *Critical user journeys and validation testing.*
4. **Regression & Acceptance Testing** — *Before release, or when changing core flows.*
5. **Performance & Resilience Testing** — *Before release, or for performance-sensitive APIs.*
6. **Security & Accessibility Testing** — *Before release, or earlier for auth, payments or UI changes.*

This slice adds a **public, session-gated write path** and new **UI**, so security and accessibility
checks run here rather than being deferred to release.

---

## Setup this validation assumes

Run once, from the repository root, before any row below.

1. `npm ci && npm run db:generate`
2. `npx prisma migrate deploy` against the **dev** Neon branch, then `npx prisma migrate status`
   reports no pending migration.
3. `npm run preview` in its own terminal. **Not `npm run dev`** — it cannot load
   `@prisma/client/wasm` and silently renders an error state for every database-backed row here.
4. Seeded accounts on the Aheed vendor: **the demo customer** (has a `DELIVERED` or `COLLECTED`
   order), **the no-order customer** (has none), a `STAFF` account and an `ADMIN` account.
5. When finished, kill the whole `node`/`workerd` process chain before running vitest or a build —
   stopping `npm run preview` does not stop it, and the next build fails with `EBUSY`.
6. `npx vitest run` is executed **alone**, never beside or straight after a build. Its forks pool
   silently fails to start workers in that situation, so whole files never execute and the run can
   still exit 0.

`scripts/verify-customer-feedback.ts` is the live prove-it script this slice adds, in the style of
`scripts/verify-data-rights.ts`. It prints one `R<n>: PASS|FAIL <detail>` line per check and exits
non-zero if any line reads `FAIL`. Rows below name the exact line to read, so a reader with no
memory of this work can run one command and compare against this table.

`staging...HEAD` in the git commands below means the slice's own diff. If the branch has been
rebased, substitute the merge base.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx prisma validate` exits 0; `grep -A5 "enum FeedbackStatus" prisma/schema.prisma` shows exactly `PENDING`, `APPROVED`, `REJECTED`. |
| R2  | Unit | `grep -A22 "^model CustomerFeedback " prisma/schema.prisma` shows every field named in R2, `@@unique([vendorId, userId])`, `@@index([vendorId, status, submittedAt])`, `onDelete: Cascade` on the user relation, `onDelete: SetNull` on the moderator relation. |
| R3  | Unit | `grep -A8 "^model CustomerFeedbackAttempt " prisma/schema.prisma` shows the four fields and `@@index([vendorId, ipHash, createdAt])`. |
| R4  | Unit | `grep -A12 "^model VendorReviewLink " prisma/schema.prisma` shows the listed fields, `@@unique([vendorId, platform])`, `@@index([vendorId, isActive, sortOrder])`. |
| R5  | Integration | `git diff --name-only staging...HEAD -- prisma/migrations/` lists files under exactly one new directory; `grep -i "drop index" <that dir>/migration.sql` returns nothing. |
| R6  | Unit | List the slice's changed files, drop `prisma/migrations/` **and the generated `app/(admin)/staff/runbook/docs.ts`**, then grep the rest for `$queryRaw\|$executeRaw\|$queryRawUnsafe` — expect no match. (`docs.ts` is excluded because `kms:build-index` embeds documentation prose that discusses raw SQL; it is not hand-written code.) Then `git diff staging...HEAD -- prisma/schema.prisma \| grep -E "^\+.*Json"` returns nothing. |
| R7  | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. Both walk `lib/repositories/` with no allowlist, so the three new files are covered by existing. |
| R8  | Unit | Same command as R7; both files report 0 failures. |
| R9  | Unit | `grep -n "getPrisma\|getPrismaWs" lib/customer-feedback-service.ts lib/customer-feedback-rate-limit-service.ts lib/vendor-review-links-service.ts` — every call is inside a function body and no top-level `const` holds a client. |
| R10 | Integration | Three steps, and the third is the only conclusive one. (a) `npx vitest run tests/customer-feedback-client-choice.test.ts` exits 0 — it pins which client each call site passes, as a tripwire. (b) `npx tsx scripts/verify-customer-feedback.ts --bulk-approve` prints `R10: PASS bulk approve completed over websocket client, 2 rows` and `R10: PASS bulk approve of an empty set is a no-op, not a crash`. **Note what (b) does and does not prove:** that script runs in Node against `PrismaNeon` over `DIRECT_URL`, which is *not* the Worker's HTTP adapter, so it proves the query shape and the zero-row case but cannot reproduce the HTTP-adapter crash. (c) **The conclusive step:** under `npm run preview`, sign in as staff, open `/staff/feedback` with two or more `PENDING` rows, and press "Approve all" — that is the only path that exercises the real runtime client split. A wrong client 500s there while (a) and (b) both pass. |
| R11 | Unit | For each `"use server"` file in `git diff --name-only staging...HEAD`, confirm by reading that every export is `async function`. Enforced only at runtime, so additionally confirm via R27 that each moderation action returns without a 5xx — a non-async export makes **every** action in the file 500 while build, typecheck and test stay green. |
| R12 | E2E | Signed in as the demo customer, open `/feedback` and confirm the form renders. Sign out, reload `/feedback`, confirm a sign-in prompt renders and no form fields are present. |
| R13 | Security | Under `npm run preview`: submit the form once as the demo customer with devtools open and copy that Server Action POST as cURL. Replay it **with the session cookie removed**. Confirm the response is not a success and that the `CustomerFeedback` row count is unchanged. Not covered by `verify-customer-feedback.ts` — that script calls the repository directly and so cannot exercise session gating at all. |
| R14 | E2E | Script prints `R14: PASS no-order customer accepted, verifiedPurchase=false`. |
| R15 | Security | Script prints `R15: PASS demo customer stored verifiedPurchase=true` and `R15: PASS client-supplied verifiedPurchase ignored` — the second posts `verifiedPurchase=true` as the no-order customer and asserts the stored row is still `false`. |
| R16 | E2E | Script prints `R16: PASS status=PENDING and comment absent from landing HTML`. |
| R17 | Integration | Script prints `R17: PASS second submission replaced existing row, count=1`. |
| R18 | E2E | Script prints `R18: PASS edit of APPROVED reset to PENDING, moderator cleared, comment removed from landing HTML`. **Treat a FAIL here as blocking** — this is the approve-then-edit moderation bypass. |
| R19 | Unit | `npx vitest run tests/validate-feedback.test.ts` exits 0, covering `0`, `6`, `4.5`, `""`, `"3"`; `grep -rn "parseRating" features/feedback/` shows it imported from `features/reviews/validate-rating`, not redefined. |
| R20 | Unit | `npx vitest run tests/validate-feedback.test.ts` covers empty, whitespace-only, exactly 1000 and 1001 characters, and confirms the cap is measured after trimming. Then under `npm run preview` submit a whitespace-only comment and confirm the form refuses it and writes no row. |
| R21 | Security | Under `npm run preview`, submit a comment containing `<b>bold</b>` and `[x](https://example.com)`, approve it at `/staff/feedback`, then `curl` the landing page. Confirm the body contains the escaped form (`&lt;b&gt;`) and that no `<b>` element originates from the comment. Read the HTML, not the rendered page — a browser displays escaped text and real markup identically once rendered. |
| R22 | Integration | Script prints `R22: PASS authorName stored as "<First> <I>."`. Confirm the stored value, not the rendered one — R38 covers the render. |
| R23 | E2E | `curl` the landing page and confirm an anchor to `/feedback` inside the feedback section; open the account area signed in and confirm a link to `/feedback`. |
| R24 | Security | `npx tsx scripts/verify-customer-feedback.ts --flood-writes` prints `R24: PASS 6th write within 10 minutes refused, 0 extra rows`. |
| R25 | Security | Same run prints `R25: PASS second write to same row within 60s refused, row unchanged`. Run this explicitly — limiting submit alone converts flooding into edit churn through the moderation queue. |
| R26 | Security | `npx tsx scripts/verify-customer-feedback.ts --dump-attempts` prints `R26: PASS all ipHash values are 64-char hex`. Also confirm by eye that no column added by this slice holds a dotted-quad or colon-separated address. |
| R27 | E2E | Signed in as the seeded `STAFF` account, open `/staff/feedback`: confirm `PENDING` rows sort first, then exercise approve, reject, un-approve, bulk-approve and saving an internal note, confirming each returns without a 5xx. |
| R28 | Security | `npx vitest run tests/panel-refusal-coverage.test.ts` exits 0 — it walks `app/(admin)/` on the filesystem with no allowlist and matches JSX element names on the parsed tree, so the new page is covered automatically and a correct comment with wrong code cannot pass. Then sign in as a plain customer, open `/staff/feedback`, and confirm a rendered refusal message rather than an empty shell. |
| R29 | Unit | `npx vitest run tests/staff-nav-parity.test.ts` exits 0; `grep -n "staff/feedback" components/staff/PanelNav.tsx "app/(admin)/staff/page.tsx"` returns a hit in both. |
| R30 | Regression | `grep -n -A40 "/staff/feedback" docs/staff-playbook/staff-tabs-guide.md` shows the section. Then read each capability sentence and point at the matching control on the rendered page. **No test covers this** — it is a read-and-trace step, and documented-but-absent capabilities have shipped here before. |
| R31 | Security | Read every signature from `grep -n "^export" lib/repositories/customer-feedback.ts`: no export reachable from a staff surface accepts `rating`, `comment` or `authorName`, and none creates a row. Script prints `R31: PASS no staff-reachable mutation of customer-authored fields`. |
| R32 | Integration | Script prints `R32: PASS approve stamped moderatedById and moderatedAt` and `R32: PASS rejected row retained`. |
| R33 | Unit | `npx vitest run tests/panel-token-purity.test.ts` exits 0. |
| R34 | Unit | `head -1 components/ui/CardStack.tsx` is `"use client";`; `grep -in "feedback\|review\|rating" components/ui/CardStack.tsx` returns nothing; `grep -n "@/lib/" components/ui/CardStack.tsx` returns nothing. |
| R35 | Integration | Script seeds a `PENDING`, a `REJECTED` and two `APPROVED` Aheed rows plus one approved row on the second vendor, then prints `R35: PASS only APPROVED rows rendered, vendor-scoped, newest first`. |
| R36 | E2E | Reject every approved Aheed row at `/staff/feedback`, then `curl` the landing page and confirm the string `What our customers say` is absent and no empty card container is rendered. The outbound review-link group is **expected to remain** — it is deliberately not part of this section (see R46). |
| R37 | Integration | With approved ratings of 4 and 5 present, `curl` the landing page and confirm the header shows `4.5` and a count of `2`. Script prints `R37: PASS header shows mean to 1dp and count`. |
| R38 | Security | `curl` the landing page with one approved row and confirm the card contains the rating, comment, `authorName` and a relative date, and contains no `@`-bearing string, no full surname, no order id and no `<img`. Script prints `R38: PASS card fields limited to the allowed set`. |
| R39 | E2E | With one `verifiedPurchase=true` and one `false` row approved, `curl` the landing page and confirm the badge text appears exactly once. Script prints `R39: PASS badge count matches verifiedPurchase count`. |
| R40 | Accessibility | In a real browser at desktop width: Tab to the stack and confirm it takes focus with a visible ring, then confirm Left/Right arrow keys change the front card. Tab on and confirm the previous/next controls are `<button>` with **different** accessible names — read the names from the accessibility tree, not the visual label; two identically-named controls are indistinguishable to a screen reader, which is why `HorizontalScroller` requires an `itemLabel`. Finally, confirm in the accessibility tree that **every** card's text is present and no card carries `aria-hidden` or `display: none`. (R40 was amended during build — see the note in `requirements.md`; do not validate against the original "every card is tabbable" wording.) |
| R41 | Accessibility | In the same session, inspect the container for `aria-roledescription="carousel"`, confirm each card's accessible name includes its position, and confirm advancing updates an `aria-live="polite"` region. |
| R42 | Accessibility | Load the landing page, leave it untouched for 60 seconds, confirm the front card has not changed. |
| R43 | Accessibility | Chrome DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`, reload, and confirm the section is a scrollable row with no transform animation on card change. The existing opt-out in this repo is class-scoped and misses 24 utility transforms, so check the actual transition, not just that a class is applied. |
| R44 | Accessibility | At 320px width confirm no horizontal page scrollbar and a non-zero gap between the section content and both viewport edges. |
| R45 | Performance | `curl -s <landing URL> \| grep -c "<approved comment text>"` returns at least 1 — the cards are in the server-rendered HTML. Confirm in DevTools Network that no XHR/fetch is issued for feedback after load. |
| R46 | E2E | With two active and one inactive Aheed `VendorReviewLink` rows, `curl` the landing page and confirm exactly the two active labels appear in `sortOrder` order; deactivate both and confirm the group is absent. Script prints `R46: PASS active links ordered; group absent when none active`. |
| R47 | Security | In the same HTML, confirm every external review anchor carries both `target="_blank"` and `rel="noopener noreferrer"`. |
| R48 | Security | On `/staff/storefront`, try saving a review link as `http://example.com`, then as `javascript:alert(1)`; confirm both are refused with a validation message. `grep -rn "parseSocialUrl" lib/` shows the review-link parser importing it rather than defining its own URL check — `new URL("javascript:alert(1)")` parses successfully, so a bare parse proves nothing. |
| R49 | Unit | Review-link CRUD is present on `/staff/storefront`. Then grep the slice's changed files under `components/` and `lib/` for `Google\|Trustpilot` and confirm **every hit is inside a comment** — three docstrings state that no platform is hardcoded, which is the rule being observed, not broken. No hit may be in executable code: no conditional, default, label or URL may name a platform. (R49 was clarified during build — see `requirements.md`; do not validate against the original "no file contains" wording.) |
| R50 | Integration | Submit feedback as the demo customer, run the data-rights export from the account area, and confirm the payload contains the rating, comment and submission date. Script prints `R50: PASS feedback present in export payload`. |
| R51 | Integration | Run the data-rights deletion for that customer; confirm the result reports a non-zero `feedbackDeleted` and the row is gone. Script prints `R51: PASS feedbackDeleted counted and row removed`. |
| R52 | Regression | `grep -in "feedback" "app/(storefront)/privacy/page.tsx"` shows the sentence naming first name, surname initial and rating. |
| R53 | Security | `git diff staging...HEAD -- next.config.mjs` shows no change to the `Content-Security-Policy` value. An untouched file is a pass. |
| R54 | Security | `git diff --name-only staging...HEAD -- components/consent/CookieBanner.tsx` returns nothing. |
| R55 | Regression | `git diff --name-only staging...HEAD \| xargs grep -lin "googleapis.com\|mybusiness\|places.googleapis\|trustpilot.com/api"` returns nothing; `git diff staging...HEAD -- package.json` adds no line under `dependencies`. |
| R56 | E2E | Under `npm run preview`, load Aheed's host — both the section and the link group render. Load the second vendor's host — neither renders. A real second-vendor load, not an inference from Aheed's result. |
| R57 | Accessibility | On the second vendor's host with one approved row seeded, read the section's computed accent colour in the browser and confirm it matches that vendor's palette. Check computed style, not `tokens.css` — `brandStyle()` injects inline custom properties that beat `:root`, and several colour checks false-positive against Aheed's values. |
| R58 | Regression | `npm run kms:validate` and `npm run kms:check-generated` each exit 0; `grep -n "p818-customer-feedback-reviews" ARTIFACT_INDEX.md` returns the plan row; `npm run kms:assemble:internal` succeeds and a real `next build` inside `kms/site-internal` succeeds. `gates` never builds the docs site, so this must be run by hand. |
| R59 | Regression | `git diff staging...HEAD -- CHANGELOG.md` shows an entry for this slice referencing `#818`. |
| R60 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — **run alone, after the preview server's process chain is fully stopped** — reports 0 failures. CI is ground truth: the `gates` workflow on the PR must be green. |
