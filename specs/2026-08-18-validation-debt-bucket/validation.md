# Validation debt bucket (validation)

## Before starting

- **This slice ships no Prisma migration.** Nothing needs `npm run db:migrate` before the write-path
  rows below. Stated explicitly because a validator following the standing instruction for
  migration-carrying slices would otherwise go looking for one.
- **Confirm which database the app is actually pointed at before trusting any live result.**
  `npm run preview` reads `.dev.vars`; `prisma`/inspection scripts read `.env`. Diff both against
  `secrets/staging.vars` — agreement between `.env` and `.dev.vars` is not evidence they are right,
  only that they match. A "staging-sounding" filename is not evidence the host is staging; only the
  host is.
- **DB-touching and rendered-output rows must run against `npm run preview`, never `npm run dev`.**
- **When stopping `npm run preview`, kill the whole process chain** (`npm` → `opennextjs-cloudflare`
  → `wrangler` → `workerd.exe` ×2) or the next build fails with `EBUSY` on `.open-next\assets`.
- **R24–R27 change a secret on shared staging infrastructure.** Do not begin them without the
  human's explicit confirmation at that moment, and do not leave the window open across a break.

| Req | How to verify |
|-----|---------------|
| R1  | Read `specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md`; confirm criteria are numbered `R1..Rn` sequentially. Diff against the pre-rewrite file (`git show origin/staging:specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md`) and confirm each of its R1–R8 obligations maps to at least one rewritten requirement; record the mapping in `build-notes.md`. |
| R2  | Read the rewritten `validation.md`; confirm it is a `\| Req \| How to verify \|` table, count its rows against the requirement count from R1, and confirm each `Req` cell resolves to a requirement in that file. |
| R3  | Read every row of the rewritten `validation.md` and confirm each names a command, a file property, or an observable behaviour. Any row whose only criterion is a comparison to the mockup fails this row. |
| R4  | Grep the rewritten P6.6 `requirements.md` for the wishlist requirement; confirm it is present, marked deferred, and cites an issue number. Run `gh issue view <that number> --json state` and confirm `OPEN`. |
| R5  | Read `build-notes.md`'s per-requirement table for P6.6; confirm every rewritten requirement has a satisfied/not-satisfied verdict and that at least one reads not satisfied. |
| R6  | With `npm run preview` running, load the storefront homepage in a real browser. Confirm each of the five header elements is present. Record in `build-notes.md` which were observed. |
| R7  | On the same page, confirm the tagline, a CTA control and the postcode form render. Submit a postcode matching a configured `deliveryPrefixes` entry and one that does not; record both response messages verbatim. |
| R8  | On the same page, count the merchandising rows and the product cards within each. Record the row titles and counts. A row rendering zero cards fails this row. |
| R9  | Inspect one rendered product card with a discount and one without. Confirm the element order image → name → unit label → price → discount indicator → quantity selector → add-to-cart, and that the discount indicator appears only on the discounted card. |
| R10 | Inspect the rendered department/category navigation; confirm each top-level category renders as a card or icon element, not a bare text link. |
| R11 | Point the browser at the second vendor host and load the same routes. Record vendor name, tagline, locality and search placeholder for both vendors side by side in `build-notes.md`. Vendor name and locality differing is required. For any other field that matches, check the seed (`prisma/seed.ts`) and state whether it is genuinely seeded identically or hardcoded in the component; an unexplained match fails this row. |
| R12 | With the browser devtools console open, hard-load the homepage and confirm zero CSP violation entries. Then search the rendered HTML for `<img` and confirm every `src` host is `'self'`, a `data:` URI, or `*.nocaped.com`. |
| R13 | Run a content search for `src="http` and `url(http` across `app/`, `components/`, `features/` and `lib/`; confirm no matches. |
| R14 | Read `specs/2026-08-13-p6.6c-operations-completion/requirements.md`; confirm numbered `R1..Rn` and that all four original sections are represented. Diff against `git show origin/staging:` of the same path to confirm nothing was dropped. |
| R15 | Read the rewritten `validation.md`; confirm the `\| Req \| How to verify \|` table shape and one row per requirement in order. |
| R16 | Read the rewritten navigation requirement; confirm it names required tabs as a subset rather than asserting a total count. Cross-check the named tabs against `components/staff/PanelNav.tsx`'s admin branch. |
| R17 | Read every row of the rewritten `validation.md`; confirm none is satisfied by a document's own claim. |
| R18 | Sign in as `demo-admin@example.com` against `npm run preview`; load `/staff`; record the full observed tab list verbatim and confirm it contains the nine required tabs. |
| R19 | Sign in as `demo-staff@example.com`; record the full observed tab list verbatim; confirm the four expected are present and the six forbidden are absent. |
| R20 | On `/staff` as each role in turn, record which overview cards render; confirm Reports is present for ADMIN and absent for STAFF. |
| R21 | Resize the browser to a 375px-wide viewport on `/staff`. In the console, read the nav element's `scrollWidth`, `clientWidth` and `offsetHeight`, and `document.documentElement.scrollWidth` vs `clientWidth`. Confirm nav `scrollWidth > clientWidth` (it scrolls), the nav height equals one row, and the document does not scroll horizontally. Record the four numbers. |
| R22 | For each role, follow every visible nav link and record the resulting HTTP status; confirm none is 404 and none renders an unhandled error. |
| R23 | As ADMIN, load `/staff/reports` and record the three metric values. Place an order for that vendor, reload, and confirm Total Orders increased by exactly one. Then request `/staff/reports` as `demo-staff@example.com` and record the actual refusal observed (rendered component and HTTP status). |
| R24 | Ask the human to confirm the window immediately before touching the secret. Record the confirmation and the window's start/end times in `build-notes.md`. Without a recorded confirmation this row and R25–R27 are reported unverified, not skipped silently. |
| R25 | Place one successful test-mode order against staging first and record its order number as the baseline. Confirm `secrets/staging.vars` contains a `STRIPE_SECRET_KEY` and read **only its first 8 characters** (anchor the pattern to `^STRIPE_SECRET_KEY=` — `DATABASE_URL` ends in `BASE_URL`, and a loose filter over an env file has already printed a Neon password here, #175). A `sk_test_`/`rk_test_` prefix proceeds; a `sk_live_`/`rk_live_` prefix halts #103's rows and is reported as a finding. |
| R26 | `wrangler secret put STRIPE_SECRET_KEY --env staging` with a deliberately invalid value. Attempt an order. Query the order's status, its `OrderStatusEvent` rows, and the product's `Inventory.quantity` before and after via a script against `DIRECT_URL`. Record all observed values; confirm `CANCELLED`, a matching event row, and quantity restored exactly. |
| R27 | Restore the real value with `wrangler secret put STRIPE_SECRET_KEY --env staging` from `secrets/staging.vars`, then place another order through to a successful payment. Record that order number. The window is not closed until this succeeds. |
| R28 | Read `build-notes.md`; confirm it states whether inbox delivery was confirmable and cites #104 if not. Run `gh issue view 104 --json state` and confirm it is still `OPEN`. |
| R29 | Run `npm run sdd:audit` and confirm its output lists each merged `staging → main` PR after the baseline with a per-promotion cited/not-cited verdict. The missing-row case is proven by R33's fixture-based tests rather than by editing the real `specs/roadmap.md` — mutating a tracked file to test a checker risks committing the mutation, and a fixture makes the case re-runnable. |
| R30 | Run `npm run sdd:audit` with `gh` made unavailable (e.g. an invalid `GH_TOKEN` or `gh` off `PATH`); confirm it prints a skip reason for the promotion check and does not fail on that account. |
| R31 | With the roadmap as committed, run `npm run sdd:audit` and confirm the most recent promotion is not reported as missing when no roadmap edit has happened since it merged. |
| R32 | Read `scripts/sdd-check.ts`; confirm the matcher accepts a PR number and/or a merge SHA and that the accepted forms are documented in the file. |
| R33 | Run `npm test` and confirm the promotion-matcher cases (cited, uncited, pending carry-forward) are present and pass. |
| R34 | `npm run sdd:audit` — exits 0. |
| R35 | Read the new case in `tests/loyalty.test.ts`; confirm all three assertions (REVERSAL row with correct `points`/`orderId`, no `LoyaltyAccount` write and no throw, second reversal refused). |
| R36 | `npm test` — exits 0. |
| R37 | List the issues filed during this slice; for each, run `gh issue view <n> --json state,projectItems` and confirm it is open and on Project #2 with a Phase. Confirm `build-notes.md` cites each. |
| R38 | `gh issue view 192 --json comments` — confirm a comment stating item 4's discharge and what was walked. |
| R39 | Read `specs/roadmap.md`; confirm a change-log row citing `specs/2026-08-18-validation-debt-bucket/` and bumped `version`/`updated` front-matter. |
| R40 | `git log origin/staging..HEAD --format=%B` and read every commit message; plus the PR body. Confirm no closing keyword sits immediately before #104, #113, #163, #169 or #174. Also run `gh pr view <n> --json closingIssuesReferences` and confirm it lists only the intended issues. |
| R41 | Run `npm run kms:build-index` as the final step after all front-matter edits and commit the result. Verify the way CI does — compare ignoring the generated footer line, since the footer cites the commit it was built from and a committed index can only ever cite its own parent. A bare `git diff --exit-code ARTIFACT_INDEX.md` will fail forever by construction and is not the check. |
| R42 | `npm run kms:validate` — exits 0. |
| R43 | Read `docs/gap-register.md`; confirm a row exists for each defect found (at minimum the CSP-blocked hero image and the missing wishlist link), each with a GAP-ID, a Status and a checkable citation, and that the front-matter `version` is bumped. |
| R44 | Read `specs/sdd-workflow.md`'s "Two machine checks" section; confirm it describes the promotion check and that front-matter `version`/`updated` are bumped. |
| R45 | Read `CLAUDE.md`'s `sdd:audit` line; confirm it names the promotion check and does not contradict `specs/sdd-workflow.md`. |
| R46 | `git diff origin/staging -- CHANGELOG.md` — non-empty. |
| R47 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` — all exit 0. On Windows, treat a `format:check` failure on files this slice did not touch as the `core.autocrlf` artifact until proven otherwise: check the committed blob (`git show HEAD:<file>`) with LF endings, from a directory where prettier resolves this repo's config or with `--config .prettierrc.json` passed explicitly. CI on Linux is the authority. |
| R48 | `npm run sdd:preclear` — exits 0. |

## Reporting

- Any row that cannot be checked in this environment is reported **unverified with the reason**,
  never quietly passed. R24–R27 are the likeliest to land there, since they depend on a human-
  confirmed window on shared infrastructure.
- CI (`gates`) is the real Gate 3. Do not report this slice done on local output alone.
