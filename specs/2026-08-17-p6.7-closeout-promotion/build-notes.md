# P6.7 closeout & catch-up promotion (build notes)

Written at the end of Build, before the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

## What changed and why

**`scripts/demo-accounts.ts` — the fourth roster entry (R1, #190).**
Added `demo-store-admin@example.com` (platform `CUSTOMER`, vendor `ADMIN`) as the fourth
`DEMO_ACCOUNTS` element. The comment above the roster now explains *why* it has to exist rather
than just listing it: `requireVendorRole()` returns early with `via: "platform-admin"` for any user
whose `User.role` is `ADMIN` (`lib/auth-rbac.ts:63`), so `demo-admin`'s `vendorRole: "ADMIN"` is
dead weight that no code path reads. Every guard that defines the hierarchy — `roles.ts:42`,
`roles.ts:64`, and the `isSelfDemotion` branch of the self-lockout check — fires only when
`auth.via === "ADMIN"`, which no other account in the roster can produce. Without this account
`validation.md` §1.2 is not reachable at all, which is why it had never been walked.

Placed **fourth** (last) because R1 specifies the fourth element. Grouping it next to `demo-admin`
would read better, but array order has no functional effect (`addDemoAccounts` just iterates) and
following the spec beat a cosmetic deviation.

**`tests/demo-accounts.test.ts` — derived assertions (R2).**
The roster `toEqual` assertion now lists all four accounts. Three *other* assertions also hardcoded
the roster's shape and broke on the addition — the spec only anticipated the first:

| Assertion | Was | Now |
|---|---|---|
| membership roles | `["ADMIN","STAFF"]` | derived from `DEMO_ACCOUNTS` via `flatMap` |
| idempotent membership count | `toHaveLength(2)` | `DEMO_ACCOUNTS.filter(a => a.vendorRole).length` |
| `removeDemoAccounts` count | `toBe(3)` | `DEMO_ACCOUNTS.length` |

Derived rather than renumbered, so the next roster change doesn't break them again. Also added a
test asserting exactly one account is a vendor `ADMIN` who is not a platform `ADMIN` — that
property, not the literal list, is what §1.2 depends on.

**`specs/2026-08-14-p6.7-team-role-management/validation.md` (R9).**
All 29 checkboxes in §1 and §2 are now `[x]`, each annotated with what was actually observed
(error strings, DOM contents, row states) rather than a bare tick. The status blockquote is
rewritten and explicitly says it supersedes the previous "not walked live" text.

**`specs/Validation.md` → `docs/regression-tests.md` (R11).**
Moved and given front-matter (`id: regression-tests`, `type: doc`, `audience: [dev]`). It was
written during the ungated period at a top-level path with no front-matter, so it never reached
`ARTIFACT_INDEX.md`, and its name collided conceptually with every slice-local
`specs/<date>/validation.md`. Content preserved; added a provenance note and two "Last verified"
blocks recording that both of its regression scenarios were exercised on staging during this
slice's smoke pass.

**`specs/roadmap.md` (R12, R14).** Two miscited rows corrected and a new change-log row added.
Version `1.21.0` → `1.22.0`.

**Delivery board (R13).** #183/#184/#187 `Backlog` → `In Review` (all merged to staging);
**#185 `Done` → `In Review`** — it was marked Done but its fix is in the unpromoted range, so it was
never in production, which is exactly the semantics `Done` is supposed to carry; #176
`In Progress` → `Backlog` (nobody is working it). Added a **draft** item for P6.6, which shipped via
PR #182 with no issue and had no board presence at all.

### Neon host (R3)

`npm run demo:accounts -- add` targeted
`postgresql://neondb_owner:****@ep-empty-scene-zafjzeye.c-2.eu-west-2.aws.neon.tech/neondb`.

Verified before running, per `CLAUDE.md`: `.env`, `.dev.vars` and `secrets/staging.vars` all agree
on `ep-empty-scene-zafjzeye`, and `DATABASE_URL` is the same host with `-pooler`.
`secrets/production.vars` is `ep-young-glitter-zadlkttm` — the host `CLAUDE.md` warns about — and
was not touched. Issue #119's drift appears resolved.

### Live walk result (R4–R8)

All of §1.1–§1.4 and §2 passed on `staging.aheedfoodcentre.nocaped.com` (vendor Aheed Food Centre,
the oldest `ACTIVE` vendor, which is the one `addDemoAccounts` attaches memberships to). Detail is
annotated row-by-row in P6.7's `validation.md`. The two results worth repeating:

- The store admin's role `<select>` contained exactly `["STAFF","NONE"]` **in the DOM** — `ADMIN`
  absent, not hidden. Injecting an `ADMIN` option and submitting returned
  `Forbidden: Only a platform-admin can grant the Store Admin role.` with no write, so the guard is
  server-side and not merely a UI affordance.
- **The audit log wrote 6 rows for 6 successful writes and 0 rows for the 4 refusals**
  (baseline before the walk: 2 rows). The absence is the stronger half of the result — it shows the
  guards sit inside the `$transaction` rather than after a partial write.

Audit rows, actor ids masked, oldest first:

| Time (UTC) | Actor | Target | Transition | Step |
|---|---|---|---|---|
| 03:20:39 | `RAnoHx…AB` demo-admin | `FX83mI…aD` demo-customer | USER → ADMIN | §1.1 |
| 03:21:12 | `RAnoHx…AB` demo-admin | `FX83mI…aD` demo-customer | ADMIN → USER | §1.1 |
| 03:21:33 | `RAnoHx…AB` demo-admin | `FX83mI…aD` demo-customer | USER → STAFF | §1.1 |
| 03:22:05 | `RAnoHx…AB` demo-admin | `RAnoHx…AB` demo-admin | ADMIN → USER | §1.4 setup |
| 03:23:29 | `moXybt…1y` demo-store-admin | `FX83mI…aD` demo-customer | STAFF → USER | §1.2 |
| 03:23:48 | `moXybt…1y` demo-store-admin | `FX83mI…aD` demo-customer | USER → STAFF | §1.2 |

Every row carries the Aheed `vendorId` (`a4ed00…01`) and a populated `userId`.

**State restored afterwards:** `demo:accounts add` re-upserted `demo-admin`'s ADMIN membership, and
`demo-customer`'s leftover STAFF membership was deleted directly (not via `setVendorRole()`,
deliberately — routing cleanup through the app would have appended audit rows and muddied the
evidence above). Final state: `demo-admin` ADMIN, `demo-store-admin` ADMIN, `demo-staff` STAFF,
`p4b-staff-test` STAFF, admin count 2.

## Smoke pass

Covering the four slices that reached staging by direct push and never had a gated validation. All
against staging, 2026-08-17.

| Slice | Checked | Result |
|---|---|---|
| **P6.6** UI overhaul | Storefront home | **Pass** — vendor branding, hero + deliverability checker, promo bar, PromoSlider, category scroller, Staff Panel link in header |
| **P6.6** | Category page `/categories/household` | **Pass** — filters, product cards, ratings, quantity steppers |
| **P6.6c** ops views | `/staff` overview, `/staff/inventory` | **Pass** — dashboard cards; inventory lists 19 items with stock steppers and availability toggles |
| **P6.6c** | `/staff/orders` | **Pass** — renders with status filter, search, and per-order transition actions |
| **P6.6c** | `/staff/runbook` | **Pass** — 200, renders |
| **P7a** legal | `/terms`, `/privacy` | **Pass** — both 200, both linked in the footer |
| **P7a** cookie consent | consent state | **Partial** — `aheed_cookie_consent` cookie present from a prior visit and banner code in the DOM; the first-visit banner interaction was **not** re-exercised (see below) |
| **P7a** cart drawer | slide-over | **Pass** — item, free-delivery progress, stepper, delete, subtotal, both CTAs |
| **P3b/P3c** checkout | full path | **Pass** — £15 minimum-order guard fires at £3.29; order `AHE-20260817-3V492G` (£19.94) reached Stripe Checkout `cs_test_…` in Sandbox mode |
| **#187** cart mutation | 4 rapid (+) increments | **Pass** — settled at qty 5 / £16.45, no 500s, no reverts |
| **#187** cancel-restore | Stripe back arrow | **Pass** — returned to `/cart` with all 5 items; DB confirmed order `CANCELLED` and `Inventory.quantity` restored to 24 |
| **P6.5** self-review hardening | — | **Not covered** (see below) |

**Explicitly not covered** — all four items tracked on **#192**:

- **P6.5** got no targeted check. It is a self-review/hardening gate rather than a user-facing
  surface, and nothing in the smoke set exercises it distinctly from the slices around it.
- **A live staff order status transition.** The control renders on `/staff/orders`, but firing it
  sends a customer-facing delivery email (P4b) and the recipient could not be cheaply confirmed as
  a synthetic address. Deliberately skipped rather than emailing a real customer from a smoke test.
- **The first-visit cookie banner.** Re-triggering it means clearing the consent cookie, and
  accepting a consent banner is not an action to take on the user's behalf.
- **Per-slice validation of P6.5/P6.6/P6.6c/P7a against their own `validation.md` files.** Out of
  scope by the approved trade at Propose — smoke only.

## Decisions taken during the build

- **Walk on staging, not local preview.** Approved at Propose. #176 rejects real-browser sign-in on
  port 8787; staging runs on the default port with Cloudflare setting `x-forwarded-proto`, so the
  bug is unreachable there and no uncommitted patch to `lib/auth-origin.ts` was needed.
- **Injecting an `ADMIN` `<option>` to reach the refusal.** The UI offers no path to the guarded
  action, which is the point. Injecting the option and submitting the real form drives the actual
  server action the way a crafted request would, which is the only way to prove the *server-side*
  guard rather than the UI's politeness.
- **Probing `roles.ts:64` by assignment, not demotion.** §1.2's last row says "demote a
  platform-admin user", but `demo-admin` had no membership at that point (demoted during §1.4
  setup), so a demote would have hit the earlier `oldRole === newRole` guard and returned "already
  assigned" — masking the check under test. Assigning `STAFF` reaches `roles.ts:64` instead.
- **Cleanup by direct delete, not `setVendorRole()`.** Keeps the audit-log evidence for §2 clean.
- **A draft board item for P6.6, not a retrofitted issue.** `plan.md` excludes backfilling issues
  onto the ungated slices; a draft satisfies the board's status layer without inventing history.
- **Derived test assertions rather than bumped constants.** See the table above.
- **Scratch scripts run from `out/`** (gitignored, inside the repo so `node_modules` resolves).
  Removed before `typecheck`, since `tsc` picks up `out/` even though git does not.

## Deviations from the spec

- **R2 was implemented wider than its letter.** R2 only requires the roster `toEqual` assertion to
  list four entries. Three further assertions in the same file hardcoded the roster's shape and
  failed on the addition; all three were rewritten to derive from `DEMO_ACCOUNTS`. Fixing them was
  unavoidable (`npm test` fails otherwise); deriving rather than renumbering was the choice, and it
  is the root-cause fix.
- **§1.1's row order was inverted during the walk.** `validation.md` lists the `STAFF` grant before
  the demotion, but both need a plain `USER` starting state and one throwaway account was used for
  all three rows. Ran demote-then-grant so each assertion had its correct precondition. Same three
  transitions, recorded in P6.7's `validation.md`.
- **§1.2's platform-admin row was probed by assignment rather than demotion** — see Decisions.
- **R10's "admin order dashboard and a status transition" is partially covered.** The dashboard and
  the transition control were verified; the transition was not fired. Reason above.

## Known-shaky areas

- **R16–R18 are unverifiable at Gate 3.** They describe post-merge outcomes (promotion PR merged,
  `deploy-production` green, production `/api/health` `db.ok` true, issues closed). Both spec files
  flag them as Ship-stage. Report them **not yet applicable**, not failed.
- **`format:check` fails locally on 22 files, none of them touched by this slice.** Confirmed to be
  the `core.autocrlf` artifact the documented way: `git show HEAD:<file>` piped through `tr -d '\r'`
  and checked with `prettier --config .prettierrc.json` passes for all of them. CI on Linux is the
  authority and was green on PR #189. Note also that `*.md` is in `.prettierignore`, so none of this
  slice's markdown is prettier-governed.
- **The promotion is 51 commits across five slices**, four of which have only had a smoke pass.
  The residual risk is concentrated in P6.5, which got no targeted check at all. Tracked on **#192**.
- **`demo-admin`'s `vendorRole: "ADMIN"` is still dead weight.** It is never read because of
  `auth-rbac.ts:63`. Left in place deliberately — removing it is a behaviour question for the demo
  tool's own spec, and `plan.md` excludes it.
- **Staging carries test debris** unrelated to this slice: a "P5b validation fixture (1p, safe to
  ignore)" product with stock 9,981,738, a `p4b-staff-test@example.com` STAFF membership, and a
  product image on "Kitchen Roll, pack of 4" that is a cartoon colouring page. None affects this
  slice's results; none is in scope to fix.
- **Eleven orphaned debug scripts are tracked in the repo** (`test-*.js`, `parse-logs.js` at root
  and in `tests/regression/`). Found while confirming the `format:check` artifact. Filed as **#191**,
  deliberately not fixed here.

## Fix pass (R15)

First `/validate` run found R15 failing: `npm run kms:build-index && git diff --exit-code
ARTIFACT_INDEX.md` did not exit 0. The committed file's header line (`Last build: … · commit
cc15790 · 64 artifacts`) cited a commit two behind HEAD (`3f0bafc`) — `kms:build-index` embeds
`git rev-parse --short HEAD` at generation time (`kms/scripts/build-index.ts:24`), and the index
hadn't been regenerated since the `280fd6f` and `3f0bafc` commits landed. Content was unaffected
(still 64 artifacts, no row changes) — neither of those two commits touched a front-matter file —
so this was staleness in the header line only, not real drift.

Root cause, not the check: the fix is to actually do what R15's own instruction says — run
`kms:build-index` as the literal last file-content change before the branch's final commit, then
commit it. (The header will always cite the *parent* of whatever commit carries it — a file can't
embed its own future SHA — so this is the closest to current the check can ever be; it holds until
another commit lands.) Regenerated and committed as the last commit on this branch, immediately
before `/ship`. No observable behaviour changed, so no CHANGELOG entry.
