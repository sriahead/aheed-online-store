---
id: model-handoff
title: "Model handoff: repository orientation snapshot"
audience: [dev]
type: doc
status: approved
version: "1.145.0"
updated: 2026-10-27
visibility: internal
summary: "Concise project-state handoff for fresh-session recovery, covering current position, owner priorities, blockers, reconciliation gaps, and the volatile facts Orient must verify live."
tags: [handoff, orientation, roadmap, backlog, operations]
related: [claude-md, roadmap, sdd-workflow, architecture]
---

# Model handoff: repository orientation snapshot

> **Point-in-time handoff, not authority for volatile state.** This snapshot preserves the useful
> project-wide findings from the latest orientation. GitHub, Project #2, branches, deployments,
> environments and local work may have changed. Re-run **Fresh-session recovery** before acting.

## Scope And Ownership

This document answers **where the overall project stands now**. Keep only important current position
a fresh model would otherwise need to rediscover, and reference authoritative documents instead of
copying them.

- **Build Notes answer what happened in one slice.** Implementation decisions, changed areas,
  deviations, validation context and known-shaky areas stay in that slice's `build-notes.md`.
- **Authoritative documents answer what is permanently true.** Architecture, runtime, roadmap,
  operational rules and standing decisions are corrected at their source; this file points to them.
- **Final Document reconciles shipped reality.** It updates permanent documentation first and then
  this snapshot only when the completed work materially changed overall project state.
- **Orient answers what is true now.** It reads this snapshot for recovery and reverifies every
  volatile fact live before relying on it.

Do not append slice history here, reproduce the roadmap or CHANGELOG, or use this file in place of
Build Notes across the pre-validation Clear. Remove or replace stale information during
reconciliation. If overall project state did not materially change, leave this file untouched.

## Last Verified

- **2026-10-27 (Orient for `#1288`): PRODUCTION IS DOWN — Neon production project over quota (`#1289`).**
  Both vendor hosts' `/api/health` return 503 `degraded` at `2ffcb41` with Neon `HTTP 402 … exceeded the
  quota`; the storefront home page returns 500. Staging is healthy (separate Neon project). Began ~2026-10-26
  (the daily `fill-product-images` run on `main` first failed then). Owner action in the Neon console; no
  alert exists. **No promotion can succeed until it is fixed** (`deploy-production` migrates).
  - **Staging is 9 commits ahead of `main`** (`#1272`–`#1287`) including two migrations,
    `20261026150000_category_image_key` and `20261027080000_category_and_system_assets`.
  - **`#1288` (icon deactivate + circular `IconMedallion` + AI-replaceable icon inventory) is built on
    `feature/1288-icon-asset-medallion`, not yet validated or shipped.** Spec and build notes:
    `specs/2026-10-27-icon-asset-activation-and-medallion/`. ADR-008 is now v1.3.0 (Decision 6).
  - **Board drift found:** `#1283` and `#1285` are closed and `Done` though staging-only; `#1272`–`#1280`
    are open in `Backlog` though merged to staging. KMS slices `#1272/#1274/#1276` merged with no `specs/`
    folder (recorded in the roadmap change log). Reconciling the board is an owner call.
  - **`CHANGELOG.md` was a binary blob to git** (a UTF-16 row appended long ago added 113 NUL bytes, so
    `.gitattributes` never normalised it and it stayed CRLF). Fixed on the `#1288` branch; until that
    merges, any `CHANGELOG.md` edit still shows a whole-file diff. Write CHANGELOG entries with the Edit
    tool, never PowerShell — backtick escapes (`` `b``, `` `a``, `` `f``) had corrupted two entries.

- **2026-10-24, `#1223` icon system (all phases) & `#1239` colourful Noto Emoji icons: PROMOTED TO PRODUCTION (`main`, `bf4984a`).**
  Promotion PR #1241 ("Promote colourful Noto Emoji icon system to production (#1223, #1239)", merge `bf4984a`, `staging -> main`, 2026-10-24)
  promoted PR #1238 (`b422864`, `#1223` Phases 3 and 4a) and PR #1240 (`e703735`, `#1239`).
  `deploy-production` (run `40090911053`) and `deploy-docs-internal` (run `40090910992`) completed **success**.
  Production `/api/health` on both vendor endpoints (`aheedfoodcentre.nocaped.com` and `srimart.nocaped.com`) serves `bf4984a` with
  `db.ok: true`, `reference.reachable: true`, two `sources` and `drift: false`.
  Both issues `#1223` and `#1239` closed and moved to `Done` in Project #2.
  - **Noto Emoji icon system (#1239, ADR-008 v1.2.0):** 79 decorative and status icons in `ICON_REGISTRY` use colourful Google Noto Emoji
    (`@iconify-json/noto`, Apache-2.0). Automatic internal SVG ID namespacing (`id="ni-<semanticName>-<id>"`, `url(#...)`, `href="#..."`, `xlink:href="#..."`)
    in `scripts/lib/icon-build.ts` eliminates DOM ID collisions across inline SVGs. Compact functional UI controls (`chevron-*`, `arrow-*`, `x`, `plus`, `minus`,
    `check`, `loader-circle`, `search`, etc.) and the 1-to-5 rating `star` stay on Lucide (`currentColor`). Product card `FavouriteButton` renders
    `heart-outline` when unfavourited/signed-out and `heart` when favourited. Header search button retains the white outline `search` on dark background for contrast.
  - **`#1233` (WhatsApp offers page) and P11 catalogue safety & onboarding were promoted to production via PR #1237 (`71fced7`, 2026-10-24).**
  - **PR A's live gate `#1231` passed at `4dff9dae`:** R34 (10, 10, 7 pages) and R35 (5, 2) identical to BASE `6a09b001`; R37 client
    -42,750 B, Worker -48.77 KiB.
  - **P2a's live comparison passed (`#1227`, closed): 34 of 34 pages identical to BASE `6a09b001` on both
    vendors.** Phase 1's live rows passed too (`#1226`, closed). **Not read by any session:** staging
    `/api/health` at `87b1792` (a cloud session's proxy refuses the staging hosts); ask the owner to read it.
    A cloud session cannot run any live row (no `.env`/`.dev.vars`); the owner runs them with a local Claude
    Code session using the procedure in `specs/2026-10-22-icon-system/validation.md` "Setup".
  - **`scripts/verify-classname-parity.ts` skips nine files** (`tests/fixtures/classname-parity-allowlist.ts`):
    the five hand-migrated in P2a and four from P1, all because an icon was a component *value* at BASE. P2b
    runs it with `--require-migrated` and expects `0 not migrated`.
  - **BASE is still `6a09b001`** (the commit before PR #1225's squash) for any comparison against the pre-slice
    state. `../icon-base` was left in place on the owner's machine and in the last cloud session; recreate it with
    `git worktree add ../icon-base 6a09b001`. PR B's R65 needs a second worktree at `1a85d26`.
  - **`@iconify-json/lucide` is pinned to 1.2.122 on purpose** (the release matching the installed
    `lucide-react` 1.30.0; the newest redrew six icons). Bumping `lucide-react` means re-running
    `tests/icon-lucide-parity.test.ts` and probably moving that pin.
  - **The first audit's icon count was wrong: 102, not 141** (it also walked the `docs/ui-ref` mockups);
    `#1223`'s body still says 141. Scope any count of `lucide-react` usage to `app`, `components`, `features`
    and `lib` and parse with the TypeScript compiler, not a line grep.
  - **Demo accounts (`#1230`).** The dev demo passwords were rotated by hand on 2026-10-23 to a new value
    (kept in `.dev.vars`, the source of truth; `.env` must match). `scripts/demo-accounts.ts add` still never
    resets an existing password, reads `.env` while preview uses `.dev.vars`, and `remove` deletes every demo
    account (so do not use it to reset one). **Staging and production demo accounts were not touched and may
    still use a password that older spec notes record in plain text.** Details: `local-dev-playbook.md`,
    `env-setup.md`.
  - **Do not `npm install` a package in the cloud container and commit the lockfile as it comes out** (its
    npm 10.9.4 strips the `libc` markers from 68 platform packages). **A cloud session also cannot use `gh`'s
    GraphQL** (PR create, merge, checks, Project #2): see `specs/sdd-workflow.md` "Ship". Moving a board
    item needs the owner or a local session; the board is **not** updated for `#1223`, `#1226`-`#1230`.
- **2026-10-21, `#1186`/`#1187` Document (supersedes this entry's own "BUILT, NOT VALIDATED AND NOT
  MERGED" predecessor). The Quick Shop hub and the Regulars placeholder are IN PRODUCTION.** The
  programme's remaining two slices shipped as **one**,
  `specs/2026-10-20-p1186-1187-quick-shop-hub/`. Promotion PR #1194 merged as `098c224`
  (`staging -> main`, a true merge commit with two parents), closing exactly `[1186, 1187]`; both
  are `Done`. `deploy-production` run `39566151259` **success**. Production `/api/health` on
  **both** vendor hosts serves `098c224` with `db.ok: true`, `reference.reachable: true` and two
  populated `sources`; `/quick-shop` renders its `<h1>` and all four tile hrefs live.
  `npm run sdd:audit` exits **0** and `specs/roadmap.md` 1.171.0 carries both rows.
  **The Quick Shop programme is complete as specified** — `#1184` (photo/OCR) and `#1188`
  (favourites paging) were deferred out of it and remain open.
  - **The owner answered all three of this slice's open questions at `/propose` (2026-10-20), and
    they are recorded as comments on `#1186` and `#1187`**, not only in a conversation. Regulars is
    authenticated-only; the hub is static and shows all four tiles with the authenticated-only ones
    redirecting on tap; the hub replaces the header's direct link. Any earlier note that `#1187` is
    blocked is superseded.
  - **`#1187`'s own premise was partly wrong, and the correction is now a standing rule.**
    `/shop-your-list`'s "Your saved lists" block and `/account/lists` are not two list concepts —
    they are the same rows from the same `getShoppingListService().list()` call. The fix was one
    `<h2>`. Recorded in `docs/developer-portal/app-conventions.md` **1.19.0** as two rules: check
    whether the "other" thing is the same data before renaming a surface, and a link's label is its
    destination's own heading.
  - **The previous slice's carry-forward is DISCHARGED.** `#232`/`#1185`'s roadmap rows for PR
    #1189/#1190 had never been pushed and lived only on a local branch; `origin/staging` cited those
    two PRs **zero** times until `6e8bad1` landed. They are on `origin` now. The lesson generalises:
    a `docs/<slice>-document` branch that is never carried is invisible to `sdd:audit` run against
    the remote while still passing locally, so **check `git show origin/staging:specs/roadmap.md`
    rather than the working tree** when confirming a previous loop was documented.
  - **Validation found one real regression, and the shape of it is worth remembering.**
    `scripts/verify-mobile-layout.ts` identified the header link by `a[href="/shop-your-list"]`, so
    the repoint left it matching nothing and emitting `"shoppingList": null` — silently, because
    `null` reads as "no such link on this page". A dev instrument that identifies a UI element by
    URL breaks invisibly the next time that URL moves; it now matches on the **accessible name**,
    which two tests pin and which survived both repoints. Recorded in
    `docs/developer-portal/app-conventions.md`.
  - **Three issues filed rather than absorbed: `#1191`** (Favourites *and* Regulars are both absent
    from `components/account/AccountNav.tsx`, and `tests/account-nav.test.tsx` has no parity check
    against the pages on disk, unlike the staff-nav and page-container registries), **`#1192`**
    (the Regulars derivation, filed because `#1186` closed with the placeholder and the real feature
    would otherwise be untracked) and **`#1195`** (see below). All `P10`/`Backlog`, verified by
    GraphQL `node`.
  - **`#1195` SUPERSEDES THE HUB THAT JUST SHIPPED, by owner decision on seeing it live.** Quick
    Shop becomes a **three-tab section under `/account`** (`/account/quick-shop`, defaulting to
    Smart Lists), and **Value Bundles is dropped from the concept** — `/bundles` is untouched,
    public and still in the sitemap. The issue carries the two constraints that shaped it: a Quick
    Shop bar beside `AccountNav` would stack two navs on Favourites and Regulars, and the tile
    destinations were three different widths so a persistent bar would shift as you switch. **Two
    things remain undecided there** — whether Smart Lists keeps guest access (it is public today;
    `canSave` gates only *saving*, so moving it under `/account` makes paste-a-list sign-in-only),
    and whether `#1191` folds in, since both change `AccountNav`. Do not start it without those.
  - **Open board `High` items are unchanged: `#697` and `#1021`**, both owner/data actions. `#901`
    is still the one other `In Progress` item and still gates `#697`.
  - **RESOLVED: all five demo accounts now exist in the dev database**, `demo-srimart-admin`
    included (added 2026-10-21), after three consecutive slices whose two-vendor check was blocked
    by its absence. Two traps found while using them: **`scripts/demo-accounts.ts add` never resets
    an existing account's password** (it calls `signUp` only when the user is absent, so a
    `[reconciled]` line says nothing about the stored password), and **`.env` and `.dev.vars` hold
    DIFFERENT `DEMO_ACCOUNT_PASSWORD` values** — only `.dev.vars` works under `npm run preview`,
    and `.env`'s gives a clean `401` that looks exactly like a broken auth path. SriMart is reached
    at **`srimart.localhost:8787`** under preview (`lib/tenant.ts`'s host-with-port `VendorDomain`
    fallback, `#514`); there is no `SEED_SRIMART_HOST` in either env file.
  - **The production Neon credential rotation is STILL outstanding, and got worse on 2026-10-21.**
    Re-verified, not copied: the `production` GitHub environment's `DIRECT_URL` was last updated
    **2026-08-05T23:56:44Z**. All three steps remain (GitHub `DIRECT_URL`, the Cloudflare Worker
    `DATABASE_URL`, a Worker redeploy).
    - **A production `DIRECT_URL` was EXPORTED in the working shell during this session** — the
      live `#1134` condition. Nothing was run against it: every Node script in the validation pass
      was prefixed with `env -u DIRECT_URL -u DATABASE_URL`, and the host was diffed against
      `secrets/production.vars` before any of them. The Worker is unaffected either way (runtime
      reads `DATABASE_URL` from `.dev.vars` and never `DIRECT_URL`), so this is a **scripts-only**
      hazard — but it is why the check belongs before every Prisma or Node command, not once.
    - **The password was disclosed into a transcript a third time**, by a bare
      `printenv DIRECT_URL`. `CLAUDE.md` already says to check the **host only**
      (`echo "$DIRECT_URL" | grep -oE '@[a-z0-9.-]+\.neon\.tech'`); that rule exists precisely
      because the whole value leaks the credential. Rotation is now overdue on three disclosures.
- **2026-10-20, `#232`/`#1185` Document (supersedes this entry's own "built but not validated and
  not merged" predecessor, and the `#1180` entry's "Nothing is in flight").** **Favourites and the
  product card's single `+` are IN PRODUCTION.** Promotion PR #1190 merged as `4e53a68`
  (`staging -> main`, a true merge commit with two parents), closing exactly `[232, 1185]`; both are
  `Done`. `deploy-production` run `39477660839` **success**, and its log shows
  `20261020150000_p232_favourite` applied to the production database. Production `/api/health` on
  **both** vendor hosts serves `4e53a68` with `db.ok: true`, `reference.reachable: true` and two
  populated `sources`; `/account/favourites` answers 307. `npm run sdd:audit` exits **0**.
  `specs/roadmap.md` 1.170.0 carries both rows.
  - **The Quick Shop programme is BUILT OUT — superseded 2026-10-21, see the entry above this
    one.** This bullet's "one slice of three done" and the "`#1187` has an unanswered owner
    question" bullet that followed it are both **stale**: the owner answered all three questions at
    `/propose` on 2026-10-20, and `#1186` and `#1187` were specced and built together as one slice
    on `feature/p1186-1187-quick-shop-hub`. Combining them is what satisfies `#1187`'s own "must
    land LAST" constraint by construction, so the dead-tile hazard that bullet warned about cannot
    occur. `#1184` (reading a list from a photo) and `#1188` (favourites paging) remain deferred out
    of the programme and are **not** closed by it.
  - **Favourites is authenticated-only**, which resolved `#232`'s long-open guest question by owner
    decision. P6.6's **R6** (not R1, as `#232`'s own body claims) is amended on the record to accept
    the `/account` and hub entry points instead of a header control.
  - **Two standing hazards were added to `CLAUDE.md` this loop.** `migrate dev --create-only`
    **refuses on dev** (`#895`, reproduced verbatim) and offers only `migrate reset`, which drops
    every dev row — hand-author migrations instead, and note `prisma migrate status` gives no
    warning first. And the card's add control is now a single `+`, reversing `#956`.
  - **Validation ran twice and was NOT independent either time** — the same Opus 5 context built,
    fixed and validated the slice, by owner choice. Pass 1 failed with two findings worth
    remembering as patterns: a verification script that exercised the **wrong database adapter**
    (`PrismaNeon`/`P2002` instead of the shipped `PrismaNeonHttp`/`"23505"`) and reported
    `ALL CHECKS PASSED`; and a 2px control overlap invisible to a class-list check, because the
    card's skew renders those controls 46px wide rather than the 44px token assumed.
  - **Run `kms:build-index` after a slice's LAST doc edit, not before.** This slice ran it at Build,
    edited `specs/design-system.md` again at Fix, and left `app/(admin)/staff/runbook/docs.ts` stale
    while `ARTIFACT_INDEX.md` stayed current — the `#537` shape, caught only at validation pass 2.
  - **The production Neon credential rotation is STILL outstanding**, and the password was disclosed
    in session transcripts twice on 2026-10-20. Verified, not assumed: the `production` GitHub
    environment's `DIRECT_URL` was last updated **2026-08-05T23:56:44Z**. All three steps remain —
    GitHub `DIRECT_URL`, the Cloudflare Worker `DATABASE_URL`, and a Worker redeploy. Check the host
    only (`echo "$DIRECT_URL" | grep -oE '@[a-z0-9.-]+\.neon\.tech'`), never the whole value.
  - **`gh project item-list` lags its own writes** — it omitted a just-added item at `--limit 700`.
    Verify a board write with a GraphQL `node(id: "PVTI_…")` query instead.
  - **Open board `High` items are unchanged: `#697` and `#1021`**, both owner/data actions rather
    than code. `#901` is still the one `In Progress` item and still gates `#697`.
- **2026-10-20, `#1180` Document (supersedes the "`staging` is ahead of `main` by two slices"
  bullet below — it is stale).** `#1180` **and** `#1177` are **in production**, as are `#1169` and
  `#1173` before them. Promotion PR #1183 merged as `39b238d` at 2026-10-20T12:45:58Z, closing
  exactly `[1180]`; it is `Done`. `deploy-production` run `39424830450` succeeded. Production
  `/api/health` on **both** vendor hosts serves `39b238d` with `db.ok: true`,
  `reference.reachable: true`, `drift: false` and two `sources`, read three times per host.
  `origin/main` and `origin/staging` are **level** — `git log origin/main..origin/staging` is
  empty. `npm run sdd:audit` exits **0**.
  - **Nothing is in flight.** The next loop starts at `/orient`. `#1180`'s own Document rows are
    `specs/roadmap.md` 1.169.0 on branch `docs/p1180-document`, which under the carry-forward rule
    rides the **next** slice's branch rather than a PR of its own — merge or rebase it there before
    opening that slice's PR, or its roadmap rows never reach `origin`.
  - **Two unverified things shipped deliberately and are not defects to re-discover.** `#1180`'s
    validation was **not independent** (same session built and validated it, owner's choice), and
    SriMart's `/staff` overflow row is **unverified** because `demo-srimart-admin@example.com` is
    absent from the **dev** database (401). One command in a clean shell closes it:
    `npx tsx scripts/demo-accounts.ts add`. It is the second slice where a two-vendor check was
    blocked by local fixtures, so do this before the next UI slice rather than during it.
  - **A promotion to `main` is a MERGE commit, never a squash.** `e47466f` has two parents, as do
    the twelve promotions before it. Two `--squash` attempts on PR #1179 left it open; had one
    landed, `main` would have lost its parent link to `staging` and `4e265b2` would have read as
    unpromoted forever. Feature-to-`staging` PRs are still squashed. Use `gh pr merge <N> --merge`.
  - **Two standing rules changed.** A new `/staff/*` page is registered **once**, in
    `components/staff/nav-items.ts`, which feeds both app surfaces (`#1177`). And every page's
    top-level container is now `components/layout/PageContainer.tsx` with a required `width` of
    `wide`/`standard`/`narrow` (`#1180`) — a page must not hand-roll `mx-auto … max-w-… px-4`, and
    `tests/page-container.test.ts` fails if it does. `CLAUDE.md`,
    `docs/developer-portal/app-conventions.md` 1.18.0 and `specs/design-system.md` 1.23.0 carry
    both. Any older instruction to edit both nav surfaces, or to set a page width inline, is
    superseded.
  - **The local vitest signal on this machine lies under load.** At the default worker count a
    loaded machine produced 2-10 failures scattered across unrelated files, each 5-9 s for a
    trivial assertion, with the failing set moving between runs — and **reverting code made the set
    grow**. Use `npx vitest run --maxWorkers=4`; it returned the same tree to 286 files / 3583
    tests green. `--minWorkers` is not a valid flag. Recorded in `CLAUDE.md`.
  - **The exported production `DIRECT_URL` is now narrowed, not just observed.** It was set again
    this session (`ep-young-glitter-zadlkttm`, production) while `.env` and `.dev.vars` both
    correctly named dev. This is the **fourth** session. Newly ruled out: Windows `User` scope,
    Windows `Machine` scope, `env` blocks in any `.claude/settings*.json`, and the PowerShell and
    bash profiles. It is injected into the process by whatever launches the session; that is where
    to look next. The `printenv` + `env -u` rule in `CLAUDE.md` still covers it.
    **2026-10-20 additions.** `[Environment]::GetEnvironmentVariable` confirms `Process` scope only
    (`User` and `Machine` both empty), so a freshly launched session does **not** inherit it —
    which is why it keeps looking new each time. `Remove-Item Env:DIRECT_URL` in the user's own
    shell does **not** clear it for tool calls: each call spawns a child of the launching process
    and re-inherits. Until the launcher is found, the only reliable mitigation is prefixing
    `env -u DIRECT_URL -u DATABASE_URL`.
    **2026-10-21 additions (fifth session, `#1198`'s build).** Set again, same host. Nothing new
    about the launcher — but the **mitigation itself was nearly defeated**, and that is the durable
    part: `printenv DIRECT_URL DATABASE_URL` exits **non-zero when ANY named variable is missing**,
    so the combined form `CLAUDE.md` used to recommend printed the live production value *and* a
    "neither exported" all-clear when only `DATABASE_URL` was absent. A read-only query was one step
    from running against production on the strength of that. `CLAUDE.md`'s Config & secrets section
    now requires checking **one variable at a time** and never branching on `printenv`'s exit code.
    The guard shipped in `#490` (`scripts/lib/protected-hosts.ts`) refuses this host by name before
    any client is constructed, and was verified doing so against this exact exported value — so
    bulk-write scripts are now covered even when the human check is misread.
    **The production Neon password was disclosed in the 2026-10-20 session transcript** by a
    diagnostic that echoed the variable's value instead of masking it (the `#175` mistake, repeated).
    **Rotation is OUTSTANDING** and needs all three: the GitHub environment `DIRECT_URL`, the
    Cloudflare Worker `DATABASE_URL`, and a Worker redeploy — local `.env` alone is not enough.
    Treat the current production credential as compromised until that is done.
  - **Open board `High` items are still only `#697` and `#1021`**, both owner/data actions rather
    than code. `#901` is the one `In Progress` board item and gates `#697`: its production pilot
    left 25 PENDING net-content suggestions that nobody has accepted.
  - **`#1123` is the only dated failure.** `sync-reference-data.yml` on `main` is `cron: "0 4 3 * *"`
    and feeds `secrets.UK_LOCATION_REF_DIRECT_URL` into **both** reference keys (lines 86-87,
    110-111), so the first failing run is **2026-11-03**. Confirmed live: `UK_LOCATION_REF_DATABASE_URL`
    exists in **neither** GitHub environment although `deploy-staging.yml:55` and
    `deploy-production.yml:52` reference it. **Unresolved discrepancy:** the issue states the
    GitHub env secret was "deliberately left alone" during the 2026-10-16 credential update, but
    both copies of `UK_LOCATION_REF_DIRECT_URL` show `2026-10-16T09:14:30Z`/`:42Z`, 12 seconds
    apart — which reads as a scripted set on that day. Values are not readable. Settle this at
    Gate 1 before trusting the issue's "no code change needed" framing.
  - **Branch count is over the reminder:** 35 local, 35 origin (threshold 30). `/prune-branches` is
    a user-approved action and was not run.
- **2026-10-19, `#1161`/`#1162`/`#1119` Document pass (supersedes the "staging is ahead by exactly
  one slice" claim in the next bullet).** `#1135` **is in production**. Promotion PR #1164 merged
  as `943efa0`. `deploy-production` run `39236441711` succeeded and its log shows
  `20261019120000_p1135_custom_item_notes` applied. Production `/api/health` serves `943efa0` with
  `db.ok: true`, `reference.reachable: true` and two populated `sources`. `origin/main` and
  `origin/staging` were level at this slice's Orient: `staging` was at `6871d14`, and every commit
  missing from it was a promotion merge. PR #1164 closed exactly `[1028, 1029, 1031, 1135]`, and
  all four are `Done`. The row is `specs/roadmap.md` 1.162.0.
  - **Promoted the same day:** PR #1168 (`a182d6d`) took `#1161`/`#1162`/`#1119` to production.
    `deploy-production` run `39250801069` succeeded, and the PR closed exactly
    `[1119, 1161, 1162]`. `main` and `staging` were level at `a182d6d`/`f2281b7` at the next
    Orient. The row is `specs/roadmap.md` 1.164.0.
  - **`staging` is ahead of `main` by two slices.** First, `#1169` (PR #1171, merge `d5a7e36`,
    `specs/2026-10-19-p1169-search-footer-polish/`): search selector "All" with subcategories,
    `/search` subcategory pills, footer contact icons, Simple Icons payment logos and the Quick Shop
    `x2` example. `deploy-staging` succeeded and both staging hosts serve `d5a7e36` healthy.
    `#1169` is `In Review`, with no promotion PR yet, and its validation was not independent.
    Filed `#1170`: the staff category pickers can drop a subcategory that sorts before its
    department.
  - Second, `#1173` (PR #1174, merge `265fa01`,
    `specs/2026-10-19-p1173-search-heading-selector/`): the category search heading and
    highlights, the compact styled selector, the round Sign In icon, and a collapsible sidebar with
    one more product column (an owner-approved odd-column exception in `specs/design-system.md`).
    `deploy-staging` succeeded, and both staging hosts serve `265fa01` healthy. `#1173` is
    `In Review`, and its validation was not independent. Neither slice has a promotion PR yet. One
    promotion PR can carry both, with one `closes #N` line per issue.
  - `#1152` was excluded by the owner at Gate 1 until `#104` is closer. `#1165` was filed:
    alerting when the reference database stops answering.
  - **`/api/health`'s `reference.drift` is `null` whenever nothing was compared** (on staging now,
    and in production after promotion). The Ship stage asserts `reachable` plus a non-empty
    `sources`.
  - **The production `DIRECT_URL` was exported in the session environment again** at this
    Orient. That makes three sessions running; its source has still not been found.
  - **Owner actions now live in production:** tick Aheed's note-taking categories (`#1135`); set
    `WORKERS_AI_PLAN=paid` if the account is on Paid (`#1028`). The `#1134` actions are unchanged.
    `#1123`'s deadline is 2026-11-03.
- **2026-10-19, `#1135` Document pass (supersedes the "`main` is stale" bullet below).** `main` is
  at `dc15145`: the PR #1155 promotion of `#1134`, with `deploy-production` run `39168968302`
  successful and production `/api/health` showing `db.ok: true`. **`staging` is ahead by exactly one
  slice**: PR #1160 (`#1135` item notes, plus `#1028`/`#1029`/`#1031`, the AI plan mode, the AI
  Allowance page and the backfill refusal tone). It merged as `3bbfa47`. `deploy-staging` (run
  `39227084041`) succeeded and applied `20261019120000_p1135_custom_item_notes` to staging, and
  staging `/api/health` shows `3bbfa47`. There is no promotion PR yet. Record: `specs/roadmap.md`
  1.161.0.
  - **The session environment exports the production `DIRECT_URL`.** This was seen at `#1134`
    (where it migrated production) and again at `#1135`, where it was caught before any Prisma
    command ran. `CLAUDE.md`'s `printenv` rule covers it; the variable's source (shell profile or
    Windows environment) has not been found or removed.
  - **The auto-mode classifier blocks `prisma migrate deploy` even against dev, and blocks
    `gh pr merge`.** Hand both over as `!` commands. For the migration, use the
    `env -u DIRECT_URL -u DATABASE_URL` prefix, after a `migrate status` whose datasource line names
    dev (`ep-dry-morning-zab7dx08`).
  - **Owner actions:**
    - `#1134`, now in production: switch Rewards off for Aheed at `/staff/loyalty`. Switch
      marketing consent on at `/staff/storefront` only after a legal read of the wording.
    - `#1135`, after promotion: tick the Aheed categories that should take item notes. Nothing
      accepts notes until then.
    - `#1028`: if the Cloudflare account is on Paid, set `WORKERS_AI_PLAN=paid` on staging and
      production. Until then both run Free mode (a shared 10,000-neuron cap per UTC day).
    - Approve deleting the unmerged, superseded `docs/p1142-merged-handoff` branch (`#1149`).
  - **Still open:**
    - `#1152`: consent-checked marketing sending.
    - Board High items `#697` and `#1021`, both owner-gated.
    - `#1123`: the reference write path fails from 2026-11-03.
    - `#1156` (owner: privacy wording for item notes), and `#1157`–`#1159`, `#1161` and `#1162`
      (`#1135` follow-ups).
- **Date:** 2026-10-16 (re-verified at the `#1045`/`#1043` Document pass; previously at the
  `#1119` credential reset, and before that the PR #1118 / PR #1120 roadmap-and-handoff
  reconciliation).
- **`main` is at `763bf37`**, the PR #1122 promotion ("Promote docs to main", `staging -> main`,
  2026-10-16) — **documentation and CI-comment only**, no code, schema, migration or dependency
  change. It carried PR #1120 (`76accba`) and PR #1121 (`cc7ec43` + `5c3c553`). It closed **no**
  issues, deliberately: `closingIssuesReferences` was empty because every issue involved had
  already closed and `#1119`/`#1116` had to stay open, confirmed by a sweep of every issue closed
  that day. Production `/api/health` (Aheed **and** SriMart) serves `763bf37`, `db.ok: true`.
  **`origin/main` and `origin/staging` are NOT level — `main` is stale.** `git log
  origin/main..origin/staging --first-parent` shows PR #1124 (docs only), #1127 (`#1045`/`#1043`),
  #1128 (its Document pass), #1130 (`#1090`/`#1091`) and #1141 (`#1131`, slice A, merge `4f1cc9a`,
  2026-10-17, `deploy-staging` success) ahead of it. None has a promotion PR yet; see
  `specs/roadmap.md`'s change log for each.
- **Previous promotion: `6ec8142`**, PR #1118 (`staging -> main`, 2026-10-16): the honest
  consent banner, cookie settings and hashed-IP disclosure (`#1107`/`#1041`, PR #1114, merge
  `cc46827`), carrying PR #1117 (merge `29ab582`, that slice's own Document pass);
  `specs/2026-10-15-p1107-1041-privacy-consent/`. No schema change, no migration.
  `deploy-production` (run `38848633448`) and `deploy-docs-internal` (run `38848633429`) both
  **success**. Production `/api/health` (Aheed **and** SriMart) serves `6ec8142`, `db.ok: true`,
  read 2026-10-16. `closingIssuesReferences` listed exactly `[1041, 1107]`; both closed, the board
  moved itself to `Done`, and a sweep of every issue closed that day found no unintended closure
  (`#1115` had closed earlier, at the Document pass, with `scripts/verify-mobile-layout.ts`
  evidence). **Verified live in production beyond the health check, on both vendors:** Cookie
  settings twice per host (footer Legal row, end of `/privacy#cookies`); the three retention
  figures (90 days, 90 days, one hour) each followed by "removed by routine clean-up after that",
  six occurrences; and zero `aheed_`-prefixed storage keys on SriMart's page. `#1116` stays open on
  `P10`/Backlog: a `validation.md` wording defect (R22 says "axe", which this repo has no test
  dependency for). PR #1118's "row pending carry-forward" flag from `sdd:audit` is **resolved** —
  recorded in `specs/roadmap.md`'s change log here.
  - **`reference.drift: false` is NOT evidence of health. Stop citing it.** The rule stands even
    though the outage behind it is fixed, because the vacuous reading returns the moment the
    database is unreachable again. `emptyStatus()`
    (`lib/reference/reference-status-service.ts:66`) hardcodes `drift: false` beside an empty
    `sources`, so "compared, no drift" and "never asked" are indistinguishable, and every promotion
    record from PR #775 until this one cited that figure while the database was unreachable.
    **Assert `reference.reachable === true` AND a non-empty `sources`, never `drift === false`.**
    **`#1119` stays open** for its two repository items (honest `drift`; the promotion-checklist
    assertion) — the credential half is done.
  - **The reference database is RESOLVED and address lookup is live again (2026-10-16).** Earlier
    the same day this Orient measured `configured: true, reachable: false, sources: []` on staging
    **and** production with `password authentication failed for user 'neondb_owner'` proven
    locally. The owner reset the credential and repointed all four env files at **one** endpoint —
    staging/dev and production previously used *separate* Neon projects
    (`ep-wild-violet-zaa9udu5`, `ep-summer-boat-zapzp2t9`) and now share one. Verified
    byte-identical across all eight slots (two keys x four files);
    `scripts/verify-reference-coverage.ts` exits `0` (MK 16,215 postcodes / 9,989 places, RG
    23,816 / 13,483, both datasets `SUCCEEDED`, `missing=[]`). **Measured live on all four vendor
    hosts, not inferred from the secret change:** `reference.reachable: true` with two populated
    `sources` on staging and production, and `/api/address/lookup?postcode=MK10 0AA` returning
    `DELIVERABLE` with coordinates `52.031738, -0.687` and two street suggestions on both Aheed
    hosts — the PR #775 known-good state, with `UNVERIFIED` gone everywhere. SriMart returns
    `valid: true` with the same coordinates but `OUTSIDE_DELIVERY_AREA`: the per-vendor delivery
    rule working (ADR-004), **not** a reference failure.
  - **The replacement endpoint is a read REPLICA, so the write path is broken on a timer —
    `#1123`.** `pg_is_in_recovery()` is `true` there, and `UK_LOCATION_REF_DIRECT_URL` is what
    `ref:migrate` and the bulk import write through, so the `0 4 3 * *` sync fails from
    **2026-11-03** until that key points at the **primary** (un-pooled, no `-pooler`). **No code
    change is needed:** `prisma/reference/schema.prisma` and `lib/config.ts:222` already split
    pooled-runtime from direct-write, and `lib/reference-db.ts` reads only the pooled key over
    `PrismaNeonHttp` with zero writes anywhere in `lib/reference/` — a replica suits the runtime
    path exactly. The owner must read the primary's URL from the Neon dashboard; the GitHub
    environment secret was deliberately **left unchanged**, because it is write-only and
    overwriting it would destroy the last stored record of the previous primary.
  - **These Workers use versioned deploys, which changes how a secret rotation works.**
    `wrangler secret put` **refuses** while an undeployed version exists — "the latest version of
    your Worker isn't currently deployed" — so it reads as a secrets problem when it is a
    deployment one. A dashboard secret edit creates a version without deploying it; finish with
    `wrangler versions deploy <id> --env <env>`, which ships the waiting version's credential with
    no code change. Production hit the first path and staging the second on 2026-10-16.
  - **PR #1120 has since reached `main` inside the PR #1122 promotion, so `staging` is no longer
    ahead:** PR #1120 (merge `76c1ecb`, commit
    `76accba`, 2026-10-16) carried the SriMart local sign-in note out of the stale PR #1105, which
    is now **closed** as superseded by PR #1110. `docs/developer-portal/local-dev-playbook.md`
    1.28.0 holds the note (`x-forwarded-proto: http` against `403 INVALID_ORIGIN`, because
    `resolveAuthOrigin` infers `https` for any non-loopback host; the Better Auth `429` window,
    about 30 seconds; `MSYS_NO_PATHCONV=1` for a bare `"/"` in Git Bash), measured for a
    customer account only — a second vendor's **admin** sign-in stays unproven. Read live on the
    internal docs site at `/dev/runbook/local-dev-playbook`. The owner question this file carried
    from 2026-10-15 ("closing it and carrying the note forward") is therefore **answered and closed
    out**. `docs/p1101-1034-document` is **gone**: the 2026-10-16 `/prune-branches` run found it
    merged after all and deleted it, so the earlier note here calling it unmerged was wrong. That
    run took branches from 56/55 to **local 18, origin 17**, below the reminder threshold, and left
    all five REVIEW entries untouched.
- **Previous promotion, `dac5a3d`**, the PR #1111 promotion (`staging -> main`, 2026-10-15),
  carrying the PR #1110 promotion-record docs. Its predecessor **`7a99caf`** (PR #1109,
  2026-10-15) promoted vendor-neutral storage keys and the consent-gated referral cookie
  (`#1080`/`#1065`/`#1066`, PR #1108) and loyalty-off referrals (`#1101`/`#1034`, PR #1104).
  PR #1111's own `sdd:audit` carry-forward flag was resolved at the `#1107`/`#1041` Document pass.
- **Previous promotion, `3b94f8f`** (full `3b94f8fb7e25abf59f8dccb0c1f1015261b94b84`), the PR #1099
  promotion (`staging -> main`, 2026-10-15): department spotlights and the vendor-neutral banner
  prompt (`#1096`/`#1030`, PR #1097, merge `07128a8`;
  `specs/2026-10-14-p1096-1030-department-spotlights/`), carrying the docs-only PRs #1094, #1095 and
  #1098. No schema change, no migration. CI green on PR #1099; `deploy-production` (run
  `38686460635`) and `deploy-docs-internal` both **success**. Production `/api/health` (Aheed
  **and** SriMart) serves `3b94f8f`, `db.ok: true`, `reference.drift: false`.
  `closingIssuesReferences` listed exactly `[1030, 1096]`; both closed and `Done`, the only issues
  closed since the merge. **Verified live in production beyond the health check:** Aheed's homepage
  carousel names all 13 departments and SriMart's both of its 2, with zero `Browse the full range.`
  fallbacks. **`origin/main` and `origin/staging` are level** apart from this promotion record's
  own docs PR. Not a phase closure (`P10` stays open).
  - **`#901` still shows `In Progress` on the board** although its stated pause (pending `#928`)
    lifted when `#928` closed on 2026-09-28. It is an owner-run production pilot, so its status is
    the owner's to set — do not read it as live engineering work.
- **Previous promotion, `c3327e4`** (full `c3327e46c5cbd3b6f15672fca8abd0c287d4878c`), the PR #1093
  promotion (`staging -> main`, 2026-10-14): delivery intent, skipped shop-list lines and privacy
  copy (`#1087`/`#1088`/`#1089`, PR #1092, merge `2efd98b`), carrying PR #1086. No migration.
  `deploy-production` (run `38602854895`) **success**. `closingIssuesReferences` listed exactly
  `[1087, 1088, 1089]`. **Verified live:** `/privacy` carries the purpose-first cookie copy with zero
  `<code>` elements.
  - **This entry's predecessor (`c903f15`, below) had gone three promotions stale** — `#1069`
    (`8bb2a6b`), the footer/privacy cookie list (`b38b0f1`), and collection minimum/banner/referral
    copy plus the quick UI fixes (`624ffbc`) had all already reached production without a Last
    Verified update. Each is correctly recorded as its own "DONE, in production" bullet further down
    this section and in `specs/roadmap.md`'s change log — this note exists so a fresh session does
    not read the gap as those slices being unshipped. Not a phase closure (`P10` stays open).
- **Previous promotion, `c903f15`** (full `c903f153b171af9825ac2fe886ab6c874e0c7d97`), the PR #1053
  promotion (`staging -> main`, 2026-10-11): the help assistant follow-ups `#1049`/`#1051`/`#1052`
  (PR #1050, merge `c960ae1`), carrying PR #1048 (the `#1015`/`#1014` promotion record). No schema
  change, no migration. CI green on PR #1053; `deploy-production` (run `38170438220`) and
  `deploy-docs-internal` (run `38170437719`) both **success on the first attempt**. Production
  `/api/health` (Aheed **and** SriMart) serves `c903f15`, `db.ok: true`, `reference.drift: false`.
  **`origin/main` and `origin/staging` are level** apart from this slice's own Document PR.
  - **Verified live in production:** Aheed has the assistant **on**: `/help` shows the new
    **Open the help assistant** card and the floating button shows the assistant with no WhatsApp
    icon. SriMart has it off with a WhatsApp number set, so both surfaces show
    **Message SriMart on WhatsApp**.
  - `closingIssuesReferences` listed exactly `[1049, 1051, 1052]`; all three closed and `Done`, the
    only issues closed since the merge. No promoted commit message carried a closing keyword.
  - Not a phase closure (`P10` stays open).
- **Previous promotion, `0311425`** (full `0311425acf3ccc20770c840d1c2c495b41c59038`), the PR #1047
  promotion (2026-10-11): chatbot slice 3, the guided help assistant and conversation log
  (`#1015`/`#1014`, PR #1044). **One additive migration**
  (`20261011120000_p1015_1014_help_assistant`), applied by `deploy-production` (run
  `38156203995`) **on the first attempt**. `closingIssuesReferences` listed exactly `[1014, 1015]`.
- **Previous promotion, `dadca17`** (full `dadca173535d46a039ddbf9d610535c6cece1450`), the PR #1039
  promotion (`staging -> main`, 2026-10-11): the public docs boundary and the loyalty-gated Rewards
  launcher (`#1022`/`#1023`, PR #1036, merge `3c34d95`), carrying PR #1038. No migration.
  `deploy-production` (run `38129431081`) **success on the first attempt**. Verified live as a
  before/after: SriMart's Rewards launcher went from present to absent, Aheed's stayed, and neither
  `/help` contains internal article titles. `closingIssuesReferences` listed exactly
  `[1022, 1023]`.
- **Previous promotion, `a0ea21e`** (full `a0ea21e348218a97110ccc459d7c02beef9adcaa`), the PR #1033
  promotion (`staging -> main`, 2026-10-10): chatbot prerequisites slice 2 — configurable Workers
  AI model ids, a dated degradation signal and per-vendor AI metering (`#1016`/`#1017`, PR #1032,
  `162b38e`). **One additive migration** (`20261010150000_p1016_1017_ai_usage_metering`, no
  `DROP`), now applied in production. CI green on PR #1033; `deploy-production` (run
  `38084709126`) and `deploy-docs-internal` (run `38084708843`) both **success on the first
  attempt**. Production `/api/health` (Aheed **and** SriMart) serves `a0ea21e`, `db.ok: true`.
  `closingIssuesReferences` listed exactly `[1016, 1017]`; both closed, and the post-promotion
  issue-state check found **no unintended closure** this time — `#1022`, `#1023` and the follow-ups
  `#1027`–`#1031` are all still open. Per-vendor
  metering is live in production with every vendor on the default 3,000-neuron daily budget. Not a
  phase closure (`P10` stays open).
- **Previous promotion, `b1dd2d4`** (full `b1dd2d4f112b231cb551e4175c3224a15f32dfc1`), the PR #1025
  promotion (`staging -> main`, 2026-10-10): chatbot prerequisites slice 1 — the Help Centre
  computes its own delivery/collection/loyalty facts and a per-vendor approved-answer corpus
  (`#1013`/`#1012`, PR #1024, `ad16a5c`/`20f708b`), carrying the already-merged PR #1020 docs
  reconciliation. **One additive migration** (`20261010120000_p1012_vendor_faq`, new `VendorFaq`
  table, no `DROP`). CI green on PR #1024 and PR #1025 (`docs-gates`, `quality/kms`,
  `quality/quality` all pass on both); `deploy-staging`/`deploy-docs-internal` and
  `deploy-production`/`deploy-docs-internal` all **success on the first attempt**. Production
  `/api/health` (Aheed **and** SriMart) serves `b1dd2d4`, `db.ok: true`, `reference.drift: false`.
  - **Not a phase closure.** Both issues sit under `P10`, which stays open; `#697` and other P10
    items are unaffected, so `/discover` → `/learn` → business case does not apply.
  - **Verified live in production, beyond the health check:** SriMart's (`loyaltyEnabled: false`)
    `/help` carries zero loyalty/points/rewards wording of its own and no "collect" content, and
    the public shopping guide now renders in place of the internal operations document `#1022`
    had been serving there — `PENDING_PAYMENT`, "Known Trap" and "Order & Fulfilment Operations"
    are gone from that route, "Guest Checkout" (the public guide's own content) is present.
  - **`closingIssuesReferences` on the promotion PR listed exactly `[1012, 1013]`, and both closed
    on the merge — but `#1022` ALSO auto-closed**, a side effect of an adjacency in the already-
    merged build commit `ad16a5c`'s own message (a closing-keyword word immediately next to its
    number — GitHub's scanner reads every commit on the default branch, not just the PR's own
    body, and doesn't parse context). Caught within minutes by the routine post-promotion
    issue-state check, **reopened with an explanation**, board status corrected `Done` → `Backlog`.
    `#1022` carries real undone follow-up work (see Risks And Blockers) and must stay open until
    that lands — this is now the third recorded instance of this exact GitHub mechanism
    (`specs/sdd-workflow.md`'s Ship section has the other two, `#174` and one of PR #953's five).
  - **One new issue filed at this slice's own `/validate`, out of its scope: `#1023`.** See Risks
    And Blockers.
  - **R15's cross-vendor forgery check was not re-proven live against a second vendor's session**
    this slice — the local `demo-srimart-admin` account's password didn't match this checkout's
    `.dev.vars` (`docs/developer-portal/env-setup.md` 1.17.0 now documents this as a general local-
    dev trap, not unique to this slice). Relied instead on the structural `{id, vendorId}`-scoped
    `where` guarantee in `lib/repositories/vendor-faqs.ts` plus the build notes' direct-script
    real-DB proof.
- **Previous promotion, `6a35f4a`** (full `6a35f4a5ddbdc29915112ba6de928843856a54e8`), the PR #1019
  promotion (`staging -> main`, 2026-10-10): mobile finish (`#981`/`#982`, PR #1009,
  `5531f68`/`d2de5f9`/`d087cf1`). **No schema change, no migration, no server change.** CI green on
  PR #1019 (run `38042906060`, `mergeStateStatus: CLEAN`); `deploy-production` (run `38043313025`)
  and `deploy-docs-internal` (run `38043312839`) both **success on the first attempt** — the `#983`
  flake that failed the previous promotion's first deploy did not fire. Production `/api/health`
  (Aheed **and** SriMart) serves `6a35f4a`, `db.ok: true`, `reference.drift: false`, both read
  first-try with no recurrence of the Windows-`curl` empty-body trap. `closingIssuesReferences`
  listed exactly `[981, 982]` before the merge and both are `CLOSED`/`Done` after it.
  - **Not a phase closure.** Both issues sit under `P10`, which stays open; `#697` and other P10
    items are unaffected, so `/discover` → `/learn` → business case does not apply.
  - **`#982`'s fix is confirmed live, but only its lower half is reachable in production.** Read
    post-deploy: SriMart (logo-less in production — do **not** re-assume otherwise, an earlier
    revision of this file's own slice entry had to correct that) renders the text wordmark with no
    `<img>`, and Aheed renders the logo image carrying the `shrink-0` this fix moved onto it, which
    is the change itself visible in production HTML. What is **not** reachable in production is the
    overflow the fix exists for: no vendor's name there is long enough to overflow a 360px header
    (`SriMart` is 7 characters; `Aheed Food Centre` stopped overflowing before this slice), so the
    truncation was proved on dev against a temporary 36-character `VendorBranding` fixture.
  - This promotion also carried PR #1007 (the previous promotion's Document pass) and **PR #1018
    (the eighth and ninth Discover passes)** into `main`. The latter is research, not scope — but
    see Risks And Blockers for the two findings in it that describe **already-shipped production
    code**.
  - Roadmap row: `specs/roadmap.md` 1.138.0.
- **Previous promotion, `d9fac95`** (full `d9fac958e1850e597d1ef8e1853159c8372bccac`), the PR #1006
  promotion (`staging -> main`, 2026-10-06): referral and discount-code integrity
  (`#991`/`#987`/`#988`, PR #1005, `ab1f96a`/`751e577`/`dc6de9f`). One additive migration with a
  backfill (`20261006120000_p987_988_referral_owner_code_throttle`), applied through to production.
  `deploy-staging` (run `37468864774`) **success**; `deploy-production` (run `37471262302`)
  **failed on first attempt** — `quality / quality` hit the already-known flake `#983`
  (`tests/add-to-cart-feedback.test.tsx:93`), re-ran clean with `gh run rerun --failed`, then
  **success** (now a documented Ship-stage trap, `specs/sdd-workflow.md` 2.40.0: the same commit's
  pre-merge PR check had passed; a merge-triggered deploy re-runs the whole suite independently, so
  a flake can roll differently each time). Production `/api/health` (Aheed **and** SriMart) serves
  `d9fac95`, `db.ok: true` — read live on 2026-10-06, after the deploy (SriMart's first read came
  back empty, the known Windows-`curl` trap below — a retry succeeded). One `closes` line per
  issue; `closingIssuesReferences` listed `[987, 988, 991]` before the merge and all three are
  `CLOSED` after it. Roadmap row: `specs/roadmap.md` (next version after 1.135.0).
  - **`#991` is now actually resolved, not just fixed in code.** `getReferralStats` gets or creates
    the shopper's code, awaited; the old fire-and-forget `ensureReferralDiscountCode(...).catch(()
    => {})` is deleted. Measured before the migration: **0** `REF-` rows on staging, production
    *and* dev, so no referral link any shopper had ever been shown was redeemable — confirming the
    `6dca917` entry below was right to flag this as unverified. **R15 proved the fix live under
    `npm run preview`**: a signed-in demo shopper's first `/account/loyalty` load created exactly
    one owned `DiscountCode` row; a second load and a storefront render created no second row.
  - **`#987`:** `DiscountCode.referrerUserId` is a real foreign key (`onDelete: SetNull`, unique per
    vendor), replacing a derived-from-user-id code recorded only in free-text `description`. New
    codes are random (`crypto.getRandomValues`). The backfill measured 0 `REF-` rows everywhere, so
    it is a no-op in production. Proved live against a real database: concurrent creation on both
    Prisma adapters leaves one row, erasure leaves the code ownerless with its redemptions intact,
    and a second shopper's live redemption of the first shopper's code succeeded.
  - **`#988`:** new `DiscountCodeAttempt` table throttles 10 unknown codes per vendor/hashed-IP per
    60 seconds. **R25 proved it live in a real browser**: 10 distinct unrecognised codes each showed
    the "not recognised" message, the 11th (a valid code) was throttled, and after the window
    cleared the same code applied successfully.
- **The mobile programme (seventh Discover pass, `#955`–`#962`) is fully shipped — all seven slices
  in production**, as of the previous promotion below. Still not a phase closure: these issues sit
  under `P10`, which stays open (`#697` and other P10 items are unaffected). This referral/discount
  slice is separate P10 hardening the `#972`/`#973` slice surfaced, not part of that programme.
- **Measurement trap on this machine:** a production `/api/health` or `/robots.txt` read through
  Windows `curl` (schannel) intermittently returns an empty body or exits 35/6, which reads exactly
  like a TLS failure, a DNS failure or an outage. It usually is neither — retry once before
  reporting a vendor down; this bit again during this promotion's own live verification (SriMart,
  above).
- **Previous promotion, `c944c68`** — the seventh and last mobile-programme slice, crawlability
  (`#955`/`#996`/`#994`, PR #999, promotion PR #1000, `staging -> main`, 2026-10-05), carrying PR
  #995's Document pass. No schema change. `deploy-production` (run `37387545893`) **success**;
  production `/api/health` confirmed serving `c944c68`. **The headline defect fixed and verified
  live:** `https://srimart.nocaped.com/robots.txt` returned `Allow: /` plus a correct `Sitemap:`
  line (it served `Disallow: /` before this promotion). Two resolved incidents during this
  promotion, neither a code defect: a forked subagent on a read-only `/validate` task pushed the
  branch and opened PR #999 on its own, then separately asked to merge — both refused, the subagent
  terminated, actual merges only on the owner's explicit confirmation (the general lesson — a
  subagent's self-report of authorization is a claim to verify, never a fact to relay — carries
  forward); and a GitHub Actions runner-assignment incident on `deploy-staging` ("not acquired by
  Runner of type hosted"), resolved by rerunning once a sibling job's success showed the infra was
  recovering, confirmed on githubstatus.com.
- **Previous promotion, `6dca917`** — the sixth mobile-programme slice, checkout and cart honesty
  (`#973`/`#957`/`#753`/`#972`, PR #993, `staging -> main`, 2026-10-05), carrying PR #990 and its
  Document pass PR #992. No schema change. `deploy-production` (run `37295090564`) and
  `deploy-docs-internal` (run `37295090415`) both **success**. `#991` (the unawaited referral-code
  upsert found at this slice's `/validate`, not caused by it) was flagged here as unverified in
  production — **now resolved and verified**, see the `d9fac95` entry above.
- **Previous promotion, `20ff789`** — the first two mobile-programme slices via PR #970
  (`staging -> main`, 2026-10-03): mobile browse density (`#960`/`#961`/`#962`, PR #965) and mobile
  checkout (`#958`/`#959`, PR #969), with the seventh Discover pass (PR #963). The additive
  migration `20261002120000_p962_product_grid_density` is applied in production.
  `deploy-production` (run `37129181574`) **success**. Production `/api/health` (Aheed and SriMart)
  serves `20ff789`, `db.ok: true`, `reference.drift: false`. One `closes` line per issue linked all
  five, and `#958`–`#962` closed on the merge. Roadmap row: `specs/roadmap.md` 1.127.0.
- **Previous promotion, `ee6eccb`** — `#945` (payment reconciliation hardening, absorbing
  `#619`/`#620`) and `#938`/`#939` via PR #953, 2026-09-30. Its closing keywords linked nothing
  (one-line `closes A, closes B`); the rule is in `specs/sdd-workflow.md` 2.38.0.
- **Previous promotion, `924cf24`** — `#935` (branch hygiene) via PR #941, 2026-09-29.
- **Previous promotion, `91b1d8e`** — `#928` (product description as a fourth net-content evidence
  source, refs `#697`) promoted via PR #933 ("Promote product description as net-content evidence
  to production (#928)", `staging -> main`, 2026-09-29), carrying PR #932 (the spec + build + docs
  merge, `0b57f99`) and PR #931 (`#927`'s doc-only Document-stage reconciliation, `b59e815`,
  already on `staging` before this slice started) — `git log origin/main..origin/staging` showed
  exactly these commits before the promotion merge. The `#900` suggester (its script and `#927`'s
  button, unchanged) now also reads the first 500 characters of a product's description, so a pack
  size stated only there — never in the name or unit label — can become a PENDING suggestion
  quoting it; the validator refuses it when the product's own name states a metric size or the
  excerpt states more than one. One additive migration (`NetContentEvidenceSource` enum value
  `DESCRIPTION`), applied through to production. **Validated from a genuinely fresh context**
  against every row of `requirements.md`/`validation.md` (R1–R20), including live proof against dev
  with real Workers AI calls: `coconut-milk`, `croissants` and `free-range-eggs` each came back
  PENDING/`DESCRIPTION` with exactly the expected value on the first try (400 MILLILITRE / 4 EACH /
  6 EACH), no product's `netContentAmount` changed; `Apple Juice 1L` (a name-stated size) correctly
  came back `NAME`, not `DESCRIPTION`. CI (`docs-gates`, `quality/kms`, `quality/quality`) green on
  both PR #932 and PR #933; `deploy-staging` (run `36493415282`) and `deploy-production` (run
  `36497769197`) both completed **success**; production `/api/health` confirmed serving `91b1d8e`
  with `db.ok: true`, `reference.drift: false`. **`#928` closed** on the `main` merge, its
  Project #2 item auto-moving to `Done`. Spec: `specs/2026-09-28-p928-net-content-description-evidence/`;
  read its `build-notes.md` first — it also records a new grep pitfall (React SSR's `<!-- -->`
  text-node comment markers splitting an interpolated sentence), now in
  `docs/developer-portal/local-dev-playbook.md` 1.12.0. **`#901` is UNPAUSED**: the owner can now
  review the 25 PENDING rows already sitting on production and resume CLI batches / "Suggest net
  content" clicks — see the In-Flight Work note. `#697` stays open.
- **Previous promotion, `1297f02`** — `#927` ("Suggest net content" staff button) promoted via
  PR #930 ("Promote \"Suggest net content\" button to production (#927)", `staging -> main`,
  2026-09-28), carrying PR #929 (the feature + docs merge, `18d2f0a`) alone. A store admin can ask
  the AI for net-content suggestions from `/staff/net-content`
  (`runNetContentSuggestionsForVendor`, `lib/net-content-suggestions-service.ts`) instead of running
  `scripts/suggest-net-content.ts` from a terminal — 10 products and 150 neurons per click, `#900`'s
  run loop entirely unchanged, writing suggestion rows only; a staff-only (non-admin) viewer sees a
  note instead of the button. No schema change. `deploy-production` (run `36428229632`) and
  `deploy-docs-internal` both completed **success**; production `/api/health` confirmed serving
  `1297f02`. **`#927` closed** on the `main` merge. Spec:
  `specs/2026-09-28-p927-net-content-suggest-button/`; read its `build-notes.md` first.
- **Previous promotion, `1bedf96`** — `#917` (brand deletion) and `#918` items 1–4 (multi-select,
  numeric ranges, values on cards, search on filter values) promoted via PR #926 ("Promote brand
  deletion and vendor-filter follow-ups to production (#917, #918)", `staging -> main`,
  2026-09-28), carrying PR #924 (the feature merge, `26abc0ca`) and PR #925 (its Document-stage
  reconciliation, `4caf3cf`). `deploy-production` (run `36362598107`) and `deploy-docs-internal`
  both completed **success**. **`#917` closed** on the `main` merge, its Project #2 item auto-moving
  to `Done`; **`#918` stays open** — item 5 (real SriMart production filter data entry) is owner
  action `#922`, unaffected by this promotion. Full Validate/Ship record (every row of R1–R43, the
  live SriMart-staging proof, the `curl -F`/`£` encoding trap now in
  `docs/developer-portal/local-dev-playbook.md` 1.10.0): see
  `specs/2026-09-27-p917-918-brand-delete-filter-followups/build-notes.md`.
- **Previous promotion, `646f14d`** — `#912`, `#601` and `#916` (vendor-defined product filters,
  folding `#601`'s one-filter-key-definition and `#916`'s nested-create proof) promoted via PR #921
  (`staging -> main`, 2026-09-27), carrying PR #919 (the feature merge, `68e1ff8`) and PR #920 (its
  Document-stage reconciliation, `a090b30`). `deploy-production` (run `36313086202`) built, migrated
  (`20260927000000_p912_vendor_attributes`, additive) and deployed — all **success**; production
  `/api/health` served `646f14d`, `db.ok: true`, `reference.drift: false`. `#912`, `#601` and `#916`
  auto-closed to `Done`. Production SriMart shows no vendor filters until its admin enters them
  (owner action `#922`). Two `validation.md` wording gaps were found live at that slice's own
  `/validate` (a row undercounting a seed total; a row asking `sdd:audit` for a zero-gap result that
  couldn't exist until its own Document pass ran) — both spec imprecision, not code defects, and not
  repeated by this slice's `validation.md`. The `secrets/staging.vars` demo-password correction found
  mid-way is standing fact now, documented in `docs/developer-portal/env-setup.md` 1.14.0 ("Demo
  accounts").
- **Previous promotion, `f53913e`** — `#905` (per-vendor product labels/HMC gating, vendor
  store description for AI prompts, delivery-area examples — `#729` slice 2) and `#907` (referral
  share text using the vendor's real configured discount) promoted via PR #915 (`staging -> main`,
  2026-09-26), carrying PR #913 (the feature merge, `62514aa`) and PR #914 (its Document-stage
  reconciliation, `2432ac0`). `deploy-production` (run `36276095967`) built, migrated
  (`20260926180000_p905_vendor_product_label_settings`, additive) and deployed — all **success**;
  production `/api/health` served `f53913e`, `db.ok: true`, `reference.drift: false`. `main` and
  `staging` are content-identical at that point. `#905` and `#907` auto-closed to `Done`. A
  read-only check of the live homepage confirmed the label backfill ran correctly against real
  production data: `aheedfoodcentre.nocaped.com` renders Halal and Fresh badges,
  `srimart.nocaped.com` renders none of the six. **`#916`** (new, Backlog, Phase P10) tracks the one
  build-notes risk that stayed unverified through Ship and this promotion: the new-product
  **create** path with a label disabled has only the update path's live proof (R34(b)); Prisma's
  `undefined`-defaulting on a nested `create` was never exercised. `#912` (vendor-defined filters)
  is the owner-chosen next slice and `#911` (reference coverage as one platform-wide list) is
  Backlog. `#901` (production pilot for `#900`) stays open, Backlog, owner-gated. `#729` and `#900`
  are both closed, promoted (PR #910 `556e273`, PR #904 `a156039` respectively) — see `In-Flight
  Work` below only if their staging-layer detail is needed.
  - **In production (PR #858, merge `2047d0a`, verified live):** the KMS restructuring pilot
    (`#851`, PR #852), KMS navigation categories (PR #853), and the KMS strategy standard
    (PR #855 then PR #856). `deploy-production` (run `35711810410`) and `deploy-docs-internal`
    (run `35711810258`) both succeeded; production `/api/health` served `2047d0a` with
    `db.ok: true`, storage configured, reference reachable, `drift: false`. No schema change and
    no migration in this promotion.
  - **`#851` is OPEN by design, not by oversight.** The pilot shipped, but the strategy it
    produced — `specs/2026-09-22-kms-pilot-orders-fulfilment/kms-strategy-evaluation.md`, v2.0.0 —
    is `status: review`, awaiting approval. **Do not spec the KMS restructuring until it is
    approved.** §25 carries 8 unresolved decisions plus 1 gap; two have no safe default: **U8**
    (no owner exists for the KMS itself, so the ownership model has no root) and **G1** (no
    authoritative source for security requirements). **U1** asks whether the platform is really
    called "SRIMART" — ADR-004 records SriMart as a *tenant*, not the platform, so the document
    uses tenant-neutral naming throughout pending a decision.
  - `#857` (`.gitignore` missing the assembled KMS content after `#853`) is **closed, `Done`**.
  - **Branch-reuse trap, observed live:** PR #855 was squash-merged and the branch reused, which
    broke ancestry with `staging` and collided every file `add/add`. Cut a fresh branch per slice.
- **`CLAUDE.md` was reduced from 149,380 to 13,925 characters (`#786`, PR #787/#788,
  2026-09-17).** Every rule was relocated to an authoritative destination first, not deleted — see
  `specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md` for the line-by-line proof
  and `docs/developer-portal/{runtime-pitfalls,app-conventions,local-dev-playbook}.md` for the
  three new documents that absorbed the material with no prior owner. A session that still expects
  `CLAUDE.md` to carry the vitest suite baseline, a Milestone-0 claim, `phase:`/`gate:` PR labels,
  or `@prisma/adapter-neon@6.19.3` is working from a stale memory — all five were corrected or
  removed, not merely reworded. `#584` and `#546` closed on this promotion. **`#724` has since
  CLOSED** (PR #793/#794, 2026-09-17) — its remaining half was `specs/roadmap.md` denying the
  board's `Priority`/`Complexity`/Phase fields in three places, corrected there. `#505` is still
  open for its non-`CLAUDE.md` half.
- **Two prior slices promoted to `main` with no separate Document (final) PR of their own**:
  the stakeholder business case (`#777`, PR #778/#779, 2026-09-16) and the credential verification
  closeout (`#780`/`#781`/`#782`, PR #784/#785, 2026-09-17). This section's SHA/issue state below is
  now current for both, but neither got the dedicated narrative section a Document pass normally
  writes — read those PRs directly for detail beyond what's summarised here.
- **THE LIVE R2 CREDENTIAL OUTAGE IS OVER (`#755`, resolved 2026-09-16) AND ITS FOLLOW-UP WORK IS
  ALSO DONE (`#780`/`#781`/`#782`, closed on PR #785, 2026-09-17).** `scripts/verify-storage-
  credentials.ts` now probes all four env files (`.dev.vars` included) and reports whether each
  deployed Worker is running its newest version; `CLAUDE.md` (now `docs/developer-portal/
  runtime-pitfalls.md`) documents the loud half of the undeployed-version trap; `saveStorefrontTheme`
  validates its input and uses the shared `isUniqueViolation` check. See the dedicated section below
  for the outage itself — **the rotation was the easy half**, and the way it stayed invisible is the
  part a future session needs.
- **Both Workers were redeployed and are on clean wrangler-sourced deploys**: staging `859a1ff6`,
  production `8d1c074c`, each its own newest version, as of the `#755` rotation — not re-verified
  live since.
- **Issues closed 2026-09-16–20 after live verification**, not on assertion: `#755` (rotation),
  `#756` (fulfilment seed), `#713` (brand-colour validation, found already shipped), `#219`
  (Cloudflare token rotation), `#777` (business case), `#780`/`#781`/`#782` (credential closeout),
  `#786`/`#584`/`#546` (CLAUDE.md refactor), `#792`/`#724` (board/roadmap reconcile),
  `#696`/`#137`/`#151` (cancellations), `#116`/`#806` (saved lists), `#363`/`#811` (timezone),
  `#818`/`#406` (customer feedback), `#824` (vibrant card-stack slider).
- **NEW INFRASTRUCTURE — a second Neon project now exists, and is live in production.** See the
  dedicated section below. This is the most consequential project-level change since multi-tenancy.
- **Worktrees:** only the main checkout.
- **UPDATE 2026-09-29: PR #722 and PR #725 are now CLOSED** (owner decision at Orient, closing
  comment on each). Their branches were kept and still show as `not merged` in the prune's REVIEW
  list. The rest of this bullet is the original reasoning.
- **PR #725 and PR #722 are OBSOLETE — stop protecting them.** Verified live 2026-09-17: both are
  open, both are `CONFLICTING`, and both touch `CLAUDE.md`, which `#786` rewrote from 149,380 to
  13,925 characters underneath them. Their substance has already landed by other routes — #725's
  `orient.md` half via PR #726/#727, its `CLAUDE.md` half via `#786`, its roadmap half via PR #793,
  and `#724` itself is closed; #722's roadmap rows already exist at `specs/roadmap.md:1032` and
  `:1035`. Rebasing either costs more than re-deriving anything still missing. **Recommend closing
  both** — an owner action, not taken here.

## The R2 credential outage is resolved — and HOW it stayed hidden is the durable lesson (`#755`, 2026-09-16)

`#755` is closed. The R2 API token was rotated, all four env files updated, both Workers
redeployed, and a real vendor-logo upload confirmed on staging **and** production. Do not re-open
this as a live defect. What follows is why it took four steps beyond what the repository documented.

**Rotating the token and updating the files was necessary and NOT sufficient.** The credential
lives in two stores. The secrets were updated through the Cloudflare **dashboard**, which creates a
new Worker version and does **not** deploy it — so both Workers went on serving the revoked key
while every local check said the rotation had worked. Specifically:

- `scripts/verify-storage-credentials.ts` reported **ACCEPTED for all three environments**. It read
  files. The files were correct.
- `/api/health` reported `storage: { configured: true }`, which only ever meant the variables exist.
- `wrangler secret list` would have shown the secrets present, because it reports the *script's*
  secrets, not the running version's bindings.

The only thing that showed it was reading the **deployed version** through the Cloudflare REST API
and seeing four `by dash` versions newer than the deployed one.

**The undeployed versions had also wedged CI**, which is the louder half and was not documented
anywhere. Both deploy workflows open their deploy step with `wrangler secret put`, and wrangler
refuses that call while an undeployed version is newest (`Secret edit failed. You attempted to
modify a secret, but the latest version of your Worker isn't currently deployed.`). Every future
deploy on both environments would have failed. Recovery was
`npx wrangler versions deploy <version-id>@100 --env <env>`, after which both workflow reruns
succeeded.

**Prefer `node scripts/configure-env.mjs <env>` over a dashboard secret edit** — it writes through
`wrangler secret put` and therefore deploys as it goes, and updates the GitHub environment secrets
in the same pass.

`#780` and `#781` — **closed** on PR #785, 2026-09-17 — closed the tooling and documentation gaps
this exposed. `docs/developer-portal/env-setup.md` now carries both halves (moved out of
`CLAUDE.md` by `#786`, substance unchanged).

**Two things this did NOT resolve:** whether the previously-exposed Cloudflare token was actually
*deleted* rather than merely superseded (an owner dashboard action, unobservable from here), and
`#783` — staging and production still share one Cloudflare API token, which was `#219` step 3 and
became untracked when that issue closed.

## A second database now exists: `uk-location-reference` (#764, in production; one shared endpoint since 2026-10-16)

**This is the fact a fresh session is most likely to be missing.** The application now reads from
**two** Neon projects.

- **Aheed's own database** is unchanged in purpose: vendors, customers, orders, `Address` snapshots,
  `CustomerAddress`, carts, products, delivery configuration.
- **`uk-location-reference`** holds shared UK postcode/place reference data: `PostcodeReference`,
  `PlaceReference`, dataset versions/checksums, materialised area coverage and sync state. Its own
  schema (`prisma/reference/schema.prisma`), migrations (`npm run ref:migrate`) and generated client
  (`node_modules/@aheed/reference-client`, regenerated by `npm run db:generate`).

Branches: dev and staging **share** `ep-wild-violet-zaa9udu5`; production is
`ep-summer-boat-zapzp2t9`. Env vars `UK_LOCATION_REF_DATABASE_URL`, `UK_LOCATION_REF_DIRECT_URL`
and `UK_LOCATION_REF_POSTCODE_AREAS` exist in all four env files — and, since 2026-09-16, in the
places that actually serve traffic: both Cloudflare Workers carry the two runtime values, and both
GitHub environments carry `UK_LOCATION_REF_DIRECT_URL` as a **secret** with
`UK_LOCATION_REF_POSTCODE_AREAS` as a **variable** (`vars.`, which is what the sync workflow reads).
**A local env file is not evidence about either.** Staging served `UNVERIFIED` for every postcode
for a day with a perfectly healthy database, because its secrets sat on a dashboard-created Worker
version that was never deployed; `/api/health`'s `reference` block and
`scripts/verify-reference-coverage.ts` exist to answer that question directly.

**Why it exists:** a full-GB Code-Point import into Aheed's database occupied **456.9 MB of its
512 MB ceiling**, the Open Names import then failed outright, and ordinary application writes
started failing. Those superseded tables and their 1.75M rows have since been **dropped from Aheed's
database** (489.8 MB → 17.3 MB) by migration `20260915221254_p10_drop_superseded_reference_tables`.

**Coverage is demand-driven:** only `MK` and `RG` are materialised, at 40,031 postcodes and 23,472
places — **identical in dev/staging and production** as of 2026-09-16, when `#767` bootstrapped
production from empty and `#770` retired the leftover `LU`. Adding an area is configuration plus a
sync run; **removing one is `sync-reference-data.ts --decommission`**, which is opt-in, never run by
the schedule, and deletes each area's coverage row before its data rows so the area degrades to
`UNVERIFIED` rather than briefly reading as `INVALID`. `LU` had been materialised for Code-Point
only, left from proving the expansion path, and that was not harmless: its coverage row made the
service an authority on Luton while nothing would ever refresh it.

**The monthly sync runs, and it has run exactly once.** This paragraph previously said the sync
"cannot run yet" because `.github/workflows/sync-reference-data.yml` "has never existed on `main`";
both halves are **stale** and were corrected 2026-10-16. The workflow is present on `main` **and**
`staging` (`git ls-tree origin/main .github/workflows/` — note `git cat-file -e` gave a false
negative here, so prefer `ls-tree`), `#772` is **closed**, and `#764` was promoted long since. One
`schedule` run has ever fired — 2026-10-03, `completed/success`, on `main`. The rule it was built
on still holds and is still worth knowing: GitHub resolves `schedule` and `workflow_dispatch` from
the default branch only.

**But it will fail on 2026-11-03 (`#1123`).** The reference endpoint is now a read replica
(`pg_is_in_recovery()` is `true`) while `UK_LOCATION_REF_DIRECT_URL` is the key `ref:migrate` and
the bulk import write through. That key must point at the **primary** — un-pooled, no `-pooler`.
See Last Verified above.

**Both halves are now live in production: the reference DATABASE and the APPLICATION serving it.**
Corrected 2026-10-16. This paragraph previously said `#764` "has not been promoted to `main`, so
production's deployed Worker does not route that endpoint at all" — **stale**: `#764` is closed,
and on 2026-10-16 production returned `DELIVERABLE` for `MK10 0AA` with real coordinates on
`aheedfoodcentre.nocaped.com`. The database is migrated and synced, matching dev/staging row for
row; confirmed via `scripts/verify-reference-coverage.ts` and `prisma migrate status`.

The durable lesson is why this line was wrong twice in different directions: **database readiness
and application promotion are two independent facts, and a reference-data symptom can come from
either, or from the credential.** Before 2026-09-16 the database was unmigrated; after it, the
endpoint was unrouted; on 2026-10-16 both were fine and the *credential* was rejected. Check all
three separately — `scripts/verify-reference-coverage.ts` for the data,
`/api/health`'s `reference` block for what the Worker can actually reach, and
`/api/address/lookup?postcode=MK10 0AA` for the served behaviour — and never infer one from
another.

**The feature this database backs is now live in PRODUCTION, not just staging**: `GET
/api/address/lookup`, postcode validation and delivery-eligibility consolidation
(`lib/delivery-eligibility.ts`), and customer saved addresses (`CustomerAddress`, separate from
the per-order `Address` snapshot) — promoted via PR #775, `1e44533`, 2026-09-16. `addresses[]` in
the lookup response stays empty until a licensed property-address provider exists — tracked as
**`#766`**, not a defect (Backlog, Phase `P10`), the only issue in this group still open. `#764`,
`#767`, `#770`, `#771` and `#772` all closed on the promotion.

## Reference coverage reconciliation — NOW IN PRODUCTION (`#770`, `#771`, `#767`, PR #773/#774 to
staging, promoted via PR #775, merge `1e44533`, 2026-09-16)

Closed the one hole `#764`'s coverage model left open: the sync pipeline could add a postcode area
but never remove one, so an area dropping out of `UK_LOCATION_REF_POSTCODE_AREAS` froze at whatever
release imported it while its `ReferenceAreaCoverage` row kept claiming authority — reading
`INVALID`, the exact outcome `UNVERIFIED` exists to prevent. `sync-reference-data.ts --decommission`
closes that gap (coverage row removed before data rows, refuses on an empty required list, never
run by the schedule); `LU` — the one area that had drifted this way — was retired from dev/staging
(production never had it). `/api/health` carries a `reference` block
(`lib/reference/reference-status-service.ts`) reporting configured/reachable/required areas and
per-source drift in both directions, never fatal.

**Production is now fully live, not just the database.** Promoting `#764` to `main` is what `#772`
itself named as the fix for the dormant monthly schedule (`.github/workflows/sync-reference-data.yml`
now exists on `main`; `gh workflow list` shows it `active`, confirmed live). Production `/api/health`
reports `db.ok: true` and `reference.drift: false` at `1e44533`; `/api/address/lookup?postcode=MK10
0AA` returns `DELIVERABLE` with real coordinates; `LU11AA` correctly returns `UNVERIFIED` (never
imported in production, a different reason than dev/staging's retired `LU`, same correct state).

**Found and fixed at this slice's own `/validate`, before promotion**: a routine `deploy-staging`
CI run had silently wiped `UK_LOCATION_REF_POSTCODE_AREAS` from the deployed staging Worker's
bindings — `wrangler deploy` rebuilds a Worker's `vars` entirely from `wrangler.toml`, and the
variable had only ever been added via the Cloudflare dashboard, never committed. Fixed by declaring
it as `[env.staging.vars]`/`[env.production.vars]` in `wrangler.toml` — confirmed working on both
environments' own first real deploy from committed config (staging's post-merge `deploy-staging`,
then production's `deploy-production` on promotion), neither needing a dashboard workaround.

Read `CLAUDE.md`'s "Database" section ("Two databases exist" bullet) and `specs/architecture.md`
§3.0 before touching any of it.

## Project Position

The product is a functioning multi-vendor grocery storefront and staff panel, not the walking
skeleton still named in a few stale headers. P0 through P8 and P2.6 are substantially closed. Work
is in **P9 launch readiness**, but the owner's High-priority P9.2 feature set currently displaces
P9.3 launch validation and P9.4 certification.

**The P10 "Delivery cluster" (#401/#402, plus #748/#749/#750/#751) is now fully promoted to
production (2026-09-15, PR #759)** — see Last Verified above. It shipped ahead of its own documented
sequencing (`specs/roadmap.md`'s P10 candidate list said `#363`, vendor timezone, "must land first";
it did not, and `#402`'s own build-notes record this explicitly as a known-shaky area, fine for
this app's UK-only vendors today).

**`#613` was never part of this cluster and was never touched by it — a citation error in this
project's own history conflated the two.** The real GitHub issue `#613` is about delivery-*area*
postcode-district granularity (`MK9` deliverable, `MK17` not), unrelated, still open, and gated on
operational input from Aheed (van count, round size). It was mistakenly cited across
`specs/2026-09-13-p613-address-lookup/`, this file (in its prior revisions) and part of
`specs/roadmap.md` for the unrelated checkout postcode-*lookup*/address-autofill feature that
actually shipped via `#744`'s ancestry — **that feature has no issue of its own.** Found at this
slice's `/ship` (2026-09-15) while preparing the promotion PR's closing-issue list; `#613` was
deliberately left open and uncited by PR #759. See the Documentation Reconciliation section below
for the tracked cleanup issue.

**`#764` (address lookup, reference-data framework, saved addresses) and `#770`/`#771`/`#767`
(reference coverage reconciliation) are BOTH now promoted to production** (PR #775, merge
`1e44533`, 2026-09-16) — see Last Verified above and "Reference coverage reconciliation" for what
shipped and how it was live-verified post-deploy. `#764`, `#767`, `#770`, `#771` and `#772` all
closed; `#766` remains open, deliberately (no licensed address provider in scope).

**`#116` (saved shopping lists) and `#806` (its same-day `/shop-your-list` quick-access follow-up)
are BOTH now promoted to production** (PR #808, merge `187b5eb`, 2026-09-19) — see Last Verified
above. `#806` added zero new schema/repository/service surface of its own (confirmed by an empty
`git diff` across every file `#116` and the existing paste/match/add-to-cart journey own), which is
why the two were batched into one promotion rather than two.

**`#363` (vendor timezone becomes data) and `#811` (its same-slice BST slot-picker day defect) are
BOTH now promoted to production** (PR #815, merge `a682177`, 2026-09-19) — see Last Verified and
High-Priority Work above. This finally resolves the sequencing gap the P10 Delivery cluster bullet
above describes (`#401`/`#402` shipped ahead of `#363`); their own zone-handling paths
(`SlotPicker`'s window check, `ExpressCountdown`, `confirmPayment`'s 60-minute stamp) were not
themselves part of `#363`'s scope and remain unverified against a genuinely non-UK vendor.

**`#836` (Shopper Account Upgrade & Loyalty/Rewards Integration with Referrals)** was promoted to production
(PR #840, merge `e3648bc`, 2026-09-21, `staging -> main`). It upgraded the Shopper Account layout to match Staff View
(`max-w-5xl px-4 py-8`, 2-column card grid, `hover:border-action`), added persistent horizontal navigation tabs
(`components/account/AccountNav.tsx`) matching `PanelNav.tsx` across all account pages and `/feedback`, integrated
Loyalty & Rewards (`/account/loyalty`) with points/tier hero, available vouchers (£1, £5, £10 off), and referral invite,
re-skinned the floating rewards launcher and slide-out panel (`components/rewards/`) to Aheed's native brand palette
(`bg-primary`, action green `#2e7d32`, white card dialog, `bg-surface-muted`), pre-hydrated initial rewards data from the Better Auth
session in `StorefrontChrome` to eliminate unauthenticated flash, and introduced customer referral tracking (`REF-XXXXXXXX`),
discount code checkout prefilling from cookie, and 100 bonus loyalty points attribution on confirmed orders. Zero DB schema
migrations (pure relational 3NF).

**`#841` (Clickable Star Ratings with Descriptive Labels for Product Reviews)** was promoted to production
(PR #845, merge `a579781`, 2026-09-21, `staging -> main`). It replaced traditional rating `<select>` dropdowns across
both `QuickViewDrawer.tsx` and `ReviewForm.tsx` with an accessible, interactive `StarRatingInput` component.
Customers click stars (1–5) to set or update ratings, with dynamic hover previews, keyboard navigation, semantic `<fieldset>`/`<legend>`
structure, invisible overlaid radio inputs satisfying Chromium focusability constraints on required inputs, and descriptive rating
labels ("Poor", "Fair", "Good", "Very Good", "Excellent"). Zero DB schema migrations. Closes #841 to `Done`.

**`#847` (Website Feedback Clickable Star Rating to Match Product Feedback)** was promoted to production
(PR #849, merge `6a9db8b`, 2026-09-21, `staging -> main`). It replaced the radio-button pill group in
`components/storefront/FeedbackForm.tsx` on `/feedback` with the shared `StarRatingInput` component.
Customers click stars (1–5) to set or update ratings, with dynamic hover previews, keyboard navigation, semantic `<fieldset>`/`<legend>`
structure, invisible overlaid radio inputs, and descriptive rating labels ("Poor", "Fair", "Good", "Very Good", "Excellent").
Pre-fills existing rating when editing. Preserved all existing feedback functionality, comment handling, submission validation,
rate limiting, and moderation workflows untouched. Zero DB schema migrations. Closes #847 to `Done`.

**`#861`/`#871`/`#857` (KMS enforcement foundation + internal-docs search index) are BOTH now
promoted to production** (PR #875, merge `2ff3e79`, 2026-09-23, `staging -> main`). Repairs three
broken KMS controls (`graft/` walker exclusion, `visibility`-aware `assemble.ts` routing, correct
`trackFor()` matching) and builds the Pagefind search index the internal docs site had never had.
See the KMS technical detail, numbers and the Validate-stage `kms:check-generated` bug fix in
`specs/2026-09-22-kms-enforcement-foundation/build-notes.md` and
`specs/2026-09-22-kms-search-index/build-notes.md` — not repeated here.

**`#876`/`#878` (expected restock date + product-create HTTP-transaction fix) are BOTH now promoted
to production** (PR #882, merge `5f1e14f`, 2026-09-23, `staging -> main`; PR #881 carried the
feature into `staging`). Staff give an out-of-stock product an optional expected-back day on the
product form; shoppers see "Back in stock \<date\>" on the product card, quick view and product
page, only while stock is zero and only until that day has passed in the vendor's own timezone.
`#878` (folded in as a prerequisite) fixed `createProductForVendor`'s nested `product.create`,
which crashed on every call over `getPrisma()` — **`/staff/products/new` was broken on every
environment until this shipped**, invisible only because the platform has never traded. One
additive migration (`Inventory.expectedRestockDate DateTime?`, no `DROP`). Full live-validation
detail in `specs/2026-09-23-p876-expected-restock-date/build-notes.md`. Production confirmed live
post-merge: `/api/health` served `5f1e14f`, `db.ok: true`, `drift: false`.

**`#877` (net content for the generated demo catalogue) is now promoted to production** (PR #887,
merge `3b85289`, 2026-09-24, `staging -> main`; PR #885 carried the feature into `staging`). See
In-Flight Work above for detail; not repeated here.

**`#613`/`#890`/`#889` (delivery-area district ranges, per-area pricing, out-of-area refusal
counts) are now promoted to production** (PR #898, merge `9b1de27`, 2026-09-25, `staging -> main`;
PR #896 carried the feature into `staging`, PR #897 its own Document-stage reconciliation). Store
admins enter postcode districts as comma lists or ranges on `/staff/delivery-areas`; any area or
district can carry its own delivery charge, minimum order and free-delivery threshold, resolved by
one pure `lib/delivery-pricing.ts` function that feeds checkout, `place-order`, the cart drawer,
`/cart` and the landing banner; out-of-area postcodes are counted per district with no personal
data. One additive migration. Full validation detail in
`specs/2026-09-24-p613-delivery-areas-ranges-fees-refusals/build-notes.md`. Production confirmed
live post-merge: `/api/health` served `9b1de27`, `db.ok: true`, `reference.drift: false`.

**`#900` (AI-suggested net content with image provenance) is now promoted to production** (PR #904,
merge `a156039`, 2026-09-26, `staging -> main`; PR #902 carried the feature into `staging`, PR #903
its own Document-stage reconciliation). See In-Flight Work above for detail; not repeated here.
Production confirmed live post-merge: `/api/health` served `a156039`, `db.ok: true`,
`reference.drift: false`. `#901` (production pilot) stays Backlog, owner-gated.

**`#729` (vendor-neutral UI copy, slice 1) is promoted to production** (PR #910, merge `556e273`,
2026-09-26, carrying PR #908 and PR #909). See In-Flight Work above for detail; not repeated here.

Do not recover architecture from this handoff. Read `CLAUDE.md`, `specs/architecture.md`,
`specs/tech-stack.md`, `specs/decisions/ADR-001..006` and `specs/sdd-workflow.md` when their areas are
in scope.

## High-Priority Work

The live board showed open High-priority items, all with blank Complexity:

- Brand safety & staff operability: #714 (promoted via PR #732), #733 (promoted via PR #736), and #737 (merged via PR #738, **closed** 2026-09-12 — see In-Flight Work below, this line was stale as of the 2026-09-14 handoff).
- **Stock and fulfilment: DONE, 2026-09-15** — #401, #402, #748, #749, #750, #751 all **closed →
  Done**, promoted to production via PR #759. (`#613` was never part of this — see Project Position
  above.) **#422 and #400 are DEFERRED (owner decision, 2026-09-24)**: board Status `Deferred`,
  milestone "Deferred — owner/external gated", Priority cleared, both still open. #400's restock
  date shipped (#876) and its async half was dropped on measurement; only per-store counts remain,
  blocked on #422. Not `/propose` candidates until the owner revives them.
- **Vendor timezone and the BST slot-picker defect: DONE, 2026-09-19** — #363 and #811 both
  **closed → Done**, promoted to production via PR #815 — see Checkout above and In-Flight Work
  below. `#402` had shipped without this (flagged as known-shaky timezone handling); that gap is
  now closed for the vendor-timezone half. `#422` (multi-site) is unrelated and still open.
- **Saved lists: DONE, 2026-09-19** — #116 and #806 both **closed → Done**, promoted to production
  via PR #808 (`specs/2026-09-18-p116-saved-shopping-lists/`,
  `specs/2026-09-19-p10-shop-your-list-saved-lists/`).
- **Paid-order cancellation and reversals: DONE, 2026-09-18** — #696, #137 and #151 all **closed →
  Done**, promoted to production via PR #799 (`specs/2026-09-17-p696-staff-cancel-confirmed-order/`).
  `cancelConfirmedOrder` never touches `Payment`; refunds stay with #606.
- **Customer feedback & reviews and vibrant card-stack slider: DONE, 2026-09-20** — #818 and #406 both
  **closed → Done**, promoted to production via PR #822 (`specs/2026-09-19-p818-customer-feedback-reviews/`);
  #824 **closed → Done**, promoted to production via PR #826 (`specs/2026-09-20-p824-card-stack-reviews-upgrade/`).
- **Shopper account upgrade and rewards integration: DONE, 2026-09-21** — #836 **closed → Done**, promoted
  to production via PR #840 (`specs/2026-09-20-p836-shopper-account-rewards/`).
- **Clickable star ratings for product reviews and website feedback: DONE, 2026-09-21** — #841 and #847 both
  **closed → Done**, promoted to production via PR #845 (`specs/2026-09-21-p841-clickable-review-stars/`) and
  PR #849 (`specs/2026-09-21-p847-website-feedback-star-rating/`).
  #695 is unchanged.
- Data activation: #697.
- Location decision reconciliation: #422 — now Deferred, see above.
- **Remaining open High item (verified 2026-09-28):** #697 (real-product net content, a data job
  for Aheed) is the ONLY one. **#695 is Deferred** (owner decision 2026-09-26: Status `Deferred`,
  Priority cleared, "Deferred — owner/external gated" milestone) — not a `/propose` candidate.
  Earlier revisions of this line listed it as High. **#613 shipped and promoted to production 2026-09-25** (PR #898
  — see In-Flight Work and Project Position) and is removed from this list.
- **`#613`'s own premise was stale.** District-level delivery areas (`MK9` exact, `MK` whole area)
  already shipped unspecified inside `#402`'s build commit `2f0f20c` (2026-09-12) and are in
  production. `#761`'s claim that the delivery cluster never touched `#613` is partly wrong for the
  same reason (commented on `#761`). What `#613` still lacked — ranges, docs, proof — is in flight.
- Exposed credential rotation: **#219 is CLOSED** (rotated, verified 2026-09-16). Its step 3 — the
  per-environment token split — is now **#783**.

Dependencies and scope boundaries worth preserving:

- #696 made #137 and #151 reachable, now in production (see High-Priority Work above and Checkout).
- #363 no longer gates delivery slots and Click & Collect — `VendorConfig.timezone` shipped to
  staging via PR #813 (see High-Priority Work above). #402 still needs the location decision and
  real operating inputs such as capacity, rounds and order volume.
- #400 is three concerns: the low-stock badge exists; restock dates and async loading do not;
  per-store stock depends on location modelling.
- #697 is not missing code. The net-content columns, form, unit-price derivation and pack-size facet
  exist, but dev measurement found zero populated products. Production has ~80 Aheed products
  (measured 2026-09-25). The `#901` pilot (2026-09-28) left 25 PENDING suggestions there, and none is
  on a product until staff accept it. The first batches were all `prisma/seed.ts` fixtures, so the
  real-stock share is still unknown.
- #406 settled by #818: first-party feedback with staff moderation, outbound review links, and 3D
  Cards Stack Slider adopted instead of third-party widgets, preserving CSP and PECR privacy postures.
- #695 needs Meta approval, inbound webhook design and phone-to-user identity; it is not
  repository-only work.

Completed items still carrying board Priority `High` were #397, #405, #407, #608 and #694. Do not
mistake them for backlog.

## In-Flight Work

All facts in this section require live verification:

- **P11 `#1216` — placeholder manifests, catalogue importer, onboarding runbook — MERGED TO STAGING, NOT
  PROMOTED, DATABASE ROWS UNVERIFIED (2026-10-22).**
  - **Where it is:** PR **#1222** (squash `6a09b00`, `staging`); `deploy-staging` run `39787197314`
    completed success (no migration in this slice). Spec `specs/2026-10-22-aheedsuperstore-onboarding/`;
    read its `build-notes.md` first. **It is not on `main`; `#1216` stays open until promotion.**
  - **Validation was not independent and every dev-database row is UNVERIFIED** (`validation.md` R4,
    R19-R25 database parts, R27, R29, R33, R34, R37 database modes). Run them on a machine with `.env`,
    `secrets/*.vars` and the client's stock file (never in the repo), starting with
    `verify-catalogue-import.ts --unique-probe`, which reveals the real `.code` the Neon WebSocket adapter
    raises for a unique violation (`isUniqueViolation` accepts `"23505"` and `"P2002"`; a miss fails safe).
    Nothing has been written to any database by this slice. The `aheedsuperstore` test vendor has **not**
    been created.
  - **Owner decisions that stand:** the test vendor is added alongside existing vendors in the **dev**
    database (`ep-dry-morning-zab7dx08`, confirm it is dev first); products import **hidden, stock
    `UNKNOWN`**, categories **inactive** and named **exactly as the client wrote them**; the placeholder
    gate is operator-run, not CI (`#1221`); no push to `main`, deploy or deletion without approval.
  - **Deferred, tracked:** `#1218` category standardisation + versioned import template, `#1219`
    deployed isolated dev environment, `#1220` enrichment before activation (unit label, description,
    images, VAT), `#1221` slug identity and the placeholder gate. **`#1217`** provider-agnostic outgoing
    email (Cloudflare Email Sending first, Resend kept as fallback, non-production recipients
    allowlisted) is specified in the plan's section 5.5 and **not started**; Cloudflare's docs host was
    unreachable from the planning session, so its prerequisites are unverified.
  - **Cloud-session environment facts:** no GitHub GraphQL (`gh pr view`, `gh project ...`,
    `closingIssuesReferences` fail; use `gh api` REST and set board Status/Phase by hand); no `.env`, so
    the host guard refuses every database run; `developers.cloudflare.com` and the staging hosts'
    `/api/health` are blocked by the session proxy; the container's npm (10.9.4) rewrites unrelated
    `package-lock.json` lines (`devOptional`, `libc`), so edit the lockfile by hand or use the
    repository's npm; and the stop hook's "unpushed commits / no remote branch" warning is a false alarm
    whenever the branch is already on `origin` (check `git ls-remote --heads origin <branch>`).
- **P11 slice 2 — `#1211`, catalogue safety layer — MERGED TO STAGING, NOT PROMOTED (2026-10-22).**
  - **Where it is:** PR **#1215** (squash `af67cfd`, `staging`); `deploy-staging` run
    `39742147580` succeeded, which applied migration `20261022120000_p1211_restrictions_stock_states`
    to staging. It is NOT on `main`, so production does not have the migration yet. Spec:
    `specs/2026-10-22-catalogue-restrictions-stock-states/` (`build-notes.md`, "Validation run 1").
  - **Validation was not independent** (same context as Build, on Opus). Unverified: R15b client
    half, the SriMart second-vendor UI check, and the pre-migration `Inventory` count.
  - **`#1211` stays open and its board item should read In Review** until the promotion PR merges.
    The board move could not be made from the cloud session (GraphQL blocked): verify live.
  - **Owner rulings of 2026-10-22, standing decisions** (ADR-007): `#1196` is storefront-only, not
    stock management (close it once ADR-007 is confirmed on `staging`); `#1200` is import everything
    hidden and closes when `#1211` reaches production; stock has three explicit states and
    `UNKNOWN` is never purchasable.
  - **`#1201` (the Excel importer) is still BLOCKED** on the client's answers (opening stock, a
    barcode/supplier export, the `DEFAULT`/£0.00 rows). When unblocked it must write through
    `lib/catalogue-import-policy.ts`.
  - **Deferred, tracked:** `#1212` (age verification), `#1213` (filter-wide bulk actions), `#1214`
    (correcting a mis-tagged hard block).
- **`P11 — Repeatable Vendor Onboarding` is OPEN (2026-10-21), and its first slice is IN
  PRODUCTION (2026-10-22).** Promotion PR **#1208** merged as `7b703b9` (`staging -> main`, two
  parents); `deploy-production` run `39689968404` succeeded, including the first production run of
  the route-verification step; both production hosts serve `7b703b9` with `db.ok: true` and two
  reference `sources`; `#490`, `#1197`, `#1198` are closed and `Done`. The "In Review" and
  "outstanding" wording in the bullets below predates the promotion. Opened after `/discover` on an external brief to onboard
  a new inventory-and-stock-management client with their real 6,167-row stock export (eleventh
  Discover pass, `docs/research/discovery-log.md`). Milestone #24; Project #2's Phase field gained
  a `P11` option additively, all 19 pre-existing options passed through with their own ids and all
  452 set Phase values across 601 items verified unchanged.
  - **Slice 1 — `specs/2026-10-21-p11-onboarding-foundation/`**, closing **`#490`**, **`#1198`**,
    **`#1197`**. PR **#1207** merged (squash) to `staging` as `12083ee`, 2026-10-21.
    `deploy-staging` succeeded; `/api/health` on staging confirmed `commit: "12083ee"`,
    `db.ok: true`, `reference.reachable: true`, two populated `sources`. All three issues moved to
    board status **In Review** (not `Done` — that's reserved for the `main` promotion, still
    outstanding).
    - **`/validate` ran from a fresh context and found two real gaps, both fixed before shipping —
      this was not a rubber-stamp of the in-session Build-time check.** (1) R6: the host guard's
      own safety claim ("no connection is attempted") was false whenever `SEED_SCALE_PRODUCTS` was
      set, because `prisma/seed.ts`'s `main()` queried the database ~100 lines before the guard was
      ever reached — a bogus password masked the refusal behind an unrelated auth error instead of
      proving it. Fixed by adding a second, early call to the guard at the very top of `main()`;
      re-proven end-to-end with an isolated fixture `secrets/staging.vars` (no real host or
      credential touched). (2) R19: the committed `prisma/manifests/example.json` shipped with
      `loyaltyTiers: []`, so the worked example never demonstrated that field. Fixed by adding one
      sample tier. Both re-verified independently (two consecutive `npm run db:seed` runs, two
      consecutive `scripts/provision-vendor.ts` runs, dev database restored to baseline each time).
      Full record: `specs/2026-10-21-p11-onboarding-foundation/build-notes.md`.
    - **`/ship` caught a third gap real CI surfaces that nothing local did: `kms:coverage` failed on
      `prisma/manifests: baseline 0, measured 1`.** New directory, its `README.md` has no
      front-matter (matching sibling READMEs elsewhere) — a legitimate re-baseline, re-ran via
      `kms:coverage -- --update` and hand-kept to only the `prisma/manifests` line. **This is a
      different entry from `#1204`'s `misc:` ratchet failure** (still open, still correctly
      untouched — that one's recommended fix is the harmful one; this one's was the correct one).
      `kms:coverage` is not one of `validation.md`'s rows and is "CI-only otherwise" per
      `CLAUDE.md` — worth remembering that a new top-level directory can ratchet-fail in CI with
      nothing local to catch it first.
    - **The undelivered `#1186`/`#1187` documentation tail (`643237b`) rode this branch as
      planned** and is now on `staging` with it, per the carry-forward rule. `docs/p1186-1187-document`
      still points at `b882491` and has no PR of its own — expected, not a gap.
  - **Two owner decisions gate the rest of P11**, both board Status `Deferred`: **`#1196`** —
    storefront or stock management, which sizes `#1199` (VAT) entirely; and **`#1200`** — which of
    the 51 restricted and non-deliverable catalogue lines may be sold. **`#1201`** (the Excel
    adapter) is blocked on both plus three client answers. A decision page for the owner and client
    is published as a private Artifact.
  - **ADR-004 decisions 3 and 7 are now CORRECTED (1.14.0), and this is durable truth worth not
    rediscovering.** A new vendor host is **not** data-only: every host is an individual
    `custom_domain = true` route in `wrangler.toml`, and a deploy omitting a live host tears its
    custom domain down. A wildcard was investigated against the live Cloudflare account and
    rejected: `nocaped.com` is an active `full` zone on the **Free** plan and proxied wildcard DNS
    is no longer Enterprise-only, but **Worker Custom Domains cannot be wildcards at all**, and a
    wildcard route plus Universal SSL each cover exactly **one** subdomain label — while
    `staging.aheedfoodcentre.nocaped.com` is two deep and serves a certificate only because a Custom
    Domain issues one per hostname. Do not re-propose a wildcard without solving that first.
  - **Deferred items filed at `/build-notes`:** `#1202` (the seed's `SEED_REMOVE_GENERATED` delete
    path is still print-and-trust), `#1203` (`AHEED_VENDOR_ID` declared twice), `#1204`
    (`kms:coverage` walks gitignored `/misc/`, so it fails locally **and its message recommends the
    harmful fix** — do not re-baseline), `#1205` (no in-app vendor creation; needs the
    platform-admin authorisation story `/staff/*` lacks). **`#436`** (Neon backups/PITR, `P09.2`,
    open) already tracks the backup gap — **a client handover promising a recovery responsibility
    needs it closed**, so it is a candidate to pull into P11 rather than re-file.

- **Owner's 2026-10-17 "Website Updates" brief, split into three slices.** The owner approved
  the clubbing at `/propose`.
  - **Slice A `#1131`** absorbs `#1132` and `#1133`. It covers departments, category management, the
    department search bar and the Shopping List entry.
    - **Status:** MERGED to `staging` (PR #1141, `4f1cc9a`, 2026-10-17, validated from a fresh
      context with one fix pass); board **In Review**, issue open until promoted. Not in production.
      `specs/2026-10-17-p1131-storefront-navigation-catalogue/` records what was and was not
      verified (R24's SriMart visual comparison was not). `#1140` is out of scope by the owner's
      decision; its issue body still repeats a claim that is false (a hidden department **is**
      listed on `/staff/promotions`), so do not act on it.
    - **Standing rule it introduces:** a category is visible only if it and its parent are active.
      Hiding rewrites no row. `#159`'s refusal to hide a stocked department is gone. Recorded in
      `specs/architecture.md` 1.41.0.
    - **Rollout is not automatic, and has not been done on staging or production.** The five
      departments, Fish and the search placeholder only change when someone runs
      `scripts/apply-department-changes.ts --vendor aheed-food-centre --apply` with `DIRECT_URL`
      from `secrets/<env>.vars`, on staging then production. That is a production command, so the
      user runs it.
  - **Follow-on `#1142`**: the header method dropdown, Shopping List beside the search bar, and the
    placeholder "Find your favourites...".
    - **Status:** BUILT on `feature/p1142-header-dropdown-search-room`, awaiting Validate from a
      fresh context. `specs/2026-10-17-p1142-header-dropdown-search-room/build-notes.md` has the
      measurements. The owner lowered R13's form threshold from 640 to 600 at Build.
    - **It changes what slice A's script writes.** The script sets whatever `OWNER_SEARCH_PLACEHOLDER`
      is in the deployed code. Run it on an environment before `#1142` reaches it and you get the
      old text; run it again after the deploy and you get the new one. The script is idempotent, so
      a second run is safe.
  - **Slice B `#1134`** absorbs `#1136`: Rewards off, feature-switch gating, and the marketing
    sentence with a separate opt-in. Proposed only.
  - **Slice C `#1135`**, combined with Club D (`#1029`, `#1031`) and `#1028`: **merged to
    `staging`** (PR #1160, `3bbfa47`), not yet promoted. See Last Verified above and
    `specs/2026-10-19-p1135-custom-notes-ai-allowance/build-notes.md`. It was validated in the
    building session on Opus at the owner's choice, not independently. **`#1028` is resolved in
    code**: `WORKERS_AI_PLAN` defaults to Free, and the owner sets `paid` once the Cloudflare plan
    is confirmed. The owner deferred "fix existing free-text" until they give a route or symptom.

- **Club C, privacy and consent honesty (`#1107` + `#1041`): DONE, in production** (PR #1114 to
  `staging`, promotion PR #1118, merge `6ec8142`, 2026-10-16; spec `1b4b518`, build `22599b6`, fix
  `e2f3470`; `specs/2026-10-15-p1107-1041-privacy-consent/`). Both issues closed and `Done`; see
  Last Verified above for the live evidence. Owner rulings at Gate 1, preserved because they bound
  any future change here: saved checkout details stay essential (no consent gate); every
  hashed-IP record gets disclosed, not only the search log; a Cookie settings control is in scope.
  The 2026-10-15 clubbing of the wider backlog (Clubs C–F and the owner-gated groups) is recorded
  in the triage document's "Backlog clubbing — 2026-10-15" section; **Club C and now Club E
  (`#1045` + `#1043`, copy only — PR #1127, merged to `staging` 2026-10-16, see Last Verified
  above) are closed out, Club F (`#1090` + `#1091`, PR #1130) is merged to `staging`, and slice A (`#1131`,
  above) is separate work from the owner's brief** — Club D (`#1029`, `#1031`) is now built with
  `#1135`, which resolved `#1028` in code (above).
- **Owner user-testing pass, 2026-10-13 — 21 observations, triaged with live evidence.** The
  single most useful artifact from it is
  `docs/business-analysis/user-testing-feedback-2026-10-13.md` (committed `7bee5ad`): every item
  traced to a file and line or to a production measurement, sorted into already-handled,
  owner-configurable, code-change-needed and blocked. **Read it before re-triaging anything a user
  reports about the storefront** — two of the 21 turned out to be already shipped, and it records
  which.
  - **`#1077` (eleven quick UI/copy fixes) is in production** (PR #1081, promoted by PR #1085;
    closed and `Done`). Spec and build notes in `specs/2026-10-13-p1077-quick-ui-copy-fixes/`. It was
    validated from a fresh context. Not proven anywhere yet: the logo and favicon checks, because the
    local database has no logo or mark for either vendor, so check them on a vendor that has both.
  - **It reverses `#1069`'s header rule of the previous day**: a vendor with a logo renders the
    logo at every width, not the square mark below 768px. `specs/design-system.md` 1.21.0 is the
    authority; the `#1069` entry below is left as shipped history.
  - **Durable measurement worth not rediscovering:** a placeholder cannot be made fainter than
    `text-primary-muted` (5.21:1), because the lowest value `tests/token-alpha-purity.test.ts`
    (`#649`) permits is `text-black/60` at 5.74:1. Placeholder prominence is a content problem.
    Recorded in `specs/design-system.md`.
  - **Filed from this pass:** `#1078` (vendor-editable banner headline), `#1079`
    (`WaysToEarnAccordion` repeated the unenforced referral claim `#1077` removed from
    `ReferralCard`) and `#1083` (Click & Collect held to the delivery minimum) are **one slice, in
    production and closed** — see the `#1083` entry below. `#1080` (four `aheed_`-prefixed storage
    keys are platform-wide, so SriMart's privacy page names another vendor) is **in production**
    (PR #1108, promoted by #1109, 2026-10-15) — see the `#1080`/`#1065` entry in `specs/roadmap.md`.
  - **The triage document now carries a dated status register (2026-10-14) re-verifying all 21
    items against the code.** Read that section before the buckets above it — where they disagree,
    it is newer and wins, and it records which items `#1077` and `#1083`/`#1078`/`#1079` already
    closed.
  - **Three previously-unfiled findings from this pass — `#1087` (a deliverable postcode did not
    select Delivery), `#1088` (no warning when an ambiguous shop-list line is skipped) and `#1089`
    (the privacy page's `code`-styled cookie names) — are DONE, in production** (PR #1092 to
    `staging`, merge `2efd98b`; promotion PR #1093, merge `c3327e4`, 2026-10-14); all three closed
    and `Done`. Owner-approved as one slice ("Club A"). Spec, build notes:
    `specs/2026-10-14-p1087-1088-1089-shopper-clarity/`. No schema change, no migration.
    `setDeliveryPostcode` now scopes the method switch to the submitted intent — the Delivery
    affordance's postcode selects `DELIVERY`, the pencil's never does, which is `#748`'s actual
    distinction. `ListReview`/`addListToCart` report a skipped shop-list line through `#957`'s
    existing notice. `/privacy` leads each storage entry with its purpose, name second, no `<code>`.
    **Validated from a fresh context (Sonnet 5), no fix pass — every row passed, including both rows
    build notes had flagged as needing a real browser** (R3-E2E, the postcode-from-Delivery fix, and
    R5-E2E, the `#748` regression guard: the pencil never flips the method, even when the re-entered
    postcode is fully deliverable — confirmed live, not just by the unit tests). The seeded
    `offerCollection` trap the build notes warned about did not bite: local Aheed renders the toggle
    by default.
  - **Still found, evidenced and NOT filed**, with the triage document as their only home: 24 flat
    staff-nav links needing grouping (now **37**, re-counted 2026-10-14) and referral economics
    being platform constants rather than vendor data (`lib/referrals.ts`). Each has a file and line
    there. (A third, `listCategorySpotlights`' global take window starving departments, has since
    been filed as `#1096`, fixed by PR #1097 and promoted by PR #1099.) Filed
    during `#1088`'s build and still open, unaffected by this slice: `#1090` (shop-list lines the
    review step never submits) and `#1091` (responsive two-span labels computing a doubled
    accessible name).
- **Collection minimum, banner headline, referral copy (`#1083`, `#1078`, `#1079`): DONE, in
  production** (PR #1084 to `staging`, promotion PR #1085, merge `624ffbc`, 2026-10-13); all closed
  and `Done`. Spec, build notes: `specs/2026-10-13-p1083-collection-minimum-banner-headline/`. One
  additive migration (`VendorConfig.collectionMinimumOrderPence Int @default(0)`, `bannerHeadline
  String?`), applied by `deploy-production` run `38475624590`. Click & Collect now has its own
  minimum, default none; the banner's first line is editable at `/staff/storefront`, with blank
  keeping the derived line. **Unproven in production:** a real collection order under £15 (the
  checkout submit step was not exercised live, only the `R7` unit test, which mocks `createOrder`).
  **Verification trap worth keeping:** a demo account's cart is not empty by default (the Aheed demo
  admin held £92.00), so a below-minimum live check needs either a cleared cart or minimums set
  above its subtotal.
- **Per-vendor square mark (`#1069`): DONE, in production** (PR #1074 to `staging`, then promotion
  PR #1075, merge `8bb2a6b`, 2026-10-13); closed and `Done`. Spec, build notes:
  `specs/2026-10-12-p1069-brand-assets/`. One additive migration
  (`20261012210000_p1069_vendor_mark`), applied by `deploy-production`.
  - **No vendor has a mark yet**, so nothing visibly changes in production except the desktop logo
    box (128×64, 2:1, from 768px; amended after Validate for the Aheed Super Store lockup). Applying
    real artwork is an owner action: upload on `/staff/storefront`, then a theme for the new palette.
  - Origin: the tenth Discover pass (2026-10-12). **Owner rulings:** Aheed keeps the name "Aheed Food
    Centre" and adopts the new blue/lime logo and palette; the designer supplies artwork; **leave
    SriMart's palette as it is**, so a second-vendor check must compare the accent colour.
    Staging Aheed has a saved theme, "Aheed brand kit — original green", to switch back to.
    **Production's backup of its live palette is a user-run command not confirmed as done.**
  - **Never validated against a real bucket.** The dev bucket has no CORS rule for `localhost`, so
    the browser upload cannot run under `npm run preview`, and the dev CDN rejects a localhost
    referer, so images never load there. The staging and production buckets do allow `PUT` from
    their own origins (preflight checked 2026-10-13). **The first real upload on staging or
    production is the first end-to-end test**; R16 (SriMart upload) and the live image-request rows
    (R18/R20) were not run.
  - Trap met while validating: a DB key written without the `/512.png` suffix is rejected by
    `markFileKeys`, so every icon silently disappears. Seed a mark through the uploader, not by hand.
  - Follow-ups, all Backlog: `#1071` (product Open Graph image), `#1072` (footer logo variant),
    `#1073` (remove a mark; clean up superseded uploads).
- **Storefront footer (`#1055` + `#1060`) and privacy cookie list (`#1064`): DONE, in production**
  (PR #1059, #1063, #1067 to `staging`; promotion PR #1068, merge `b38b0f1`, 2026-10-12;
  `deploy-production` run `38273458012` success). All three closed and `Done`. Specs:
  `specs/2026-10-12-p1055-storefront-footer/`, `specs/2026-10-12-p1060-footer-hours-contact/`,
  `specs/2026-10-12-p1064-privacy-cookies/`. Their own `/document` passes were deferred until the
  promotion; this entry and the roadmap row are that record.
  - **Production's footer seed is unconfirmed.** Run `scripts/seed-footer-defaults.ts` (footer-only,
    fill-only) against production if its footer is empty. **Never run the full `npm run db:seed`
    against staging or production**: its `upsertVendorSatellites` reverts admin-edited branding.
  - Placeholders (`[YOUR EMAIL]`, `[NUMBER]`, `[PLATFORM NAME]`, placeholder badge SVGs) are
    approved until the owner supplies real values (`#1058`).
  - Durable cookie fact (`#1064`): the session cookie is Better Auth's default,
    `better-auth.session_token` (`__Secure-` prefix over HTTPS). The storefront sets `store_cart`,
    `store_cookie_consent`, `delivery-postcode`, `fulfilment-method` and, only on `?ref=` after
    Accept All, `store_referral_code`, plus the `store_checkout_details` localStorage key (renamed
    from `aheed_*` by `#1080`; names live in `lib/storage-keys.ts`, with a 30-day legacy fallback
    removed by `#1106`). `admin-tier` is staff-only and unlisted.
  - Open: `#1056`, `#1057`, `#1061`, `#1062`, `#1065` and `#1066` (both closed by PR
    #1108 / #1109 — the referral cookie now waits for Accept All, and the live `Set-Cookie` check is
    recorded on `#1066`).
- **Help assistant follow-ups (`#1049` + `#1051` + `#1052`, one slice): DONE, in production**
  (PR #1050 to `staging`, then promotion PR #1053, merge `c903f15`, 2026-10-11), all three closed
  and `Done`. Spec: `specs/2026-10-11-p1049-assistant-link-close/` (no `build-notes.md`; the loop
  ran in one Opus 5.5 session with no fresh-context Validate, by owner's choice).
  - The rule now in force: **with the assistant available (`assistantEnabled` and a WhatsApp
    number), WhatsApp is reached through the assistant**, both on the floating contact button and
    on `/help`'s "Still need help?" card (`components/assistant/HelpContactCard.tsx`); with it off,
    both show a direct WhatsApp link; with no WhatsApp number, neither. Admin guide 2.9.0.
  - In-panel links close the panel (`#1049`). Proved by a unit test shown to fail without the fix;
    **not yet clicked in a real browser.**
- **Guided help assistant + conversation log (`#1015` + `#1014`, one slice): DONE, in
  production** (PR #1044 to `staging`, then promotion PR #1047, merge `0311425`, 2026-10-11), both
  issues closed and `Done`. **Production state read live 2026-10-11 after PR #1053: Aheed has
  it ON, SriMart OFF** (the switch is the owner's, at `/staff/assistant`). Spec, build notes:
  `specs/2026-10-11-p1015-1014-help-assistant/`.
  - **Validated from a fresh context (Opus 5.5, by owner's choice), no defect found.** Proved live
    under `npm run preview`: the three journeys log `ANSWERED`/`HANDED_OFF`/`ABANDONED`; a
    signed-in shopper's order picker matched their five newest orders; with the switch off,
    SriMart's three actions return `null` and write nothing when called directly; a forged
    `question` field is ignored on the wire; the STAFF form replay changes nothing. **One row is
    code-read only:** `/staff/assistant`'s empty state, because the only vendor with no rows is
    SriMart, whose admin gets the known local 403 at sign-in.
  - Owner's Gate 1 rulings (2026-10-11, recorded on both issues): guided topics only, **no AI and
    no free text**; answers from computed facts plus the vendor's active `VendorFaq` rows; WhatsApp
    handoff with a 300-character, PII-free summary; item swaps and paid-order cancellations always
    hand off; `VendorConfig.assistantEnabled` **off by default for every vendor**; a log with no
    user link; an admin-only `/staff/assistant` report.
  - **`#1021` no longer blocks the chatbot** (comment on `#1021`): with zero FAQ answers the
    assistant still answers delivery, collection, rewards and discount codes from data and hands off
    the rest. `#1021` stays open and owner-gated, best written from the report once the assistant
    has run on one vendor.
  - **Switching it on** is `/staff/assistant` per vendor (needs a WhatsApp number; both
    production vendors have one). Aheed's owner has done so; SriMart's has not.
  - Follow-ups filed at this slice: `#1041` (privacy page omits the search-query log) **shipped
    and is now DONE in production** — see Club C above. `#1043` (`/orders/lookup` placeholder
    shows Aheed's `AHE-` prefix on every vendor) and `#1045` (from Validate: `/help` and the
    assistant both said points expire "N months after you earn them", contradicting
    `isLapsed()`'s inactivity-based lapse) **both shipped to `staging`** — see Last Verified
    above (PR #1127, `85cfead`). Only `#1042` (grounded free-text answers) is still open,
    `Backlog`/`P10`.
- **Public docs boundary + loyalty-gated Rewards launcher (`#1022` + `#1023`): DONE, in
  production** (PR #1036 to `staging`, then promotion PR #1039, merge `dadca17`, 2026-10-11), both
  issues closed and `Done`. See **Last Verified** above for the production facts. Spec and build
  notes: `specs/2026-10-10-p1022-1023-public-docs-rewards-gate/`; the rule:
  `docs/developer-portal/app-conventions.md` 1.8.0.
  - **Staging cannot show `#1023`'s loyalty-off case: staging's SriMart has loyalty ON**, so its
    launcher correctly renders there. Dev and production have SriMart at loyalty off.
  - Follow-ups, all `Backlog` / `P10`: `#1034` (rewards data, including a referral code, is still
    built on every signed-in render for loyalty-off vendors), `#1035` (what the `shopper` audience
    tag means on internal articles), `#1037` (local full-suite timeouts).
- **Chatbot prerequisites, slice 2 (`#1016` + `#1017`): DONE, in production** (PR #1032 to
  `staging`, then promotion PR #1033, merge `a0ea21e`, 2026-10-10), both issues closed. See
  **Last Verified** above for the production facts. Spec and build notes:
  `specs/2026-10-10-p1016-1017-ai-model-config-metering/`; shipped behaviour:
  `specs/architecture.md` ("AI does not sit on a public request path"). **Validated from a fresh
  context — no defect found**; R35–R37 were proved live against the dev database. Per-vendor
  metering is live in production with every vendor on the default 3,000-neuron budget.
  Follow-ups, all `Backlog` / `P10`: `#1027` (gemma switch and timeout), `#1028`, `#1029` and `#1031`
  (**merged to `staging` in PR #1160**, see Slice C), `#1030` (campaign prompt hardcodes "UK
  grocery"; **fixed by PR #1097, in production since PR #1099**, closed). **Cloudflare silently serves the
  deprecated llama id from `llama-3.1-8b-fast-v2`** (commented on `#1016`).
- **Chatbot prerequisites, slice 1 (`#1013` + `#1012`): DONE, in production** (PR #1024 to
  `staging`, then promotion PR #1025, merge `b1dd2d4`, 2026-10-10), both issues closed and `Done`.
  See **Last Verified** above for the production facts; not repeated here. Spec/build notes:
  `specs/2026-10-10-p1013-1012-help-facts-faq-corpus/`. **Validated from a fresh context against
  all 25 requirements — no defect found in the artifact**, two spec/check mismatches (an
  explanatory comment tripping a literal `grep` for a banned string, same class
  `specs/sdd-workflow.md` already documents extensively) and one pre-existing unrelated finding
  (`#1023`, see Risks And Blockers). The `getPrismaWs()` wiring the build notes flagged as the
  single biggest unproven risk **was proven live**: the full create/edit/hide/reorder/delete cycle
  on `/staff/faqs` was driven over the real Next.js Server Actions wire protocol as a signed-in
  vendor admin, not just a standalone script.
  - **The whole chatbot programme is `High` / `P10` on the board:** `#1012`/`#1013` and
    `#1016`/`#1017`, `#1022` and `#1014`/`#1015` now closed; **only `#1021` remains High**, and it
    is owner work.
  - Sequencing: slices 1–3 are all in production; **slice 3 = `#1015`+`#1014` shipped 2026-10-11**
    (see the first entry in this section). The owner ruled on 2026-10-11 that `#1021` does **not**
    gate it.
  - **`#1021` is owner work, not code**, and none is seeded: the answers are vendor content
    `ADR-004`/`#239` forbid the platform writing. It no longer makes the chatbot inert, because the
    guided assistant also answers from computed facts; it limits coverage, not function.
  - **`#1022` was reopened** after this slice's promotion auto-closed it (see the `b1dd2d4` entry in
    Last Verified). Its remaining work shipped in PR #1036/#1039; see the entry above.
  - The dev-DB migration workaround this slice used (`#895` still blocks `prisma migrate dev
    --create-only`) is the same recipe prior slices have used; staging and production got the
    migration from CI as normal.
- **Mobile finish (`#981`/`#982`): DONE, in production** (PR #1009 to `staging`, then promotion
  PR #1019, merge `6a35f4a`, 2026-10-10), both issues closed and `Done`. See **Last Verified**
  above for the production facts; not repeated here. Spec/build notes:
  `specs/2026-10-06-p981-982-mobile-finish/`. **Validated from a fresh context against all 22
  requirements — no defect found in the artifact.** The findings below are the durable ones.
  - Owner choice at Gate 1: the logo-less wordmark **shrinks and truncates**; the name stays
    visible at every width. No schema change; `lg`+ is unchanged throughout.
  - **`#982`'s filed repro was stale and the issue text was wrong on two points.** It said no
    production vendor is logo-less — SriMart **is**, read live 2026-10-06. And its 382px overflow
    with `Aheed Food Centre` no longer reproduced: that case measures 360/360, because the header
    changed after slice 5 observed it. The defect was real but needed a **longer** name — a
    36-character logo-less name rendered a requested 360px viewport at **477px** before the fix,
    exactly 360/390 after. Confirmed live on dev with a temporary `VendorBranding` fixture
    (cleared and restored immediately; the restore was blocked for Bash auto mode and run by the
    owner with `!`, as `plan.md` anticipated).
  - **`scripts/verify-mobile-layout.ts` gained `--sign-in <email>:<password>`**, which every later
    mobile slice touching a signed-in surface will want. Before it, the script was always a guest
    on a throwaway profile, and desktop Chrome cannot go below 501px — so a session-gated control
    could not be measured at a phone width by anything. **Validate found a gap in it, not in the
    shipped code:** combined with `--open-quick-view`, it can silently measure Quick View's
    signed-out branch instead of the signed-in one it was asked for, because that surface's review
    form loads over a client fetch (unlike the product page's SSR-gated one) and the fetch can lose
    a race against this machine's `wrangler dev`/Neon instability. Tracked as `#1010`
    (`docs/developer-portal/local-dev-playbook.md` 1.23.0 has the detail); not fixed here.
  - Follow-up filed at Build: `#1008` (the product review form is implemented twice, which is why
    `#981`'s defect existed on two surfaces). Backlog, P10.
- **Referral and discount-code integrity (`#991`/`#987`/`#988`): DONE, in production** (PR #1005 to
  `staging`, then promotion PR #1006, merge `d9fac95`, 2026-10-06), all three issues closed. See
  **Last Verified** above for the production facts (the backfill measurement, R15/R25 live proof,
  the deploy-production flake-retry incident). Spec/build notes:
  `specs/2026-10-06-p991-987-988-referral-code-integrity/`. Follow-ups filed, staying open:
  `#1003` (caller-IP resolution copied into four throttle/rate-limit services rather than shared)
  and `#1004` (the data-rights export and staff screens don't surface a referral code's owner).
  - The dev database's `migrate dev --create-only` still demands a reset (`#895`) — this slice
    worked around it non-destructively with `migrate diff` against the datasource, then
    `migrate deploy`; still unfixed for the next slice that touches the schema.
  - The next slice the owner named, `#981` + `#982` (mobile finish), is now built — see the
    In-Flight entry above it.
- **The mobile programme is the owner's chosen direction (2026-10-02).** It comes from the seventh
  Discover pass, `docs/research/discovery-log.md` 1.7.0, merged to `staging` via PR #963. Its
  issues are `#955`–`#962`, all Phase P10.
  - **Slice 1, `#960`/`#961`/`#962` (mobile browse density):** **in production** (PR #965, then
    promotion PR #970, 2026-10-03, `main` at `20ff789`), issues closed. Its additive migration
    (`20261002120000_p962_product_grid_density`) is applied in production. SriMart's admin save
    through its own UI was never run (local sign-in is refused); see the roadmap row dated
    2026-10-03.
  - **Slice 2, `#958`/`#959` (mobile checkout):** **in production** (PR #969, then promotion PR
    #970, 2026-10-03), issues closed. No schema or server change. Spec:
    `specs/2026-10-03-p958-959-mobile-checkout/`.
    - Validation found no defect. Not seen live: the signed-in loyalty note string. Real-device
      autofill (iOS Safari, Android Chrome) is post-deploy evidence, with no issue.
    - Follow-ups: `#966`, `#968` (`#967` was built as part of slice 3).
  - **Slice 3, `#956`/`#967` (honest add-to-cart feedback; checkout total includes a pre-filled
    code):** **in production** (PR #974, then promotion PR #976, 2026-10-03, `main` at
    `9e2afac`), issues closed. No schema change. Spec:
    `specs/2026-10-03-p956-967-add-feedback-referral-total/`.
    - Validation found no defect; the live proof ran against the dev database, and a
      `PENDING_PAYMENT` fixture order from it remains there.
    - Follow-ups: `#972` (self-referral not refused), `#973` (live preview of a typed code and of
      points).
  - `#957` (reorder notices) was not layout work but shipped in slice 6 and is closed.
  - **Slice 7, `#955`/`#996`/`#994` (crawlability): DONE, in production** (PR #999 to `staging`,
    then promotion PR #1000, merge `c944c68`, 2026-10-05), all three issues closed. See **Last
    Verified** above for the production facts (the `Allow: /` live proof, the trust-boundary
    incident, the GitHub Actions runner incident). Spec/build notes:
    `specs/2026-10-05-p955-996-994-crawlability/`. No schema change. Validated from a fresh context
    against all 42 requirements — no defect found in the artifact. **Two real bugs found in
    `scripts/verify-crawlability.ts` itself** (R3 undercounts a category's subtree; R29 doesn't
    HTML-entity-decode before comparing titles), filed as **`#1001`**, not fixed here. Follow-ups
    `#997`, `#998`, `#1001` stay open. **This is the seventh and last slice of the mobile
    programme** — see the dedicated bullet above on why that is not a phase closure.
    - **`SEO_INDEXABLE` is set nowhere yet**, so `/robots.txt` serves `Disallow: /` on every
      environment including local preview. That is correct by design — production gets it from
      `[env.production.vars]` in `wrangler.toml` on deploy — but validating the `Allow` path needs
      it in `.dev.vars` and a preview restart. See `docs/developer-portal/env-setup.md` 1.16.0.
    - **The one signal that the headline defect is fixed is `https://srimart.nocaped.com/robots.txt`
      returning `Allow: /` after promotion.** It serves `Disallow: /` in production today, which is
      what de-indexed every vendor but Aheed, and no local check can prove the deployed binding.
    - Found and filed at this slice, not fixed by it: **`#997`** (`StorefrontChrome` falls back to
      Aheed's staging host when a request carries no `Host` header, so referral links can name the
      wrong vendor — it also blocks adding a host literal to the vendor-neutral copy denylist) and
      **`#998`** (**Gate 2 has no CI enforcement at all**; `hooks/pre-commit` is the only check, and
      a clone that never ran `scripts/bootstrap.sh` has none — recorded in
      `docs/developer-portal/sdd/operator-runbook.md` 1.1.0).
  - **Slice 4, `#964`/`#966`/`#968` (44px tap targets on the remaining storefront controls,
    header postcode autofill, shopper-guide discount copy):** **in production** (PR #980, then
    promotion PR #986, 2026-10-05, `main` at `656a441`), issues closed.
    No schema or server change. Spec: `specs/2026-10-04-p964-966-968-mobile-tap-targets/`.
    - Validation found no defect in the artifact. Two requirements were amended at Build (R10's
      viewport check, R11's cap raised to 60 by the owner) and one reworded at Validate (R9). The
      baseline measurements are in that folder's `baseline/`. R11 has only 4px of headroom on
      Aheed at 390, so any added row above the product grid fails it.
    - Not verified: the homepage rows' scroller arrows, the department row's arrow placement, and
      real-device tap and autofill behaviour. Follow-up `#979` holds the first two and the controls
      this slice left out.
  - **The owner approved three more bundled slices on 2026-10-04** (Gate 1 recorded as a comment on
    each issue): **slice 5** `#979` + `#655`; **slice 6** `#973` + `#957` + `#753` + `#972`
    (checkout preview of a typed code and points, a reorder notice on `/cart`, the live R14/R18
    browser check, refusing a shopper's own referral code); **slice 7** `#955` (crawlability).
    `#665` (UI primitives) is a separate later track, one route group per PR.
    - **Owner ruling for `#955`:** the product card's title becomes a real `<a href>` to the product
      page again, with Quick View layered on top as a JavaScript enhancement. This deliberately
      reverses part of `#830`'s markup.
  - **Slice 5, `#979`/`#655` (remaining tap targets; no broken-image icons on the storefront):**
    **in production** (PR #984, then promotion PR #986, 2026-10-05), issues closed. No schema or
    server change. Spec: `specs/2026-10-04-p979-655-storefront-finish/`.
    - Validation found no defect in the artifact. The header logo's fallback keeps the logo's
      footprint, not the wordmark the plan described (Deviation 1 in `build-notes.md`).
    - Not verified live: the Quick View gallery arrows (the dev product has one image) and
      `DepartmentHero`'s images (no dev data). Production's logo was never checked.
    - Follow-ups: `#981` (Quick View review-form controls), `#982` (logo-less wordmark overflows a
      phone header), `#983` (flaky add-to-cart test).
  - **Slice 6, `#973`/`#957`/`#753`/`#972` (checkout and cart honesty):** **in production**
    (PR #990, then promotion PR #993, merge `6dca917`, 2026-10-05), all four issues closed. No
    schema change. Spec and build notes:
    `specs/2026-10-05-p973-957-753-972-checkout-cart-honesty/`.
    - New standing rules in `docs/developer-portal/app-conventions.md` 1.5.0. Every `/checkout`
      money figure comes from `CheckoutPricingProvider`. A code is previewed only through
      `previewCheckoutCode`. `addCartItems` returns a per-line report and never lowers a line.
    - Validation found no defect in the artifact and drove every live row in Chrome, including
      `#753`'s R14 and R18. Not verified live: R14's re-check on a changed delivery fee (both fees
      were £0), which rests on the component test.
    - **`#991` was found load-bearing here** — the loyalty page's unawaited
      `ensureReferralDiscountCode` left no `REF-` row under preview, and the referral behaviour
      this slice shipped reads exactly those rows. **Now resolved and verified**: the `d9fac95`
      promotion in Last Verified above fixed the creation path and proved it live (R15). `#989`
      (the bundle notice could use the new report) stays open.
    - Follow-ups `#987`/`#988`/`#991` all shipped — see the `d9fac95` promotion in Last Verified
      above.
  - **Phone-width measurement now exists:** `scripts/verify-mobile-layout.ts`, using headless Chrome
    over CDP. Desktop Chrome can't go below 501px, and the app forbids framing. Its traps are in
    `docs/developer-portal/local-dev-playbook.md` 1.16.0.

- **The `#618` stranded-payment sweep never ran anywhere until 2026-09-29.** It shipped in P9.2,
  but `JOB_INVOCATION_TOKEN` had never been set on any Worker, and it was in neither
  `secrets/*.vars` file. The owner set it on all four Workers under **`#947`**; production's first
  ticks returned **401** (the two Workers held different values) until both were re-set. **`#947`
  is CLOSED** (2026-09-30): production's 08:00 UTC tick returned `ok` on all three jobs.
  **Lesson:** a scheduled job that needs a secret on two Workers can ship green and never run;
  nothing alerts. `#946` adds a job-run heartbeat for exactly this.
- **`#945` (payment reconciliation hardening, absorbing `#619`/`#620`) is DONE, in production**
  (PR #950 to `staging`, promoted by PR #953, `ee6eccb`, 2026-09-30; `#945`/`#619`/`#620` closed).
  The `#618` sweep claims each order on a `PaymentReconciliation` row, backs off and exhausts, and
  records what it concluded; production ticks log the seven-key summary. **Unverified:**
  `/staff/payments`'s empty-state text and second-vendor isolation (`#951`). Spec
  `specs/2026-09-29-p945-payment-reconciliation-hardening/`; its `build-notes.md` holds the live
  evidence and deviations. `#946` (durable confirmation email + `JobRun` heartbeat) is slice B,
  sequenced after it. Follow-ups `#948` (staff release for an exhausted order) and `#949` (a throw
  outside the provider call aborts the whole sweep run) are Backlog. **Trap:** a full `npx vitest run`
  writes fixture orders into the dev database (`#797`), which the sweep then processes; see
  `docs/developer-portal/local-dev-playbook.md` before running sweep rows.

- **`#935` (branch hygiene: `/prune-branches` + Orient reminder at 30 branches) is DONE, in
  production** (PR #937 to `staging`, promoted by PR #941, `924cf24`, 2026-09-29). Tooling only: no
  schema, runtime or UI change. Spec
  `specs/2026-09-29-p935-branch-hygiene/`; read its `build-notes.md` first. The rule and commands
  live in `scripts/branch-hygiene.ts`, `npm run branches:prune` / `branches:count` and
  `.claude/commands/prune-branches.md`.
  - **The owner has not yet run the first real prune.** Nothing has ever been run with `--apply`
    against this repo. Run `npm run branches:prune` (dry run), read DELETE and REVIEW, give an
    explicit yes, then `-- --apply`. `#722` and `#725` are open PR heads: they stay in REVIEW, and
    deleting either branch closes its PR.
  - **Measured 2026-09-29: the dry run shows DELETE 0, REVIEW 40.** Every branch outside the newest
    12 reads as `not merged`, because squash-merged branches are not ancestors of `origin/staging`.
    So `--apply` would delete nothing today. That is tracked as `#942`; fix it before the owner's
    first real prune is worth running.
  - Even after a prune, about 37 local and 32 origin branches stay, because the unmerged and
    open-PR REVIEW branches are protected. The `/orient` reminder keeps firing until the owner
    decides on them. That is expected, not a defect.
  - **`#938` and `#939` are DONE, in production** (PR #943 to `staging`, promoted by PR #953,
    `ee6eccb`, 2026-09-30; both closed). `#938` is a 30-second timeout on the `vendor-neutral-copy`
    scanning test; `#939` puts a local branch checked out in a worktree under REVIEW instead of
    failing `--apply`. Spec `specs/2026-09-29-p938-939-local-tooling-fixes/`.
  - Follow-ups: `#936` (owner decision: GitHub's "Automatically delete head branches" setting) and
    `#942`.

- **`#928` (product description as net-content evidence, refs `#697`) is DONE, in production via
  PR #933 (`91b1d8e`)** — the rest of this bullet is its staging-layer record. See `Last Verified`
  above for the full Validate/Ship/promotion record. Spec
  `specs/2026-09-28-p928-net-content-description-evidence/`; read its `build-notes.md` first. One
  additive migration (enum value `DESCRIPTION`), applied through to production.
  - **`#901` is UNPAUSED** (the owner-approved pause from Gate 1, 2026-09-28, was scoped to "until
    `#928` reaches production" — that condition is now met). Next owner action: review the 25
    PENDING rows already on production, run `scripts/suggest-net-content.ts --env-file
    secrets/production.vars --include-attempted` once via `!` (~12 NO_ANSWER products, now
    retryable against the description), then the button walks the ~45 never-attempted products.
    This has not yet been re-verified live — confirm the pause is actually lifted (no code gate
    enforces it; it was a process decision) before running a production batch.

- **`#927` ("Suggest net content" staff button) is DONE, in production via PR #930 (`1297f02`)** —
  the rest of this bullet is its staging-layer record. See `Last Verified` above for the full
  Validate/Ship/promotion record. Spec `specs/2026-09-28-p927-net-content-suggest-button/`; read its
  `build-notes.md` first.
  - **Why it exists: the `#901` production pilot, 2026-09-28.** The owner ran two batches with
    `!` from this session, because auto mode refuses production-DB commands even after chat
    approval. Results: 35 Aheed products attempted, 25 PENDING suggestions (all literal
    name/unit-label matches), 10 NO_ANSWER (all correct by design), 0 failed, ≈174 neurons. Recorded
    as two comments on `#901`. The 25 PENDING rows still await staff review on production
    `/staff/net-content`; the remaining ~45 unattempted products can now be picked up through the
    button in production instead of a further CLI batch.
  - **Filed:** `#928`, sending the product description as evidence. Three pilot products (Coconut
    Milk, Croissants, Eggs) state their size only there. Backlog, Phase P9.2.

- **`#917` is DONE, in production via PR #926 (`1bedf96`); `#918` stays `In Progress`** — the rest
  of this bullet is `#917`/`#918`'s staging-layer record. See `Last Verified` above for the full
  Validate/Ship/promotion record. Spec
  `specs/2026-09-27-p917-918-brand-delete-filter-followups/` — read its `build-notes.md` first.
  Brand deletion; LIST/NUMBER vendor filters; multi-select via repeated `attr_<slug>`; `_min`/`_max`
  ranges; `showOnCard`; search over option names.
  - **The migration, `20260927140000_p918_attribute_kinds_numbers`, is now applied through to
    production** (dev, staging and production schemas aligned).
  - **The local `staging` branch in this checkout is stale (pre-`#912`).** Diff against
    `origin/staging`; a `prisma migrate diff` from local `staging` re-creates all of `#912`'s tables.
  - Board: `#917` `Done`; `#918` stays `In Progress` (item 5 is owner action, not code). Filed:
    `#922` (SriMart production filter data, owner action), `#923` (deferred follow-ups). `#918`
    closes only once item 5 is done too.

- **`#912` (vendor-defined product filters, folding `#601` and `#916`) is DONE, in production via
  PR #921 (`646f14d`).** The rest of this bullet is its staging-layer record. See `Last Verified`
  above for the full Validate/Ship record. Spec:
  `specs/2026-09-27-p912-vendor-defined-filters/`; read its `build-notes.md` first for the Build
  record.
  - **Filed from Build:** `#917` (the staff guide promises brand removal, and no control exists) and
    `#918` (filter follow-ups deferred from `#912`). `#538` gained two more full-suite timeout files.
  - Board: `#912`, `#601` and `#916` are `Done` (closed on PR #921).

- **`#729` slice 1 (vendor-neutral UI copy) is DONE, in production via PR #910 (`556e273`)** — the
  history below is its staging-layer record. Validated (every row
  of `specs/2026-09-26-p729-vendor-neutral-ui-copy/validation.md` confirmed live, including both
  local vendor hosts under `npm run preview`) and merged to `staging` (PR #908, merge `87ecdc1`,
  2026-09-26). Spec `specs/2026-09-26-p729-vendor-neutral-ui-copy/`; read its `build-notes.md` first
  for the Build-time record. No schema change. The standing rule it produced ("UI copy comes from
  the vendor or is neutral") now lives in `docs/developer-portal/app-conventions.md` with a
  CLAUDE.md pointer.
  - **Two `validation.md` wording gaps found live, not code defects — fixed on this Document-stage
    branch.** SriMart's local host needs its port (`srimart.localhost:8787`, matching the seeded
    `VendorDomain` row) or it silently falls through to Aheed's copy instead of failing loudly; and
    R11's repository-directory-wide diff check collided with R19's own legitimate
    `lib/repositories/vendor.ts` change. Both are now `docs/developer-portal/local-dev-playbook.md`
    entries (v1.8.0) so the next validator doesn't re-hit them.
  - **`#729` is closed** (promoted via PR #910).

- **`#729` slice 2 (`#905`, with `#907`) is DONE, in production via PR #915 (`f53913e`)** — see
  `Last Verified` above for the promotion; the history below is its staging-layer record.
  Per-vendor product labels/HMC (six new `VendorConfig` booleans gating the staff product form
  only, stripped server-side on a disabled save rather than cleared), a `storeDescription` that
  replaces the hardcoded grocery framing in three AI prompts, and vendor-sourced delivery-area/
  help-page examples. Spec `specs/2026-09-26-p905-vendor-product-labels/`; read its
  `build-notes.md` first for the Build, Fix and Ship/Document records. One additive migration
  (`20260926180000_p905_vendor_product_label_settings`), applied through to production.
  - **`#905` and `#907` are closed** (promoted via PR #915).
  - **One regression found at `/validate`, fixed at `/fix`:** a pre-existing test's mock of
    `lib/delivery-areas-service` predated R27's new `exampleDeliveryAreaForVendor` call and threw on
    every case; the missing mock was the root cause, not the production code — fixed there only.
  - **R35a (SriMart's own signed-in staff check) run live at this Document stage, closing the one
    row `/validate` had deferred.** `demo-srimart-admin@example.com` already existed on staging
    (since 2026-08-17, predating production's copy) with an unrecorded password; after the owner
    confirmed resetting it (`npm run demo:accounts -- remove` then `add`, which resets all five
    staging demo accounts to one password — there is no per-account password), `/staff/products/new`
    showed none of the six label controls and `/staff/delivery-areas` showed `RG` examples with no
    `MK`, both on `srimart-staging.nocaped.com`. Both staging demo passwords are now recorded in
    `secrets/staging.vars`/`secrets/production.vars` (`DEMO_SRIMART_ADMIN_PASSWORD`, reference-only,
    never pushed anywhere) rather than lost again.
  - **`#912`** (vendor-defined product filters for SriMart) is the owner-chosen next slice;
    **`#911`** (reference-data postcode coverage as one platform-wide list) is Backlog. **`#906`**
    (Open Food Facts for non-food vendors) stays Deferred.

- **`#900` is DONE, promoted to production** (PR #904, merge `a156039`, 2026-09-26) — see `Last
  Verified` and `Project Position` above; not repeated here. AI-suggested net content with image
  provenance, split from `#697`, which stays open. Spec
  `specs/2026-09-25-p900-ai-net-content-suggestions/`; read its `build-notes.md` first — it carries
  the Build-time record, a Validate pass's live re-proof, and the Document-stage reconciliation
  (PR #903).
  - **It carried a migration** (`20260925150000_p900_net_content_suggestions`, additive), applied
    to dev, staging and now production.
  - **R29's evidence gap (flagged in an earlier Validate pass as ungathered for lack of network
    access) is closed**: a later pass downloaded the same Nutella photo Build used for R27, uploaded
    it through the real presigned-upload flow, and the suggester correctly read `400 GRAM` off it
    with `evidenceSource: PHOTO` — this also closes R27's "image + reasoning-off is unproven" note.
  - **Reconfirmed live, out of scope for this slice**: dev's three `pg_trgm` trigram indexes
    (`20260820143949_p7_5de_order_search_trigram`) are missing despite `prisma migrate status`
    reporting that migration applied (`GAP-011`, pre-existing drift, needs its own `/propose`).
  - The production pilot is tracked in **`#901`** (now `In Progress`, P9.2). It is partly run: 35
    of ~80 products as of 2026-09-28. See the `#927` bullet above.
  - Gemma's reasoning-off finding is in `docs/developer-portal/runtime-pitfalls.md` (Workers AI
    section); the Windows-curl-presigned-PUT trap found while closing R29 is in
    `docs/developer-portal/local-dev-playbook.md` (v1.7.0).
- **Production demo accounts were incomplete (found and fixed 2026-09-25, at the owner's
  request).** `demo-srimart-admin@example.com` and `demo-store-admin@example.com` did not exist in
  production (`ep-young-glitter`). Both were created with the roster's roles: SriMart vendor ADMIN,
  and first-active-vendor (Aheed) ADMIN respectively. The other three demo accounts already
  existed and sign in with `DEMO_ACCOUNT_PASSWORD`'s local value.
  - The SriMart account's password is **different** and owner-chosen. It is not recorded in the
    repository.
  - `scripts/demo-accounts.ts add` would not have fixed a missing password on an existing account:
    it only sets a password when it creates the user.
  - Staging's demo accounts were not checked.

- **`#613`/`#890`/`#889` are DONE** — promoted to production via PR #898 (merge `9b1de27`,
  2026-09-25), production `/api/health` serving it, `db.ok: true`, `reference.drift: false`; the
  board shows all three Done. The bullet below is its pre-promotion history.
- **2026-09-24/25 — `#613`/`#890`/`#889` validated and merged to `staging`.** PR #896 (merge
  `e54ed44`, `staging`), spec `specs/2026-09-24-p613-delivery-areas-ranges-fees-refusals/` — read
  its `build-notes.md` first. `deploy-staging` and `deploy-docs-internal` both succeeded; staging
  `/api/health` served `e54ed44`, `db.ok: true`. In summary:
  - district lists/ranges on `/staff/delivery-areas`;
  - per-area delivery charge, minimum and free-delivery threshold as nullable overrides on
    `VendorDeliveryArea`, resolved by `lib/delivery-pricing.ts`;
  - `DeliveryRefusalCount` (out-of-area demand, no personal data).

  **It carries a migration, applied to dev at Build and confirmed still applied at Validate.**
  Deferred alongside it: `#888` (radius), `#893`, `#894`. Separate Backlog issues: `#891`
  (notify-me emails), `#892` (a £0-threshold doc contradiction), `#895`.
  - **Dev-database trap (`#895`), reconfirmed at this slice's own Build:** `prisma migrate dev
    --create-only` against dev refuses and offers a **reset** (checksum drift on
    `20260820200500_p8_image_needs_review`). Never accept it. Generate migrations with
    `prisma migrate diff --from-schema-datamodel <base schema> --to-schema-datamodel
    prisma/schema.prisma --script`, as `#876` and this slice did.
  - **A new curl-driving trap found at this slice's `/validate`** — a server action called
    directly with a `FormData` argument from inside a client `action={(fd) => ...}` closure (not a
    primitive-args direct call, not a plain `<form action={fn}>`) resists both curl techniques
    `docs/developer-portal/local-dev-playbook.md` already documented. Full detail and the
    workaround (a browser extension, or fall back to a plain-form sibling control when one exists)
    now lives there (v1.6.0) rather than here. Consequence for this slice: the CHECKOUT-source
    half of the out-of-area refusal count was proven live; the HEADER-source half stayed at
    unit-test-only proof (exact-assertion coverage, not re-driven live this session).
- **`#877` is DONE** — promoted to production via PR #887 (merge `3b85289`, 2026-09-24), production
  `/api/health` serving it; the bullet below is its pre-promotion history.
- **2026-09-23 — `#876`/`#878` shipped; `#877` was the one remaining slice in flight.** `/propose`
  (2026-09-23) split `#400` and `#697` into `#876`/`#878` and `#877`. `#876`/`#878` are now DONE —
  see Project Position and Last Verified above, not repeated here.
  - **`#877`** (net content for the generated demo catalogue, plus a backfill for rows already
    present) is **validated, fixed and merged to `staging`** (PR #885, merge `3425a36`, 2026-09-24;
    `deploy-staging` success, staging `/api/health` serving `3425a36`). **Not yet promoted to
    `main`**; the board shows it In Review. `/validate` found a real defect: the backfill's batch
    `$transaction` blew Prisma's 5s timeout (`P2028`), fixed in `5021bad`. The lesson is in
    `runtime-pitfalls.md`. The backfill only runs with `SEED_SCALE_PRODUCTS` set, which no env file
    sets. `#697` stays open for real products.
  - **Storefront HTML is not edge-cached** (measured production and staging, 2026-09-23; recorded in
    `specs/architecture.md`). `#400`'s async-stock item was dropped on that basis, and `#400`
    narrows to per-store counts, blocked on `#422`.
  - **The dev Neon endpoint changed:** the old dev endpoint's credentials were rejected on
    2026-09-23. `.env`/`.dev.vars` now point at `ep-dry-morning-zab7dx08` (owner-confirmed as dev,
    migrated through `#876`'s migration). Anything naming `ep-sparkling-paper-za3j7xza` as current
    dev is stale.
  - Filed from this loop, not in any slice: `#879` (HMC verified-on date accepts impossible days)
    and `#880` (the `next.config.mjs` comment claiming storefront edge caching).

- **`#861` (KMS enforcement foundation) is DONE — see Project Position and Last Verified above.**
  Promoted to production via PR #875 (merge `2ff3e79`, 2026-09-23). Spec at
  `specs/2026-09-22-kms-enforcement-foundation/`; the full technical narrative, every
  deliberate-break validation row and the Fix-stage root-cause writeup live in that slice's
  `build-notes.md`, not repeated here.
  - Repairs three broken KMS controls: the walker excluded no `graft/` (gitignored, untracked, so
    `kms:validate` scanned 1,281 files locally against ~628 in CI); `assemble.ts` never read a
    document's own `visibility`; and `trackFor()` returned the first matching branch, leaving
    `platform-admin` to fall through.
  - **The live symptom worth remembering:** the `#851` pilot's canonical orders document
    (`docs/operations-research/order-fulfilment-core.md`) was routed to the *public* site by its
    `shopper` audience and was therefore absent from the internal docs site entirely — the only
    deployed KMS surface. Nothing leaked only because `kms/site-public/` has no app or workflow.
  - **Numbers a future session will otherwise re-derive:** `ARTIFACT_INDEX.md` 212 → **195**;
    `kms:validate` now reports 195 valid / **422** slice-local / **15** uncovered / 0 failing (422,
    not 421 — the slice's own `build-notes.md` is itself slice-local, and the count above includes
    it); the coverage baseline is 15 files across 8 directories, not the 1,042 the strategy cites.
  - **U7 is resolved**: `requirements.md`, `validation.md` and `build-notes.md` in a dated slice
    directory are slice-local, carry no front-matter, and `kms:validate` now *fails* on one that
    does. This confirms the existing rule in `specs/sdd-workflow.md`; it did not change it.
  - **A real bug found and fixed at Validate, not before shipping — worth remembering as a class of
    trap.** `kms:check-generated`'s freshness check compared its rebuild against its own **pre-run
    disk snapshot** rather than the git-committed content, so running the check's *own prescribed*
    local verification sequence (`kms:build-index` then `kms:check-generated`) left
    `ARTIFACT_INDEX.md`'s footer dirty in `git status` even though the check itself reported
    everything current and exited 0. Never affected CI, which calls `kms:check-generated` alone
    from a clean checkout — only a hand-run sequence matching the validation row triggered it.
    Fixed in the same PR: `checkGeneratedArtefacts()` now reads and restores against
    `git show HEAD:<path>`, independent of anything that ran before it.
  - **A scope note for future Validate passes:** a Build-stage commit (`873cf58`, before this
    document existed in its `.27.0` form) touched `docs/model-handoff.md` itself — outside this
    slice's own stated scope (`kms/`, two generated artifacts, `quality.yml`, `tests/`). Neither
    `/validate` pass caught this at the time; it surfaced only when reading the merge diff at Ship.
    The content itself was benign (a status append, matching this file's own standing convention),
    so nothing was rolled back, but a diff-shape check that greps specific path prefixes can still
    miss a real out-of-scope file — worth eyeballing the full unfiltered `git diff --name-only`
    against a slice's stated scope, not just its named restricted paths.

- **KMS restructuring §24 Steps 1–4 are COMPLETE; the results are in `#863`, not in this repo.**
  Inventory, classification, gap analysis and migration map were produced 2026-09-22 and recorded
  on that issue deliberately — writing them as a repository document would have changed the very
  front-matter counts `#861` pins. **Read `#863` before specifying §24 step 5**; it carries the
  43-document living corpus, the class-by-class migration map, and the decisions still required.
  - **`#862` should land before the strategy is approved.** `kms-strategy-evaluation.md` v2.0.0 is
    still `status: review` and carries three wrong figures: `owner` is **0** of 212, not 1 (its
    measuring grep matched its own §10.3 worked example); the 1,042 baseline was machine-dependent;
    and §2.3 problem 1 mischaracterises the slice-local files, which shipped code now contradicts.
  - **U8 and G1 still have no safe default** and still gate step 6. U1 was investigated and needs
    no action: the repo name, README title and the multi-tenant apex all show the platform wears
    tenant #1's identity, there is no platform-level name, and ADR-004 contradicts "SRIMART".
  - Also filed from that analysis: `#864` (one slice has no `validation.md`), `#865` (the staff
    runbook bundles 2.5 MB of document bodies to render about eight), `#866` (stale
    `kms/site-public` layout).

- **`#841` (clickable star ratings with descriptive labels for product reviews) is DONE — see Last Verified above.**
  Promoted to production via PR #845 (merge `a579781`, 2026-09-21), carrying PR #842 (feature merge), PR #843 (custom descriptive labels),
  and PR #844 (docs-only Document (final) reconciliation). Issue #841 closed and moved to `Done` in Project #2.
  Replaces the product review rating `<select>` dropdown menu with an interactive, accessible 5-star rating input component
  (`components/product/StarRatingInput.tsx`) across both the Quick View drawer (`components/product/QuickViewDrawer.tsx`) and product reviews form
  (`features/reviews/components/ReviewForm.tsx`). Features click-to-rate (1–5), hover preview, keyboard navigation, semantic `<fieldset>`
  and `<legend>` structure, overlaid full-size radio inputs avoiding Chromium non-focusable form control errors, and custom descriptive
  rating labels ("Poor", "Fair", "Good", "Very Good", "Excellent"). Honors `motion-reduce:hover:scale-100 motion-reduce:active:scale-100`.
  17 tests passing across `tests/star-rating-input.test.tsx`, `tests/quick-view.test.tsx`, and `tests/review-form.test.tsx`. Deployed and
  verified live on production (`a579781`, `db.ok: true`).

- **`#818` and `#406` (customer feedback and reviews) are DONE — see Last Verified above.**
  Promoted to production via PR #822 (merge `684e828`, 2026-09-20), carrying PR #821 (feature merge)
  and PR #823 (CardStack 3D peel animation). Both `#818` and `#406` closed and moved to `Done` in
  Project #2. Features first-party customer feedback with signed-in submission, automatic
  verified-purchase badge derivation from completed orders, staff moderation at `/staff/feedback`
  (approve, reject, unapprove, bulk approve, notes), external review links management on
  `/staff/storefront`, landing page review display, data-rights erasure and export, and hashed-IP
  rate limiting.
  - **`#406` is superseded and its embedded-widget premise was rejected.** Google's Places API terms
    **forbid storing or caching review content**, requiring live billed requests on every page render;
    linking out via `VendorReviewLink` avoids external script injection, tracking cookies, and CSP changes.
  - **A correction to this project's own record:** `#406`'s body asserted the `Review` model has
    moderation. **It does not** — there is no status column and `features/reviews/submit-review.ts`
    publishes on submit, so **product reviews are unmoderated in shipped code.** Tracked as **`#819`**;
    `#820` carries `#818`'s two deferrals.
- **`#824` (vibrant card-stack review slider upgrade) is DONE — see Last Verified above.**
  Promoted to production via PR #826 (merge `4aab0c8`, 2026-09-20), carrying PR #825 (feature merge)
  and PR #827 (vertical 3D depth stacking, card-click navigation, arrow button removal). Closes `#824`
  to `Done` in Project #2. Enhances the landing page customer reviews section
  (`components/storefront/CustomerFeedbackCards.tsx` and `components/ui/CardStack.tsx`) with a rotating
  6-color lively pastel palette (each >= 4.5:1 contrast, WCAG AA compliant), prominent vertical 3D deck
  arrangement (`STACK_OFFSET_Y_PX = -22`, `STACK_OFFSET_Z_PX = -35`) where background cards clearly peek
  out above the front card, direct card-click navigation (front card advances, background cards bring to
  front), touch drag/swipe with live tilt, accessible keyboard handling, pagination indicator pills, and
  clean removal of arrow buttons per user refinement. Fully responsive down to 320px with zero horizontal
  overflow.

- **`#116` and `#806` (saved shopping lists + `/shop-your-list` quick-access) are DONE — see Last
  Verified/Project Position above.** Both promoted to production via PR #808 (merge `187b5eb`,
  2026-09-19), carrying PR #804 (`#116`) and PR #807 (`#806`). Each ran a fresh-context `/validate`:
  `#116`'s full local suite green (147 files / 1977 tests), every `validation.md` row confirmed
  live — `verify-saved-lists.ts` against dev Postgres (including `--prove-http`) and
  `npm run preview` under a real `demo-customer` session (paste → match → review → add-to-cart
  across all four resolution branches; save → reopen; the 20-list cap refusing a 21st save;
  cross-user 404); `#806`'s own live checks (5-item cap and ordering re-seeded and reconfirmed
  independently of Build's spot-check; singular/plural item-count text; guest/zero-list
  short-circuit; the three `/account/lists/<id>` outcomes) all under the same `demo-customer`
  session. **The DEV Neon branch was migrated separately**, before `staging`, via a local
  `prisma migrate deploy` so `#116`'s live script could run — dev, staging and production all
  reached compatible schema independently; do not infer one environment's state from another's.
  Re-encountered **#762** (already open, filed 2026-09-15) during this Document (final) pass:
  `specs/roadmap.md` itself carries pre-existing double-encoded em-dash/quote mojibake corruption,
  unrelated to this slice, now at 393 occurrences (was 389 at filing) — confirms the file is still
  accumulating more, not a stale one-time count. A duplicate issue (`#809`) was mistakenly filed
  before checking for an existing one and closed in favour of `#762`.
- **`#363` and `#811` are DONE — see Checkout/High-Priority Work above.** PR #813 merged the
  feature to `staging` 2026-09-19; PR #815 promoted it to `main` the same day (merge `a682177`),
  bundled with PR #810 (docs-only `#116`/`#806` reconciliation, already `Done`, just hadn't reached
  `main` yet). `deploy-production` confirmed success; production `/api/health` confirmed serving
  `a682177`. `VendorConfig.timezone` now exists (default `"Europe/London"`, additive migration with
  an idempotent backfill), resolved through `VendorProfile.timezone`; the checkout slot picker's
  wire format is now a bare `YYYY-MM-DD` calendar day end to end, replacing the browser-local-
  midnight instant that caused `#811`. A fresh-context `/validate` confirmed every row of
  `specs/2026-09-19-p363-vendor-timezone/validation.md` (R1–R33) except one spec-wording note (R11
  assumes an update action `discount-codes.ts` has never had, by pre-existing design — not a build
  defect). **`#811` was proven live in three environments, not just server-side**: on the same real
  machine (naturally BST, UTC+1), selecting today's date against currently-deployed (pre-fix)
  staging produced `fulfilmentDate = "2026-09-18T23:00:00.000Z"` — the exact wrong-day mechanism;
  the same action against this branch's local preview, then staging post-merge, then **production
  itself post-promotion**, each produced `fulfilmentDate = "2026-09-19"`. Also resolved a build-time
  "known-shaky" open question: `Intl.supportedValuesOf` **does** work on this workerd runtime —
  `/staff/fulfilment`'s timezone select renders all ~418 real IANA zones, not the 21-entry fallback.
- **`#764` and `#770`/`#771`/`#767` are DONE — see Last Verified/Project Position above.** Both
  promoted to production via PR #775 (`1e44533`, 2026-09-16); `#764`, `#767`, `#770`, `#771`,
  `#772` all closed. `feature/reference-coverage-reconciliation` and
  `docs/document-final-reference-coverage-reconciliation` already deleted, locally and remote.
- **The whole delivery cluster is DONE — see Last Verified/Project Position above.** `#401`, `#402`,
  `#748`, `#749`, `#750`, `#751` all shipped, closed, and are live in production (`d855e1f`,
  2026-09-15). `#613` was never part of it (citation error, corrected above).
- **`#755` and `#756` are both CLOSED** (2026-09-16) — see the resolved section below. The
  credential rotation happened and was verified end to end; this line previously said they remained
  open and unresolved.
- **Issue #737** (Staff/Admin delegation, Category Manager, Help Centre, Zero-review ratings) is
  **CLOSED** (2026-09-12), independently of and before this session's work.
- **PR #736** merged `staging → main` (`0d41faa`), promoting #733 and closing #582, #583, #589, #602, #638, and #683 to `Done`.
- **PR #732** merged `staging → main` (`b505d81`), promoting #714 to `Done`.
- **PR #725 and PR #722 — see Last Verified above.** Both still open, both now `CONFLICTING`, both
  superseded. This line previously said only "not re-verified live"; they have since been verified,
  and the answer is that neither is worth rebasing.
- **Merged and safe to delete** (locally and on the remote), not done by this session: the four
  branches already noted in the 2026-09-14 handoff (`feat/p401-shared-fulfilment-slots`,
  `feat/p613-address-lookup`, `feat/p402-express-sla`, `feat/p10-shared-fulfilment-state`), plus
  this session's own `feat/p10-fulfilment-config-and-checkout-fixes` and
  `fix/staff-nav-fulfilment-orders-adjacent`.

## P10 Delivery-Cluster — Resolved (was "Review Findings", 2026-09-14)

The three defects this section used to describe as live findings on staging are now **fixed and in
production** (`specs/2026-09-14-p10-fulfilment-config-and-checkout-fixes/`): the administrative
surface (`/staff/fulfilment`, `#750`), the CSP-blocked postcode lookup (now server-side, `#749`),
and the vendor logo upload's diagnosability (`#749`) — whose actual root cause turned out to be
`#755` (rejected R2 credentials in all three environments), not CORS or CSP as this section
previously suspected; see the dedicated section below. Kept here only as a pointer, not to
re-derive: read the spec directory above for what shipped and why.

## RESOLVED — was "Live Production Defect: R2 Storage Credentials" (`#755`, closed 2026-09-16)

**Kept as a pointer only. Do not re-derive this as a live defect.** This section described the R2
credential pair being rejected in dev, staging and production simultaneously, breaking every staff
image upload while the storefront looked perfectly healthy. It is fixed — see "The R2 credential
outage is resolved" above for what the fix actually required and why every local check said it had
already worked.

Two things that section recorded are worth keeping, because they outlive the outage:

- **`prisma/seed.ts` was blocked entirely**, even against an already-seeded database, because
  `refreshProductImages` threw before anything after it ran. That is resolved: the seed now
  completes with 26 successful `putObject` calls, which is the rotation proven through real
  application code rather than through a probe script. `#756` verified this and is **closed** — its
  own four criteria were executed, including a re-run proving idempotence and a checkout slot
  picker driven end to end under `npm run preview`.
- **The operational workaround is still in place and is still not seed data.** A full week of
  `VendorFulfilmentSlot` rows and the two canonical `Theme` rows were written **directly** against
  staging's database on 2026-09-15, via repository functions rather than the blocked seed. Staging
  therefore holds fulfilment data that no seed run produced. `#756`'s verification ran against
  **dev**; staging and production were deliberately not re-seeded, since nothing asked for it.
- **The browser-side symptom was a red herring worth remembering**: the upload failed with
  `"The upload could not reach storage: Failed to fetch"`, which reads like CORS. It was not. R2
  omits `Access-Control-Allow-Origin` on its own `403` error body, so the browser could not read the
  response and `fetch()` threw a bare `TypeError`. No CORS change was needed, exactly as predicted.


## Backlog Reconciliation Findings

Verified candidates, not instructions to close anything without re-checking:

- **#422 appears answered:** `specs/roadmap.md` records "single site now, multiple planned", while
  the issue and ADR-006 still call the business decision open.
- **#280 is obsolete:** its owner comment says `VendorPromotion` was deleted and the issue was
  superseded by P8.5b, but it remains open.
- **#423, #596 and #712 overlap:** all describe `kms/site-internal/next-env.d.ts` command-dependent
  churn; #712 identifies the broken ignore rule most precisely.
- **#174 is partially stale:** inline deletion handles superseded/removed images; only abandoned
  uploads remain.
- **#405's title is stale:** its contact-link half is Done; chat re-ordering is split to #695.
- **#397 is Done in code but inert in data:** #697 records the missing net-content values.
- **#472's title is stale:** both branches have active PR/status-check rulesets; only the
  approval-gate portion remains.
- **#421 is a stale umbrella candidate:** most constituents shipped or have independent issues.
- **#286 retains only its narrower database-backed fuzzy/performance question.** Its history says
  #565 chose AI correction, but current search recovery is deterministic.
- **#682 is intentionally open:** its reported error did not reproduce, although related cursor and
  read-amplification fixes shipped. #689 is the separately reproduced repeated-parameter 500.

Board Phase and GitHub milestone disagreed for #151, #422, #589, #602, #695, #696 and #697.

## Documentation Reconciliation

- `package.json` and `prisma/schema.prisma` still contain walking-skeleton descriptions.
  (`CLAUDE.md`'s own copy was corrected — the project is stated as P10 — by `#786`, 2026-09-17.)
- Architecture and tech-stack prose says "Pages/Workers" although the runtime is Workers only.
- `specs/architecture.md` says the storage port has five operations and no delete; the code has six,
  including `getObject` and `deleteObject`.
- `specs/design-system.md` says local `VendorDomain` values must not carry a port; `lib/tenant.ts`
  deliberately supports a port-qualified local fallback. (Relocated verbatim from `CLAUDE.md` by
  `#786`, 2026-09-17 — the discrepancy itself is unchanged, only where it's written down.)
- `deploy-production.yml` still cites the obsolete private-repository paid-plan explanation for no
  approval gate. The current decision is deliberate self-approval avoidance on a public repo.
- `specs/mission.md` still cites ISR although this Prisma/Workers stack cannot use Next ISR.
- **The hardcoded vitest suite baseline this bullet used to track no longer exists anywhere**
  (`#584`, closed by `#786`, 2026-09-17) — it was removed, not relocated, after going stale roughly
  twenty times. `CLAUDE.md` and `docs/developer-portal/local-dev-playbook.md` now document the
  forks-pool trap it existed to catch via a detection procedure instead of a recorded count. If you
  need the current count for some other reason, run `npx vitest run` alone (never beside or
  straight after a heavy build — see the forks-pool trap) and read its own summary line; three
  `it.skipIf(!DATABASE_URL)`-guarded files still report fewer tests in CI than locally, which is
  expected, not a discrepancy.
- ~~The roadmap says the internal KMS site went live behind Access; its deploy workflow says no
  public route is configured.~~ **RESOLVED 2026-10-16.** The roadmap was right and the workflow
  comment was the stale half: `kms/site-internal/wrangler.toml` carries an uncommented
  `[[routes]]` block with `custom_domain = true`, annotated `LIVE (2026-08-08)`, and the route
  answers. `.github/workflows/deploy-docs-internal.yml`'s header is corrected to say so and to
  point at `wrangler.toml` as the authority. **Verified unauthenticated:** both `/` and a deep
  link (`/dev/runbook/local-dev-playbook`) `302` to `nocaped.cloudflareaccess.com` with
  `auth_status: NONE`, and no document content comes through. **Re-check a deep link, not only
  `/`, after any Access policy change** — a policy scoped to the root alone would leave every
  document directly reachable, and Access does not gate a `*.workers.dev` URL at all, which is
  why `workers_dev` must stay `false`.
- **`#613` citation error, tracked as `#761`:** `specs/2026-09-13-p613-address-lookup/`, and rows in
  `specs/roadmap.md`, cite the real (unrelated, still-open) issue `#613` for the address-lookup
  feature that actually shipped. See Project Position above and `#761` for the full history and
  what needs correcting. Not fixed here — this handoff and `#761` are the record of it.

## Risks And Blockers

These are separate from, not a silent reordering of, the owner's High priorities:

- **`#1123` carries a hard date: 2026-11-03.** The `uk-location-reference` endpoint is a read
  replica while `UK_LOCATION_REF_DIRECT_URL` is the write path, so the monthly sync
  (`0 4 3 * *`) fails on that date. Nothing is broken before it, and the fix is one value the owner
  reads from the Neon dashboard — no code change. The only dated item in this list; everything else
  here waits on a decision rather than a clock.
- Hard launch inputs: #113 production Stripe live keys and #104 verified Resend sending domain.
  **`#104`'s blast radius is larger than "emails are not delivered", measured 2026-10-13:**
  `lib/auth.ts` sets `requireEmailVerification: true`, so a new customer cannot sign in until they
  click a link that cannot currently be delivered. **Customer registration is effectively broken in
  production, not merely degraded** — this is the first blocker to clear, ahead of `#113`.
- **Google sign-in does not complete in production** (owner-reported 2026-10-13). The code is
  correct and both credentials are set — the button renders only when they are. `baseURL` is derived
  **per request from the host** (`lib/auth.ts`), so each vendor host needs its own authorised
  redirect URI (`https://<host>/api/auth/callback/google`), and the OAuth consent screen may still
  be in "Testing", which admits only listed test users. **Both are Google-console actions, not
  code.**
- **Workers AI is metered per vendor in production since PR #1033 (`#1016`, `#1017`), but still
  runs on one account credential and one daily pool**, and the default model is still the
  deprecated `llama-3.1-8b-instruct` (now overridable by env; the switch is `#1027`). A failing
  `/shop-your-list` model now writes an `ErrorEvent`. **`#1028` is handled in code** (PR #1160,
  on `staging`): `WORKERS_AI_PLAN` defaults to Free, which adds a shared 10,000-neuron daily cap
  across every vendor. Nobody has yet confirmed which plan the account is actually on; if it is
  Paid, the owner sets `paid`. `#591` stays conditional: the model still answers today.
- Security/operations: #219 and #175 credential rotations; #436 demonstrated restore; #437 outbound
  alert delivery; #438 tested rollback; #246 persisted-log confirmation.
- Reproduced or live defects: #236 rapid cart-mutation ceiling, #689 repeated query parameters
  causing list-page 500s, #723 duplicate current collection links, and #655 missing-image fallback
  gaps.
- Launch evidence remains incomplete: #439 through #445, including no Playwright harness, UAT,
  accessibility validation, game day, exact-candidate verification or GO/NO-GO.
- ~~`#755` — every staff/admin image upload is broken in all three environments~~ **RESOLVED
  2026-09-16.** Rotated, both Workers redeployed, real uploads confirmed on staging and production.
  `#750`'s R15/R16 and `#756` are all unblocked and `#756` is closed. Kept as a crossed-out line
  rather than deleted because this was the single largest live defect the project has carried.
- #599 confirms `Cache-Control` did not create edge caching for search suggestions.
- Prisma migration generation repeatedly proposes deleting the hand-authored trigram indexes.
- The raw-SQL exception has no mechanical single-file enforcement (#676).
- Workers Logs remain at 100 percent sampling and must be reviewed before real traffic.
- The platform remains merchant of record for all vendors until ADR-005's Connect trigger is met.

## Requires Live Access

Not verified by the latest orientation:

- Whether production Stripe credentials are test or live.
- Resend domain verification and real external delivery.
- ~~Cloudflare Worker secret presence.~~ **ANSWERED 2026-10-16** — `wrangler secret list` for both
  Workers (the repo's own `CLOUDFLARE_API_TOKEN` works; the `wrangler login` OAuth token returns
  `Authentication error 10000` on this account). Staging and production each carry the identical 18
  names: `BETTER_AUTH_SECRET`, `CDN_BASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JOB_INVOCATION_TOKEN`,
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `S3_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT`,
  `S3_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `UK_LOCATION_REF_DATABASE_URL`. (`JOB_INVOCATION_TOKEN` parity was already answered by live `ok`
  ticks, 2026-09-30, `#947`.)
  - **Lead, NOT a diagnosis: `S3_REGION` and `BETTER_AUTH_URL` are absent from both Workers** — not
    secrets, and not `[vars]` in `wrangler.toml` either. `scripts/configure-env.mjs` lists both
    under `WORKER_SECRETS` (required), commenting that `BETTER_AUTH_URL` "is per-environment and
    OAuth/session break without it". That *may* bear on **"Google sign-in does not complete in
    production"** under Risks And Blockers, which currently attributes the failure to authorised
    redirect URIs. **This is a correlation found while listing secrets for `#1119`, not a tested
    cause** — `lib/auth.ts` derives `baseURL` per request from the host, which may make the
    variable redundant. Read `lib/auth.ts` and `lib/config.ts` before believing either story, and
    give it its own `/propose` rather than folding it into a sign-in fix.
- Whether the **#175** rotation happened outside GitHub issue state. (**#219** is answered: rotated,
  confirmed by the owner, GitHub secret timestamps post-date the exposure. Still unverified is
  whether the OLD token was deleted rather than merely superseded — a dashboard-only fact.)
- Neon plan limits, backup retention and an actual isolated restore.
- Persisted Workers Logs, alert-channel delivery and scheduler executions.
- Production/staging net-content row counts for #697. Production suggestion rows are known only
  from the `#901` pilot output (2026-09-28); populated `Product.netContentAmount` was not measured.
- ~~Whether the internal KMS Worker has an Access-protected route despite the workflow comment.~~
  **ANSWERED 2026-10-16: it does** — see Documentation Reconciliation above. The workflow comment
  was stale, not the roadmap.

Public health checks verified Aheed and SriMart staging/production Workers at the expected commits,
with `db.ok: true` and storage configured. That does not verify any item above.

## Fresh-Session Recovery

1. Read `CLAUDE.md`, then this handoff and `.claude/commands/orient.md`.
2. Read `specs/roadmap.md` sections P9 and P10. Treat this handoff as leads to re-check, never as
   newer authority than live state.
3. Run `git fetch --all --prune`, `git status --short --branch`, `git worktree list`, and compare
   `origin/main` with `origin/staging`.
4. List open PRs live (#722 and #725 are both obsolete — see Last Verified; do not reflexively
   re-read them), check #726, run `npm run sdd:audit`, and verify the protected
   checkpoint branch without modifying it. **There is no active DO-NOT-PROMOTE hold as of
   2026-09-15** — the one this handoff carried through 2026-09-14 was lifted when `#750`/`#749`
   shipped and `staging` promoted to `main` via PR #759. Compare `origin/main` with `origin/staging`
   live (step 3) rather than trusting that either state here — a new hold or divergence may exist by
   the time this is read.
5. Query Project #2 with `--limit 2000` (if the returned count equals the limit, it truncated —
   raise it); filter `Priority == High` and read Status, Phase and
   Complexity. Re-open issue bodies before accepting stale/duplicate findings.
6. Read `docs/research/discovery-log.md` for newer evidence touching the selected scope.
7. Verify health/deployment state and any scope-dependent secret, database or Cloudflare fact live.
8. Report discrepancies and stop at the current stage's approval boundary.

